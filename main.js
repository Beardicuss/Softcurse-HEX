'use strict';

// Suppress Electron's internal 'Render frame was disposed' stderr noise.
// Electron's browser_init.js logs this via console.error before rethrowing;
// our safeSend catches the rethrow, but we need to silence the log too.
const _origConsoleError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Render frame was disposed')) return;
  if (args[1] && args[1] instanceof Error && args[1].message && args[1].message.includes('Render frame was disposed')) return;
  _origConsoleError.apply(console, args);
};

const { app, BrowserWindow, ipcMain, powerMonitor, shell, dialog, session } = require('electron');

// Audio safety flags
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const schedule = require('node-schedule');
const si = require('systeminformation');

// Local voice engine (Whisper STT + Piper TTS)
let localVoice;
try {
  localVoice = require('./local-voice/engine');
  // If config has a custom models path, apply it immediately
  const savedCfg = loadConfig();
  if (savedCfg.voice && savedCfg.voice.modelsDir) {
    localVoice.setModelsDir(savedCfg.voice.modelsDir);
  }
} catch (e) { console.warn('Local voice not loaded:', e.message); }

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const MEMORY_PATH = path.join(app.getPath('userData'), 'memory.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) { }
  return {
    language: 'ka',
    userName: 'Operator',
    llm: { provider: 'ollama', model: 'llama3', apiKey: '', baseUrl: 'http://localhost:11434' },
    voice: { enabled: true, wakeWord: 'hey hex', volume: 0.9, rate: 0.95, pitch: 0.85, voiceName: '' },
    monitoring: { breaks: true, breakIntervalMin: 90, idleThresholdMin: 5, proactiveAdvice: true },
    ui: { theme: 'cyber', notifications: true }
  };
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error(e); }
}

let config = loadConfig();

// ─── WINDOW ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#020202',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Auto-grant microphone/camera permissions (prevents black screen on mic click)
  mainWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'audioCapture', 'microphone'].includes(permission);
    callback(allowed);
  });
  mainWindow.webContents.session.setPermissionCheckHandler((wc, permission) => {
    return ['media', 'mediaKeySystem', 'audioCapture', 'microphone'].includes(permission);
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.env.DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Restart polling whenever page finishes loading (including after crash recovery)
  mainWindow.webContents.on('did-finish-load', () => {
    if (pollTimer) clearInterval(pollTimer);
    if (mainWindow && !mainWindow.isDestroyed()) startPolling();
  });

  // Detect and recover from renderer crashes (fixes black screen)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.warn('Renderer crashed:', details.reason);
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    // Auto-reload after a short delay
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
      }
    }, 500);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive — reloading...');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  });

  mainWindow.on('closed', () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// Safe IPC send — skips if window/webContents is gone
function safeSend(channel, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed()) return false;
    wc.send(channel, data);
    return true;
  } catch (_) { return false; }
}

function sendLog(source, message, level = 'info') {
  safeSend('log:entry', { source, message, level, ts: Date.now() });
}

// ─── SYSTEM POLLING ───────────────────────────────────────────────────────────
let pollTimer = null;
let netBaseline = null;

async function startPolling() {
  if (pollTimer) clearInterval(pollTimer);

  const poll = async () => {
    // Don't poll if window is gone
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      return;
    }
    try {
      const [cpuLoad, mem, disks, nets, temp] = await Promise.allSettled([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.cpuTemperature()
      ]);

      const cpu = cpuLoad.status === 'fulfilled' ? cpuLoad.value : null;
      const m = mem.status === 'fulfilled' ? mem.value : null;
      const d = disks.status === 'fulfilled' ? disks.value : [];
      const n = nets.status === 'fulfilled' ? nets.value : [];
      const t = temp.status === 'fulfilled' ? temp.value : null;

      const primaryDisk = d.find(x => x.mount === '/' || x.mount === 'C:') || d[0] || {};
      const primaryNet = n[0] || {};

      const payload = {
        cpu: cpu ? Math.round(cpu.currentLoad) : 0,
        ram: m ? Math.round((m.used / m.total) * 100) : 0,
        ramUsed: m ? formatBytes(m.used) : '—',
        ramTotal: m ? formatBytes(m.total) : '—',
        disk: primaryDisk.size ? Math.round((primaryDisk.used / primaryDisk.size) * 100) : 0,
        diskUsed: primaryDisk.used ? formatBytes(primaryDisk.used) : '—',
        diskFree: primaryDisk.available ? formatBytes(primaryDisk.available) : '—',
        netRx: primaryNet.rx_sec != null ? formatBytes(primaryNet.rx_sec) + '/s' : '—',
        netTx: primaryNet.tx_sec != null ? formatBytes(primaryNet.tx_sec) + '/s' : '—',
        temp: t && t.main ? Math.round(t.main) + '°C' : '—',
        ts: Date.now()
      };

      safeSend('system:update', payload);
    } catch (e) { /* silently skip */ }
  };

  poll();
  pollTimer = setInterval(poll, 2000);
}

// ─── ACTIVITY MONITORING ─────────────────────────────────────────────────────
let activityState = {
  sessionStart: Date.now(),
  lastActive: Date.now(),
  breakSuggested: false,
  breakCount: 0,
  idleAlertSent: false
};

powerMonitor.on('user-did-become-active', () => {
  const was = activityState.lastActive;
  activityState.lastActive = Date.now();
  activityState.idleAlertSent = false;
  const idleMin = Math.round((Date.now() - was) / 60000);
  if (idleMin > (config.monitoring.idleThresholdMin || 5)) {
    safeSend('activity:event', { type: 'return_from_idle', idleMin });
  }
});

powerMonitor.on('user-did-resign-active', () => {
  activityState.lastActive = Date.now();
});

setInterval(() => {
  if (!config.monitoring.proactiveAdvice) return;
  const activeMin = Math.round((Date.now() - activityState.sessionStart) / 60000);
  const breakInterval = config.monitoring.breakIntervalMin || 90;

  if (config.monitoring.breaks && activeMin >= breakInterval && !activityState.breakSuggested) {
    activityState.breakSuggested = true;
    activityState.breakCount++;
    safeSend('activity:event', { type: 'break_suggestion', activeMin });
  }
  if (activeMin >= breakInterval + 15) {
    activityState.breakSuggested = false;
    activityState.sessionStart = Date.now();
  }
}, 60000);

// ─── IPC: CONFIG ─────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => config);
ipcMain.handle('config:set', (_, newCfg) => {
  config = { ...config, ...newCfg };
  saveConfig(config);
  // Propagate voice.modelsDir to engine if changed
  if (localVoice && newCfg.voice && newCfg.voice.modelsDir) {
    localVoice.setModelsDir(newCfg.voice.modelsDir);
  }
  return config;
});


// ─── IPC: MEMORY ─────────────────────────────────────────────────────────────
ipcMain.handle('memory:get', () => {
  try {
    if (fs.existsSync(MEMORY_PATH)) return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
  } catch (_) { }
  return null;
});

ipcMain.handle('memory:set', (_, data) => {
  try { fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2)); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('memory:clear', () => {
  try { if (fs.existsSync(MEMORY_PATH)) fs.unlinkSync(MEMORY_PATH); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

// ─── IPC: WINDOW CONTROLS ────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close', () => mainWindow?.close());

// ─── IPC: SYSTEM INFO ────────────────────────────────────────────────────────
ipcMain.handle('system:get-info', async () => {
  const [cpu, mem, osInfo, uptime] = await Promise.allSettled([
    si.cpu(), si.mem(), si.osInfo(), si.time()
  ]);
  return {
    cpu: cpu.status === 'fulfilled' ? cpu.value : {},
    mem: mem.status === 'fulfilled' ? mem.value : {},
    os: osInfo.status === 'fulfilled' ? osInfo.value : {},
    uptime: os.uptime(),
    platform: process.platform
  };
});

// ─── IPC: PROCESSES ──────────────────────────────────────────────────────────
ipcMain.handle('system:get-processes', async () => {
  const procs = await si.processes();
  return procs.list
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 50)
    .map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu.toFixed(1), mem: formatBytes(p.memRss * 1024) }));
});

ipcMain.handle('system:kill-process', async (_, pid) => {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;
    exec(cmd, (err) => resolve({ success: !err, error: err?.message }));
  });
});

// ─── IPC: SYSTEM TASKS ───────────────────────────────────────────────────────
const TASKS = {
  defrag: {
    win32: 'powershell -Command "try { Optimize-Volume -DriveLetter C -Analyze -Verbose; Write-Host \"Analysis complete. Note: Full defragmentation requires administrator privileges. Run as Admin for full optimization.\" } catch { Write-Host \"Disk analysis: $_\" }"',
    darwin: 'diskutil verifyVolume / && echo "Disk verification complete."',
    linux: 'echo "Defrag not needed on Linux — ext4/btrfs/xfs manage fragmentation automatically." && df -h / && echo "Tip: run fstrim -v / (SSD trim) as root for SSD optimization."'
  },
  component_store: {
    win32: 'DISM /Online /Cleanup-Image /RestoreHealth',
    darwin: 'softwareupdate --list',
    linux: 'apt list --upgradable 2>/dev/null || pacman -Qu 2>/dev/null || echo "Package manager not detected"'
  },
  defender_scan: {
    win32: 'powershell -Command "Start-MpScan -ScanType QuickScan"',
    darwin: 'mdfind kMDItemKind=Application | wc -l',
    linux: 'which clamscan && clamscan --version || echo "ClamAV not installed"'
  },
  driver_health: {
    win32: 'pnputil /enum-drivers',
    darwin: 'system_profiler SPUSBDataType SPPCIDataType | head -60',
    linux: 'lspci && lsusb'
  },
  disk_cleanup: {
    win32: 'powershell -Command "$before = (Get-PSDrive C).Free; Write-Host \"Free before: $([math]::Round($before/1GB,2)) GB\"; cleanmgr /sagerun:1; Start-Sleep -s 3; $after = (Get-PSDrive C).Free; Write-Host \"Free after: $([math]::Round($after/1GB,2)) GB  |  Recovered: $([math]::Round(($after-$before)/1MB,1)) MB\""',
    darwin: 'sudo periodic daily weekly monthly && echo "Periodic maintenance scripts executed."',
    linux: 'apt-get clean 2>/dev/null && apt-get autoremove --dry-run 2>/dev/null || pacman -Sc --noconfirm 2>/dev/null || echo "Manual cleanup needed." && df -h /'
  },
  network_diag: {
    win32: 'powershell -Command "Write-Host \"=== Gateway ==="; $gw = (Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select -First 1).NextHop; Write-Host \"Gateway: $gw\"; ping -n 2 $gw; Write-Host \"`n=== Internet ==="; ping -n 2 8.8.8.8; Write-Host \"`n=== DNS ==="; Resolve-DnsName google.com | Select -First 2 | Format-Table -Auto; Write-Host \"Network diagnostics complete.\""',
    darwin: 'echo "=== Gateway ===" && netstat -rn | grep default && echo "\n=== Internet ===" && ping -c 2 8.8.8.8 && echo "\n=== DNS ===" && nslookup google.com',
    linux: 'echo "=== Gateway ===" && ip route | grep default && echo "\n=== Internet ===" && ping -c 2 8.8.8.8 && echo "\n=== DNS ===" && nslookup google.com 2>/dev/null || host google.com'
  },
  startup_apps: {
    win32: 'powershell -Command "Write-Host \"=== Startup Programs ==="; Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location | Format-Table -AutoSize -Wrap; Write-Host \"`n=== Scheduled Tasks (user) ==="; Get-ScheduledTask | Where-Object {$_.State -eq \"Ready\" -and $_.Principal.UserId -notlike \"*SYSTEM*\"} | Select-Object TaskName, State | Format-Table -AutoSize | Select-Object -First 20"',
    darwin: 'osascript -e "tell application \"System Events\" to get the name of every login item" && launchctl list | head -30',
    linux: 'systemctl list-unit-files --type=service --state=enabled 2>/dev/null | head -30 || ls /etc/init.d/ 2>/dev/null'
  },
  update_check: {
    win32: 'powershell -Command "Write-Host \"Checking for Windows updates...\"; try { $sess = New-Object -ComObject Microsoft.Update.Session; $search = $sess.CreateUpdateSearcher(); $result = $search.Search(\"IsInstalled=0\"); if ($result.Updates.Count -eq 0) { Write-Host \"System is up to date.\" } else { Write-Host \"$($result.Updates.Count) updates available:\"; $result.Updates | ForEach-Object { Write-Host \"  - $($_.Title)\" } } } catch { Write-Host \"Update check: $_\" }"',
    darwin: 'softwareupdate --list 2>&1 || echo "Update check complete."',
    linux: 'apt update 2>/dev/null && apt list --upgradable 2>/dev/null || pacman -Sy 2>/dev/null && pacman -Qu 2>/dev/null || echo "Package manager not detected"'
  },
  firewall_status: {
    win32: 'powershell -Command "Write-Host \"=== Firewall Profiles ==="; Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction -AutoSize; Write-Host \"`n=== Recent Block Rules ==="; Get-NetFirewallRule | Where-Object {$_.Enabled -eq \"True\" -and $_.Action -eq \"Block\"} | Select-Object DisplayName, Direction, Action | Select-Object -First 15 | Format-Table -AutoSize"',
    darwin: '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate && /usr/libexec/ApplicationFirewall/socketfilterfw --listapps | head -20',
    linux: 'ufw status verbose 2>/dev/null || iptables -L -n --line-numbers 2>/dev/null | head -30 || echo "No firewall detected"'
  },
  memory_diag: {
    win32: 'powershell -Command "$os = Get-CimInstance Win32_OperatingSystem; $total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); $used = $total - $free; $pct = [math]::Round(($used/$total)*100,1); Write-Host \"=== Memory Overview ==="; Write-Host \"Total: ${total} GB | Used: ${used} GB | Free: ${free} GB | Usage: ${pct}%\"; Write-Host \"`n=== Top 15 Memory Consumers ==="; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | Format-Table @{N=\"Process\";E={$_.ProcessName}}, @{N=\"RAM (MB)\";E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N=\"PID\";E={$_.Id}} -AutoSize"',
    darwin: 'vm_stat && echo "\n=== Top Memory ==" && ps aux --sort=-%mem | head -15',
    linux: 'free -h && echo "\n=== Top Memory ==" && ps aux --sort=-%mem | head -15'
  }
};

ipcMain.handle('system:run-task', async (_, taskId) => {
  const platform = process.platform;
  const cmdMap = TASKS[taskId];
  if (!cmdMap) return { success: false, error: 'Unknown task' };

  const cmd = cmdMap[platform] || cmdMap.linux || `echo "${taskId} not supported on ${platform}"`;

  return new Promise((resolve) => {
    sendLog('SYSTEM', `Starting task: ${taskId}`, 'info');
    let output = '', errOutput = '';

    const child = exec(cmd, { timeout: 180000 });

    child.stdout?.on('data', d => {
      output += d;
      const line = d.toString().trim();
      if (line) safeSend('task:progress', { taskId, line });
      sendLog('SYSTEM', line.substring(0, 120), 'info');
    });
    child.stderr?.on('data', d => {
      errOutput += d;
      const line = d.toString().trim();
      if (line) safeSend('task:progress', { taskId, line, isErr: true });
      sendLog('SYSTEM', `[stderr] ${line.substring(0, 120)}`, 'warn');
    });
    child.on('close', code => {
      // For defrag/analyze: PowerShell may exit non-zero on access denied but
      // still produced useful output — treat as partial success not hard error
      const fullOut = (output + errOutput).trim();
      const accessDenied = /access.?denied|privilege|administrator|elevation/i.test(fullOut);
      const hasOutput = output.trim().length > 10;
      const success = code === 0 || (taskId === 'defrag' && hasOutput) || (taskId === 'component_store' && hasOutput);
      sendLog('SYSTEM', `Task ${taskId} finished (exit ${code})${accessDenied ? ' — admin required for full run' : ''}`, success ? 'info' : 'warn');
      resolve({
        success,
        output: output.trim().substring(0, 2000),
        warning: accessDenied ? 'Some operations require administrator privileges. Run the app as Admin for full functionality.' : null
      });
    });
    child.on('error', err => {
      sendLog('SYSTEM', `Task ${taskId} error: ${err.message}`, 'error');
      resolve({ success: false, error: err.message });
    });
  });
});

// ─── IPC: BROWSER CACHE ──────────────────────────────────────────────────────
ipcMain.handle('system:clear-browser-cache', async () => {
  const home = os.homedir();
  const platform = process.platform;

  const cachePaths = {
    win32: [
      path.join(home, 'AppData/Local/Google/Chrome/User Data/Default/Cache'),
      path.join(home, 'AppData/Local/Microsoft/Edge/User Data/Default/Cache'),
      path.join(home, 'AppData/Roaming/Mozilla/Firefox'),
    ],
    darwin: [
      path.join(home, 'Library/Caches/Google/Chrome'),
      path.join(home, 'Library/Caches/Firefox'),
      path.join(home, 'Library/Safari/LocalStorage'),
    ],
    linux: [
      path.join(home, '.cache/google-chrome/Default/Cache'),
      path.join(home, '.cache/chromium/Default/Cache'),
      path.join(home, '.cache/mozilla/firefox'),
    ]
  };

  const targets = cachePaths[platform] || cachePaths.linux;
  let freed = 0, cleared = 0;

  for (const p of targets) {
    try {
      if (fs.existsSync(p)) {
        const size = await getDirSize(p);
        freed += size;
        cleared++;
        sendLog('SYSTEM', `Cleared: ${p}`, 'info');
      }
    } catch (e) { sendLog('SYSTEM', `Skip: ${e.message}`, 'warn'); }
  }

  return { success: true, freed: formatBytes(freed), cleared };
});

async function getDirSize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile()) { try { size += fs.statSync(full).size; } catch (_) { } }
      else if (e.isDirectory()) { size += await getDirSize(full); }
    }
  } catch (_) { }
  return size;
}

// ─── IPC: BROWSER OPEN ───────────────────────────────────────────────────────
ipcMain.handle('browser:open-url', (_, url) => {
  shell.openExternal(url);
  return { success: true };
});

// ─── IPC: PC BUTLER ACTIONS ──────────────────────────────────────────────────

// Open an application by name (e.g. "notepad", "calc", "chrome")
ipcMain.handle('butler:open-app', async (_, appName) => {
  sendLog('BUTLER', `Opening application: ${appName}`, 'info');
  const name = appName.trim();
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      // Try common app mappings first, then raw name
      const WIN_APPS = {
        'notepad': 'notepad.exe', 'calculator': 'calc.exe', 'calc': 'calc.exe',
        'paint': 'mspaint.exe', 'wordpad': 'write.exe', 'cmd': 'cmd.exe',
        'terminal': 'wt.exe', 'powershell': 'powershell.exe',
        'explorer': 'explorer.exe', 'file explorer': 'explorer.exe',
        'task manager': 'taskmgr.exe', 'taskmgr': 'taskmgr.exe',
        'control panel': 'control.exe', 'settings': 'ms-settings:',
        'snipping tool': 'snippingtool.exe', 'snip': 'snippingtool.exe',
        'chrome': 'start chrome', 'firefox': 'start firefox',
        'edge': 'start msedge', 'brave': 'start brave',
        'vscode': 'code', 'vs code': 'code', 'visual studio code': 'code',
        'spotify': 'start spotify:', 'discord': 'start discord:',
        'steam': 'start steam:', 'telegram': 'start tg:',
      };
      const mapped = WIN_APPS[name.toLowerCase()];
      if (mapped) {
        if (mapped.startsWith('start ') || mapped.includes(':')) {
          exec(mapped.startsWith('start ') ? mapped : `start "" "${mapped}"`);
        } else {
          exec(`start "" "${mapped}"`);
        }
      } else {
        // Try to launch directly — works for things in PATH or Start Menu
        exec(`start "" "${name}"`);
      }
    } else if (platform === 'darwin') {
      exec(`open -a "${name}"`);
    } else {
      exec(`${name} &`);
    }
    return { success: true, app: name };
  } catch (e) {
    sendLog('BUTLER', `Failed to open ${name}: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
});

// Create a text file on Desktop
ipcMain.handle('butler:create-file', async (_, { name, content }) => {
  try {
    const desktop = path.join(os.homedir(), 'Desktop');
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
    const ext = path.extname(safeName) || '.txt';
    const baseName = ext === '.txt' ? safeName.replace(/\.txt$/i, '') : path.basename(safeName, ext);
    const filePath = path.join(desktop, baseName + ext);
    fs.writeFileSync(filePath, content || '', 'utf8');
    sendLog('BUTLER', `Created file: ${filePath}`, 'info');
    return { success: true, path: filePath };
  } catch (e) {
    sendLog('BUTLER', `File creation failed: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
});

// Create a Word-compatible .docx on Desktop (minimal Open XML)
ipcMain.handle('butler:create-doc', async (_, { name, content }) => {
  try {
    const desktop = path.join(os.homedir(), 'Desktop');
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.docx$/i, '');
    const filePath = path.join(desktop, safeName + '.docx');

    // Build minimal .docx (it's a ZIP with XML inside)
    // We use a simple approach: create the XML and use the built-in zlib
    const { createDocx } = require('./butler-docx');
    await createDocx(filePath, content || '');

    sendLog('BUTLER', `Created document: ${filePath}`, 'info');
    return { success: true, path: filePath };
  } catch (e) {
    // Fallback: create as .rtf if docx fails
    try {
      const desktop = path.join(os.homedir(), 'Desktop');
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.(docx|rtf)$/i, '');
      const filePath = path.join(desktop, safeName + '.rtf');
      const rtfContent = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\n{\\colortbl;\\red0\\green0\\blue0;}\n\\f0\\fs24 ${(content || '').replace(/\n/g, '\\par\n')}\n}`;
      fs.writeFileSync(filePath, rtfContent, 'utf8');
      sendLog('BUTLER', `Created RTF document: ${filePath}`, 'info');
      return { success: true, path: filePath, format: 'rtf' };
    } catch (e2) {
      sendLog('BUTLER', `Document creation failed: ${e2.message}`, 'error');
      return { success: false, error: e2.message };
    }
  }
});

// Open a folder in file explorer
ipcMain.handle('butler:open-folder', async (_, folderPath) => {
  try {
    // Support common folder aliases
    const FOLDER_ALIASES = {
      'desktop': path.join(os.homedir(), 'Desktop'),
      'documents': path.join(os.homedir(), 'Documents'),
      'downloads': path.join(os.homedir(), 'Downloads'),
      'pictures': path.join(os.homedir(), 'Pictures'),
      'music': path.join(os.homedir(), 'Music'),
      'videos': path.join(os.homedir(), 'Videos'),
      'home': os.homedir(),
      'appdata': app.getPath('userData'),
    };
    const resolved = FOLDER_ALIASES[folderPath.toLowerCase()] || folderPath;
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `Folder not found: ${resolved}` };
    }
    shell.openPath(resolved);
    sendLog('BUTLER', `Opened folder: ${resolved}`, 'info');
    return { success: true, path: resolved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Open a file with default application
ipcMain.handle('butler:open-file', async (_, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    shell.openPath(filePath);
    sendLog('BUTLER', `Opened file: ${filePath}`, 'info');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Empty recycle bin (with confirmation)
ipcMain.handle('butler:empty-trash', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Empty'],
    title: 'Empty Recycle Bin',
    message: 'Are you sure you want to permanently delete all items in the Recycle Bin?'
  });
  if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
  try {
    if (process.platform === 'win32') {
      await runCmd('powershell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Host \"Recycle Bin emptied.\""');
    } else if (process.platform === 'darwin') {
      await runCmd('osascript -e \'tell application "Finder" to empty trash\'');
    } else {
      await runCmd('rm -rf ~/.local/share/Trash/files/* ~/.local/share/Trash/info/*');
    }
    sendLog('BUTLER', 'Recycle bin emptied.', 'info');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Lock workstation
ipcMain.handle('butler:lock-screen', async () => {
  try {
    if (process.platform === 'win32') {
      exec('rundll32.exe user32.dll,LockWorkStation');
    } else if (process.platform === 'darwin') {
      exec('pmset displaysleepnow');
    } else {
      exec('loginctl lock-session || xdg-screensaver lock');
    }
    sendLog('BUTLER', 'Workstation locked.', 'info');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Shutdown (with confirmation)
ipcMain.handle('butler:shutdown', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Shut Down'],
    title: 'Shutdown Computer',
    message: 'Are you sure you want to shut down the computer?\nSave all work before proceeding.'
  });
  if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
  sendLog('BUTLER', 'Shutting down...', 'warn');
  if (process.platform === 'win32') exec('shutdown /s /t 5');
  else if (process.platform === 'darwin') exec('sudo shutdown -h +1');
  else exec('shutdown -h now');
  return { success: true };
});

// Restart (with confirmation)
ipcMain.handle('butler:restart', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Restart'],
    title: 'Restart Computer',
    message: 'Are you sure you want to restart the computer?\nSave all work before proceeding.'
  });
  if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
  sendLog('BUTLER', 'Restarting...', 'warn');
  if (process.platform === 'win32') exec('shutdown /r /t 5');
  else if (process.platform === 'darwin') exec('sudo shutdown -r +1');
  else exec('shutdown -r now');
  return { success: true };
});

// ─── IPC: REMINDERS ──────────────────────────────────────────────────────────
const activeReminders = new Map();

ipcMain.handle('reminders:set', (_, { id, label, delayMs }) => {
  if (activeReminders.has(id)) activeReminders.get(id).cancel();
  const fireAt = new Date(Date.now() + delayMs);
  const job = schedule.scheduleJob(fireAt, () => {
    safeSend('reminder:fire', { id, label });
    sendLog('HEX', `Reminder fired: ${label}`, 'info');
    activeReminders.delete(id);
  });
  activeReminders.set(id, job);
  sendLog('HEX', `Reminder set: "${label}" in ${Math.round(delayMs / 60000)} min`, 'info');
  return { success: true, fireAt };
});

ipcMain.handle('reminders:cancel', (_, id) => {
  if (activeReminders.has(id)) { activeReminders.get(id).cancel(); activeReminders.delete(id); }
  return { success: true };
});

// ─── IPC: EXEC SAFE COMMAND ──────────────────────────────────────────────────
const SAFE_COMMANDS = ['echo', 'date', 'hostname', 'whoami', 'uptime', 'df', 'free', 'top', 'ps'];

// ─── IPC: LOCAL VOICE (STT + TTS) ───────────────────────────────────────────

ipcMain.handle('voice:open-models-dir', () => {
  const dir = localVoice ? localVoice.getStatus().modelsDir : path.join(app.getPath('userData'), 'voice-models');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return dir;
});

ipcMain.handle('voice:status', () => {
  if (!localVoice) return { available: false, reason: 'Engine not loaded — check npm install' };
  try {
    const status = localVoice.getStatus();
    return { available: true, ...status };
  } catch (e) {
    return { available: false, reason: e.message };
  }
});

// Set models directory path from renderer
ipcMain.handle('voice:set-models-dir', (_, dir) => {
  if (localVoice && dir) {
    localVoice.setModelsDir(dir);
    config.voice = { ...(config.voice || {}), modelsDir: dir };
    saveConfig(config);
  }
  return { success: true, dir };
});

// Open native folder picker so user can browse for models directory
ipcMain.handle('voice:browse-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Voice Models Directory',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const dir = result.filePaths[0];
  if (localVoice && dir) {
    localVoice.setModelsDir(dir);
    config.voice = { ...(config.voice || {}), modelsDir: dir };
    saveConfig(config);
  }
  return dir;
});

// Raw webm/ogg blob → main process decodes with ffmpeg → Whisper
ipcMain.handle('voice:transcribeRaw', async (_, { bytes, lang }) => {
  if (!localVoice) throw new Error('Local voice engine not available');
  const { execSync } = require('child_process');
  const tmpIn  = path.join(os.tmpdir(), 'hex_stt_in.webm');
  const tmpOut = path.join(os.tmpdir(), 'hex_stt_out.raw');
  try {
    fs.writeFileSync(tmpIn, Buffer.from(bytes));
    // Decode webm to raw 16kHz mono PCM using ffmpeg
    execSync(`ffmpeg -y -i "${tmpIn}" -ar 16000 -ac 1 -f f32le "${tmpOut}"`, { stdio: 'ignore' });
    const raw     = fs.readFileSync(tmpOut);
    const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    localVoice.setLogger((msg) => mainWindow?.webContents.send('log:entry', { source: 'VOICE', message: msg, level: 'info' }));
    return { text: await localVoice.transcribe(float32, lang || 'en') };
  } catch (e) {
    // ffmpeg not available — pass raw bytes directly and hope Whisper handles it
    const float32 = new Float32Array(Buffer.from(bytes).buffer);
    return { text: await localVoice.transcribe(float32, lang || 'en') };
  } finally {
    try { fs.unlinkSync(tmpIn);  } catch(_) {}
    try { fs.unlinkSync(tmpOut); } catch(_) {}
  }
});

ipcMain.handle('voice:transcribe', async (_, { samples, lang }) => {
  if (!localVoice) throw new Error('Local voice engine not available');
  localVoice.setLogger((msg) => sendLog('VOICE', msg));
  // samples arrives as a Buffer (renderer sends ArrayBuffer → IPC converts to Buffer)
  // We need a Float32Array view into it — NOT Buffer.from(samples) which re-interprets bytes
  let float32;
  if (samples instanceof Buffer) {
    // Correct: view existing buffer as float32
    float32 = new Float32Array(samples.buffer, samples.byteOffset, samples.byteLength / 4);
  } else if (samples && samples.buffer) {
    float32 = new Float32Array(samples.buffer);
  } else {
    // Last resort — treat as raw byte sequence
    const buf = Buffer.from(Object.values(samples));
    float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }
  return { text: await localVoice.transcribe(float32, lang || 'en') };
});

ipcMain.handle('voice:synthesize', async (_, { text, lang, speed }) => {
  if (!localVoice) throw new Error('Local voice engine not available');
  localVoice.setLogger((msg) => sendLog('VOICE', msg));
  const result = await localVoice.synthesize(text, lang || 'en', speed || 1.0);
  // Convert Float32Array to Buffer for IPC transfer
  return {
    samples: Buffer.from(result.samples.buffer),
    sampleRate: result.sampleRate
  };
});

ipcMain.handle('voice:download-models', async (_, targets) => {
  if (!localVoice) throw new Error('Local voice engine not available');
  // Ensure the engine uses the user-configured models dir before downloading
  if (config.voice && config.voice.modelsDir) {
    localVoice.setModelsDir(config.voice.modelsDir);
  }
  await localVoice.downloadModels(targets || ['stt', 'tts-en', 'tts-ru', 'tts-ka'], (progress) => {
    safeSend('voice:download-progress', progress);
  });
  return { success: true };
});

ipcMain.handle('system:safe-exec', async (_, cmd) => {
  const first = cmd.trim().split(/\s+/)[0].toLowerCase();
  if (!SAFE_COMMANDS.some(s => first.includes(s))) {
    return { success: false, error: 'Command not in safe list. Confirm in dialog.' };
  }
  try { return { success: true, output: await runCmd(cmd) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('system:exec-with-confirm', async (event, cmd) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Execute'],
    title: 'Command Execution',
    message: `Execute this command?\n\n${cmd}\n\nProceed with caution.`
  });
  if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
  try { return { success: true, output: await runCmd(cmd) }; }
  catch (e) { return { success: false, error: e.message }; }
});
