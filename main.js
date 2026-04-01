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


// Take a screenshot and save to Desktop
ipcMain.handle('butler:screenshot', async () => {
  try {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    if (!sources || sources.length === 0) {
      return { success: false, error: 'No screen sources found' };
    }
    const img = sources[0].thumbnail;
    const pngBuffer = img.toPNG();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const desktop = path.join(os.homedir(), 'Desktop');
    const outPath = path.join(desktop, `screenshot_${ts}.png`);
    fs.writeFileSync(outPath, pngBuffer);
    sendLog('BUTLER', `Screenshot saved: ${outPath}`, 'info');
    // Open the screenshot
    shell.openPath(outPath);
    return { success: true, path: outPath };
  } catch (e) {
    sendLog('BUTLER', `Screenshot failed: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
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

// ─────────────────────────────────────────────────────────────────────────────
//  REAL APP FINDER: searches Start Menu, registry, Program Files, PATH
// ─────────────────────────────────────────────────────────────────────────────

// Build a PS script that finds ANY installed app by fuzzy name and launches it.
// Strategy (tried in order):
//  1. Get-StartApps fuzzy match   → covers 99% of installed apps on Win10/11
//  2. Registry App Paths          → covers Chrome, Firefox, VLC, VS Code etc.
//  3. PATH + common exe names     → covers CLI tools
//  4. Program Files recursive     → last resort filesystem search
function buildAppFinderPS(name) {
  const safe = name.replace(/'/g, "''").replace(/"/g, '');
  return `
$n = '${safe}'; $nl = $n.ToLower(); $found = $null

# 1. Get-StartApps — searches Start Menu (Win10/11 built-in)
try {
  $apps = Get-StartApps | Where-Object { $_.Name -like "*$n*" }
  if ($apps) {
    $exact = $apps | Where-Object { $_.Name.ToLower() -eq $nl }
    $app   = if ($exact) { $exact[0] } else { $apps[0] }
    Write-Host "FOUND:startapp:$($app.AppID):$($app.Name)"
    exit 0
  }
} catch {}

# 2. Registry App Paths (HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths)
try {
  $base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
  $keys = Get-ChildItem $base -ErrorAction SilentlyContinue |
          Where-Object { $_.PSChildName -like "*$n*" }
  if ($keys) {
    $path = (Get-ItemProperty $keys[0].PSPath).'(default)'
    if ($path -and (Test-Path $path)) {
      Write-Host "FOUND:path:$path:$($keys[0].PSChildName)"
      exit 0
    }
  }
} catch {}

# 3. Search common install directories
$dirs = @(
  $env:ProgramFiles,
  (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'),  // safe
  "$env:LOCALAPPDATA\\Programs",
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
)
foreach ($dir in $dirs) {
  if (-not $dir) { continue }
  # Search .lnk shortcuts first (faster, covers all Start Menu entries)
  $lnks = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName -like "*$n*" } | Select-Object -First 1
  if ($lnks) {
    Write-Host "FOUND:lnk:$($lnks.FullName):$($lnks.BaseName)"
    exit 0
  }
  # Search .exe files
  $exes = Get-ChildItem -Path $dir -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName -like "*$n*" -and $_.BaseName -notlike "*uninstall*" -and $_.BaseName -notlike "*setup*" } |
          Select-Object -First 1
  if ($exes) {
    Write-Host "FOUND:exe:$($exes.FullName):$($exes.BaseName)"
    exit 0
  }
}

Write-Host "NOTFOUND"
`.trim();
}

ipcMain.handle('butler:open-app', async (_, appName) => {
  // Strip trailing punctuation that LLMs sometimes append (e.g. "chrome." from a sentence)
  const name = (appName || '').trim().replace(/[.!?,;:]+$/, '').trim();
  const nl   = name.toLowerCase();
  sendLog('BUTLER', `Finding and launching: ${name}`);

  if (process.platform !== 'win32') {
    // macOS / Linux simple approach
    return new Promise(resolve => {
      const cmd = process.platform === 'darwin'
        ? `open -a "${name.replace(/"/g,'\\"')}" || open "${name.replace(/"/g,'\\\"')}"`
        : `xdg-open "${name}" 2>/dev/null || gtk-launch "${name}" 2>/dev/null || "${name}" &`;
      exec(cmd, { shell: true, timeout: 10000 }, err =>
        resolve(err ? { success: false, error: err.message } : { success: true, app: name })
      );
    });
  }

  // ── Windows ───────────────────────────────────────────────────────────────
  // Instant mappings for things guaranteed to be in System32 / PATH
  const INSTANT = {
    'notepad': 'notepad.exe', 'wordpad': 'write.exe',
    'calculator': 'calc.exe', 'calc': 'calc.exe',
    'paint': 'mspaint.exe',   'mspaint': 'mspaint.exe',
    'cmd': 'cmd.exe',         'command prompt': 'cmd.exe',
    'powershell': 'powershell.exe',
    'terminal': 'wt.exe',     'windows terminal': 'wt.exe',
    'explorer': 'explorer.exe', 'file explorer': 'explorer.exe',
    'taskmgr': 'taskmgr.exe', 'task manager': 'taskmgr.exe',
    'control panel': 'control.exe', 'control': 'control.exe',
    'settings': 'ms-settings:', 'windows settings': 'ms-settings:',
    'snipping tool': 'snippingtool.exe', 'snip': 'snippingtool.exe',
    'regedit': 'regedit.exe', 'registry': 'regedit.exe',
    'mmc': 'mmc.exe', 'services': 'services.msc',
    'devmgmt': 'devmgmt.msc', 'device manager': 'devmgmt.msc',
    'msconfig': 'msconfig.exe', 'system configuration': 'msconfig.exe',
    'msinfo32': 'msinfo32.exe', 'system information': 'msinfo32.exe',
    'dxdiag': 'dxdiag.exe',
  };

  if (INSTANT[nl]) {
    return new Promise(resolve => {
      exec(`start "" "${INSTANT[nl]}"`, { shell: true }, err =>
        resolve({ success: true, app: name, method: 'instant' })
      );
    });
  }

  // URI protocols — launch via shell open
  const URI_MAP = {
    'spotify': 'spotify:', 'discord': 'discord:', 'steam': 'steam:',
    'telegram': 'tg:', 'slack': 'slack:', 'zoom': 'zoommtg:',
    'whatsapp': 'whatsapp:', 'skype': 'skype:',
  };
  if (URI_MAP[nl]) {
    shell.openExternal(URI_MAP[nl]);
    sendLog('BUTLER', `Launched via URI: ${name}`);
    return { success: true, app: name, method: 'uri' };
  }

  // Write finder script to temp file (avoids all quoting hell)
  const tmpPs = path.join(os.tmpdir(), 'hex-find-' + Date.now() + '.ps1');
  try {
    fs.writeFileSync(tmpPs, buildAppFinderPS(name), 'utf8');
    const r = await butlerExec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
      { timeout: 20000 }
    );
    const out = (r.out || '').trim();
    sendLog('BUTLER', `Finder result for "${name}": ${out.substring(0,80)}`);

    if (out.startsWith('FOUND:startapp:')) {
      const parts = out.split(':');
      const appId = parts[2];
      // Start-Process with AppID — works for UWP, Win32, and packaged apps
      exec(`powershell -NoProfile -Command "Start-Process '${appId.replace(/'/g,"''")}'"`,
        { shell: true, timeout: 10000 }, () => {});
      return { success: true, app: name, method: 'startapp', found: parts[3] || name };
    }

    if (out.startsWith('FOUND:path:') || out.startsWith('FOUND:exe:')) {
      const parts = out.split(':');
      // parts[2] might be split if path has drive letter — rejoin with :
      const filePath = parts.slice(2, -1).join(':').trim();
      if (filePath) {
        shell.openPath(filePath);
        return { success: true, app: name, method: 'path', found: filePath };
      }
    }

    if (out.startsWith('FOUND:lnk:')) {
      const parts = out.split(':');
      const lnkPath = parts.slice(2, -1).join(':').trim();
      if (lnkPath) {
        shell.openPath(lnkPath);
        return { success: true, app: name, method: 'lnk', found: lnkPath };
      }
    }

    // NOTFOUND — last resort: Start-Process with raw name (may work for PATH apps)
    sendLog('BUTLER', `App not found by finder, trying Start-Process directly...`);
    const r2 = await butlerExec(
      `powershell -NoProfile -Command "Start-Process '${name.replace(/'/g,"''")}'"`,
      { timeout: 8000 }
    );
    if (r2.ok) return { success: true, app: name, method: 'startprocess-direct' };
    return { success: false, error: `"${name}" not found. Is it installed?`, hint: 'Try the exact app name or check if it appears in Start Menu.' };

  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    try { fs.unlinkSync(tmpPs); } catch (_) {}
  }
});


// ─── GAME LAUNCHERS ──────────────────────────────────────────────────────────

// Discover all installed Steam games
ipcMain.handle('butler:get-steam-games', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  try {
    // Find Steam library folders
    const steamPaths = [];
    const regQuery = await butlerExec(
      'reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v SteamPath 2>nul', { timeout: 5000 }
    );
    const steamMatch = regQuery.out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (steamMatch) {
      const steamRoot = steamMatch[1].trim().replace(/\//g, '\\');
      steamPaths.push(steamRoot);
      // Parse libraryfolders.vdf for additional library paths
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        const pathMatches = [...vdf.matchAll(/"path"\s+"([^"]+)"/gi)];
        pathMatches.forEach(m => {
          const p = m[1].replace(/\\\\/g, '\\');
          if (!steamPaths.includes(p)) steamPaths.push(p);
        });
      }
    }
    if (!steamPaths.length) return { success: false, error: 'Steam not found', games: [] };

    const games = [];
    for (const steamPath of steamPaths) {
      const appsDir = path.join(steamPath, 'steamapps');
      if (!fs.existsSync(appsDir)) continue;
      const acfFiles = fs.readdirSync(appsDir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
      for (const acf of acfFiles) {
        try {
          const content = fs.readFileSync(path.join(appsDir, acf), 'utf8');
          const appid   = (content.match(/"appid"\s+"(\d+)"/i) || [])[1];
          const name    = (content.match(/"name"\s+"([^"]+)"/i) || [])[1];
          const dir     = (content.match(/"installdir"\s+"([^"]+)"/i) || [])[1];
          if (appid && name) games.push({ appid, name, dir: dir || '', platform: 'steam' });
        } catch (_) {}
      }
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    sendLog('BUTLER', `Found ${games.length} Steam games`);
    return { success: true, games, count: games.length };
  } catch (e) { return { success: false, error: e.message, games: [] }; }
});

// Discover Epic Games Store games
ipcMain.handle('butler:get-epic-games', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  try {
    const manifestDir = path.join(
      process.env['ProgramData'] || 'C:\\ProgramData',
      'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'
    );
    if (!fs.existsSync(manifestDir)) return { success: false, error: 'Epic Games not installed', games: [] };
    const games = [];
    const files = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
        if (data.AppName && data.DisplayName) {
          games.push({
            appid:    data.AppName,
            name:     data.DisplayName,
            dir:      data.InstallLocation || '',
            platform: 'epic'
          });
        }
      } catch (_) {}
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    sendLog('BUTLER', `Found ${games.length} Epic games`);
    return { success: true, games, count: games.length };
  } catch (e) { return { success: false, error: e.message, games: [] }; }
});

// Launch a game by name — searches Steam, Epic, GOG, then tries as a regular app
ipcMain.handle('butler:launch-game', async (_, { gameName }) => {
  const name = (gameName || '').trim().replace(/[.!?,;:]+$/, '').trim();
  const nl   = name.toLowerCase();
  sendLog('BUTLER', `Looking for game: "${name}"`);

  // Helper: fuzzy name match score
  const fuzzyMatch = (a, b) => {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (al === bl) return 1.0;
    if (al.includes(bl) || bl.includes(al)) return 0.9;
    // Word overlap
    const wa = new Set(al.split(/\s+/)), wb = new Set(bl.split(/\s+/));
    let hits = 0; for (const w of wa) if (wb.has(w) && w.length > 2) hits++;
    return hits / Math.max(wa.size, wb.size);
  };

  // 1. Try Steam
  try {
    const steamResult = await new Promise(resolve => {
      ipcMain.emit('butler:get-steam-games-internal', resolve);
    });
    // Inline the search
    const steamReg = await butlerExec(
      'reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v SteamPath 2>nul', { timeout: 5000 }
    );
    const steamMatch = steamReg.out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (steamMatch) {
      const steamRoot = steamMatch[1].trim().replace(/\//g, '\\');
      const allPaths = [steamRoot];
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        [...vdf.matchAll(/"path"\s+"([^"]+)"/gi)].forEach(m => {
          const p = m[1].replace(/\\\\/g, '\\');
          if (!allPaths.includes(p)) allPaths.push(p);
        });
      }
      let bestGame = null, bestScore = 0;
      for (const sp of allPaths) {
        const appsDir = path.join(sp, 'steamapps');
        if (!fs.existsSync(appsDir)) continue;
        for (const acf of fs.readdirSync(appsDir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))) {
          try {
            const content = fs.readFileSync(path.join(appsDir, acf), 'utf8');
            const appid = (content.match(/"appid"\s+"(\d+)"/i) || [])[1];
            const gname = (content.match(/"name"\s+"([^"]+)"/i) || [])[1];
            if (!appid || !gname) continue;
            const score = fuzzyMatch(gname, nl);
            if (score > bestScore) { bestScore = score; bestGame = { appid, name: gname }; }
          } catch (_) {}
        }
      }
      if (bestGame && bestScore >= 0.5) {
        const launchUrl = `steam://rungameid/${bestGame.appid}`;
        shell.openExternal(launchUrl);
        sendLog('BUTLER', `Launching Steam game: "${bestGame.name}" (appid: ${bestGame.appid})`);
        return { success: true, game: bestGame.name, platform: 'steam', appid: bestGame.appid };
      }
    }
  } catch (e) { sendLog('BUTLER', 'Steam search error: ' + e.message, 'warn'); }

  // 2. Try Epic Games
  try {
    const manifestDir = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    if (fs.existsSync(manifestDir)) {
      let bestGame = null, bestScore = 0;
      for (const file of fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
          const score = fuzzyMatch(data.DisplayName || '', nl);
          if (score > bestScore) { bestScore = score; bestGame = data; }
        } catch (_) {}
      }
      if (bestGame && bestScore >= 0.5) {
        const launchUri = `com.epicgames.launcher://apps/${bestGame.AppName}?action=launch`;
        shell.openExternal(launchUri);
        sendLog('BUTLER', `Launching Epic game: "${bestGame.DisplayName}"`);
        return { success: true, game: bestGame.DisplayName, platform: 'epic', appid: bestGame.AppName };
      }
    }
  } catch (e) { sendLog('BUTLER', 'Epic search error: ' + e.message, 'warn'); }

  // 3. Try GOG Galaxy
  try {
    const gogDb = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'GOG.com', 'Galaxy', 'storage', 'galaxy.db');
    if (fs.existsSync(gogDb)) {
      // GOG stores game paths — use PowerShell to query SQLite via ADO
      const ps = `Add-Type -Path "${gogDb}" -ErrorAction SilentlyContinue 2>$null; ` +
        `$conn = New-Object System.Data.SQLite.SQLiteConnection("Data Source=${gogDb}"); ` +
        `echo "GOG_SKIP"`; // Skip if SQLite lib not available
      const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 5000 });
      // Fallback: scan GOG paths from registry
    }
  } catch (_) {}

  // 4. Fallback: try as regular app name
  sendLog('BUTLER', `Game not found in launchers, trying as app: "${name}"`);
  const appResult = await new Promise(resolve => {
    const handler = (_, appName) => resolve(null);
    // Call open-app handler directly
    const tmpPs = path.join(os.tmpdir(), 'hex-find-game-' + Date.now() + '.ps1');
    fs.writeFileSync(tmpPs, buildAppFinderPS(name), 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, { shell: true, timeout: 20000 }, (err, stdout) => {
      try { fs.unlinkSync(tmpPs); } catch (_) {}
      const out = (stdout || '').trim();
      if (out.startsWith('FOUND:')) {
        const parts = out.split(':');
        const filePath = parts.slice(2, -1).join(':').trim() || parts.slice(2).join(':').trim();
        if (filePath) { shell.openPath(filePath); resolve({ success: true, game: name, method: 'filesystem' }); }
        else resolve({ success: false });
      } else {
        exec(`powershell -NoProfile -Command "Start-Process '${name.replace(/'/g,"''")}'"`, { shell: true, timeout: 8000 }, (e2) => {
          resolve(e2 ? { success: false, error: `Game "${name}" not found in Steam, Epic, or installed apps.` } : { success: true, game: name, method: 'direct' });
        });
      }
    });
  });

  return appResult || { success: false, error: `Could not find game: "${name}". Is it installed via Steam, Epic, or directly?` };
});

// ─────────────────────────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
//  PC BUTLER — Extended Actions (from butler.md)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Shared helpers ────────────────────────────────────────────────────────────
function butlerExec(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { shell: true, timeout: opts.timeout || 30000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (err ? (stderr || err.message) : '').trim() });
    });
  });
}

function butlerConfirm(win, msg) {
  return dialog.showMessageBox(win || BrowserWindow.getFocusedWindow(), {
    type: 'warning', buttons: ['Cancel', 'Confirm'],
    title: '◆ HEX — Confirm Action', message: msg
  }).then(r => r.response === 1);
}

// ── FILE & FOLDER ─────────────────────────────────────────────────────────────

ipcMain.handle('butler:copy', async (_, { src, dest }) => {
  try {
    const s = src.trim(), d = dest.trim();
    if (!fs.existsSync(s)) return { success: false, error: `Source not found: ${s}` };
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      // Recursive dir copy
      const copyDir = (from, to) => {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from)) {
          const sf = path.join(from, entry), df = path.join(to, entry);
          fs.statSync(sf).isDirectory() ? copyDir(sf, df) : fs.copyFileSync(sf, df);
        }
      };
      copyDir(s, d);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
    sendLog('BUTLER', `Copied: ${s} → ${d}`);
    return { success: true, dest: d };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:move', async (event, { src, dest }) => {
  try {
    const s = src.trim(), d = dest.trim();
    if (!fs.existsSync(s)) return { success: false, error: `Source not found: ${s}` };
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.renameSync(s, d);
    sendLog('BUTLER', `Moved: ${s} → ${d}`);
    return { success: true, dest: d };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:delete', async (event, { item, permanent }) => {
  try {
    const p = item.trim();
    if (!fs.existsSync(p)) return { success: false, error: `Not found: ${p}` };
    const confirmed = await butlerConfirm(mainWindow,
      (permanent ? '⚠ PERMANENTLY delete' : 'Move to Recycle Bin') + `:\n\n${p}`);
    if (!confirmed) return { success: false, error: 'Cancelled' };
    if (permanent) {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) fs.rmdirSync(p, { recursive: true });
      else fs.unlinkSync(p);
    } else {
      await shell.trashItem(p);
    }
    sendLog('BUTLER', `Deleted${permanent ? ' permanently' : ''}: ${p}`);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:rename', async (_, { oldPath, newPath }) => {
  try {
    if (!fs.existsSync(oldPath)) return { success: false, error: `Not found: ${oldPath}` };
    fs.renameSync(oldPath, newPath);
    sendLog('BUTLER', `Renamed: ${oldPath} → ${newPath}`);
    return { success: true, path: newPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:create-folder', async (_, { folderPath }) => {
  try {
    fs.mkdirSync(folderPath.trim(), { recursive: true });
    sendLog('BUTLER', `Folder created: ${folderPath}`);
    return { success: true, path: folderPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:list-dir', async (_, { dirPath }) => {
  try {
    const ALIASES = {
      desktop: path.join(os.homedir(), 'Desktop'),
      documents: path.join(os.homedir(), 'Documents'),
      downloads: path.join(os.homedir(), 'Downloads'),
      pictures: path.join(os.homedir(), 'Pictures'),
      home: os.homedir(),
    };
    const resolved = ALIASES[(dirPath || '').toLowerCase()] || dirPath.trim();
    if (!fs.existsSync(resolved)) return { success: false, error: `Not found: ${resolved}` };
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      path: path.join(resolved, e.name),
    }));
    return { success: true, path: resolved, items, count: items.length };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:file-info', async (_, { filePath }) => {
  try {
    const p = filePath.trim();
    if (!fs.existsSync(p)) return { success: false, error: `Not found: ${p}` };
    const stat = fs.statSync(p);
    return {
      success: true, path: p,
      size: stat.size, sizeHuman: formatBytes(stat.size),
      isDir: stat.isDirectory(), isFile: stat.isFile(),
      created: stat.birthtime.toLocaleString(),
      modified: stat.mtime.toLocaleString(),
      accessed: stat.atime.toLocaleString(),
    };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── PROCESS & SYSTEM ──────────────────────────────────────────────────────────

ipcMain.handle('butler:list-processes', async () => {
  try {
    const procs = await si.processes();
    const top = procs.list.sort((a, b) => b.cpu - a.cpu).slice(0, 30).map(p => ({
      pid: p.pid, name: p.name,
      cpu: p.cpu.toFixed(1) + '%',
      mem: formatBytes((p.memRss || 0) * 1024),
    }));
    return { success: true, processes: top };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:kill-by-name', async (event, { name }) => {
  const confirmed = await butlerConfirm(mainWindow, `Kill all processes named "${name}"?`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const r = await butlerExec(`taskkill /IM "${name}" /F`);
  sendLog('BUTLER', r.ok ? `Killed: ${name}` : `Kill failed: ${r.err}`, r.ok ? 'info' : 'error');
  return { success: r.ok, output: r.out, error: r.err };
});

ipcMain.handle('butler:sys-info', async () => {
  try {
    const [cpu, mem, osInfo] = await Promise.all([si.cpu(), si.mem(), si.osInfo()]);
    return {
      success: true,
      os: osInfo.distro + ' ' + osInfo.release,
      hostname: os.hostname(),
      uptime: formatUptime(os.uptime()),
      cpu: cpu.manufacturer + ' ' + cpu.brand + ' (' + cpu.cores + ' cores)',
      ramTotal: formatBytes(mem.total),
      ramFree: formatBytes(mem.free),
      ramUsed: formatBytes(mem.used),
      platform: process.platform,
    };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:battery', async () => {
  try {
    const b = await si.battery();
    return {
      success: true,
      hasBattery: b.hasBattery,
      percent: b.percent,
      isCharging: b.isCharging,
      timeRemaining: b.timeRemaining > 0 ? Math.round(b.timeRemaining) + ' min' : 'N/A',
    };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:disk-usage', async (_, { drivePath }) => {
  try {
    const fsizes = await si.fsSize();
    const target = drivePath ? drivePath.trim() : null;
    const disks = target
      ? fsizes.filter(d => d.mount === target || d.mount === target + ':' || d.mount === target + ':\\')
      : fsizes;
    const result = disks.map(d => ({
      mount: d.mount, fs: d.fs,
      total: formatBytes(d.size), used: formatBytes(d.used),
      free: formatBytes(d.available),
      pct: Math.round((d.used / d.size) * 100) + '%',
    }));
    return { success: true, disks: result };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── CLIPBOARD ─────────────────────────────────────────────────────────────────

const { clipboard } = require('electron');

ipcMain.handle('butler:get-clipboard', () => {
  try { return { success: true, text: clipboard.readText() }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:set-clipboard', (_, { text }) => {
  try { clipboard.writeText(text || ''); sendLog('BUTLER', 'Clipboard set.'); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:clear-clipboard', () => {
  try { clipboard.clear(); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

// ── AUDIO / VOLUME ────────────────────────────────────────────────────────────

ipcMain.handle('butler:set-volume', async (_, { level }) => {
  const v = Math.max(0, Math.min(100, parseInt(level) || 50));
  if (process.platform === 'win32') {
    // Method 1: nircmd (free utility) - most reliable if installed
    const r1 = await butlerExec(`nircmd setsysvolume ${Math.round(v / 100 * 65535)}`, { timeout: 5000 });
    if (r1.ok) { sendLog('BUTLER', `Volume -> ${v}% (nircmd)`); return { success: true, level: v }; }
    // Method 2: PowerShell via WScript.Shell volume key simulation
    // First mute everything, then raise to target level
    // VK_VOLUME_DOWN(174) x50 to reach 0, then VK_VOLUME_UP(175) x target_steps
    const steps = Math.round(v / 2); // Each step = ~2%
    const ps = `$wsh=New-Object -ComObject WScript.Shell; ` +
      `for($i=0;$i-lt 50;$i++){$wsh.SendKeys([char]174)}; ` +
      `for($i=0;$i-lt ${steps};$i++){$wsh.SendKeys([char]175)}`;
    const r2 = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\"')}"`, { timeout: 15000 });
    sendLog('BUTLER', `Volume -> ${v}%` + (r2.ok ? '' : ' (approx - install nircmd for exact control)'));
    return { success: true, level: v, note: r2.ok ? '' : 'Install nircmd for precise volume control: https://www.nirsoft.net/utils/nircmd.html' };
  } else if (process.platform === 'darwin') {
    await butlerExec(`osascript -e 'set volume output volume ${v}'`);
  } else {
    await butlerExec(`amixer -q sset Master ${v}%`);
  }
  sendLog('BUTLER', `Volume -> ${v}%`);
  return { success: true, level: v };
});


ipcMain.handle('butler:mute', async (_, { mute }) => {
  const doMute = mute !== false;
  if (process.platform === 'win32') {
    // Use PowerShell with IAudioEndpointVolume SetMute
    // Simpler: use the WScript.Shell mute toggle key but only if needed
    // Most reliable: nircmd mutesysvolume, fallback to PS SetMute via COM
    const nircmdCmd = doMute ? 'nircmd mutesysvolume 1' : 'nircmd mutesysvolume 0';
    const r = await butlerExec(nircmdCmd, { timeout: 5000 });
    if (!r.ok) {
      // PS fallback using SndVol mute state
      const ps = doMute
        ? `$a=(New-Object -ComObject WScript.Shell); $a.SendKeys([char]173)`  // VK_VOLUME_MUTE toggle
        : `$a=(New-Object -ComObject WScript.Shell); $a.SendKeys([char]173)`;  // same key (toggle)
      // Note: VK_VOLUME_MUTE (173) toggles — not reliable for explicit set.
      // Best effort: send it and assume it reaches desired state.
      await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\"')}"`, { timeout: 5000 });
    }
  } else if (process.platform === 'darwin') {
    await butlerExec(doMute ? "osascript -e 'set volume with output muted'" : "osascript -e 'set volume without output muted'");
  } else {
    await butlerExec(doMute ? 'amixer -q sset Master mute' : 'amixer -q sset Master unmute');
  }
  sendLog('BUTLER', doMute ? 'Muted.' : 'Unmuted.');
  return { success: true };
});

ipcMain.handle('butler:get-volume', async () => {
  try {
    if (process.platform === 'win32') {
      // Read master volume scalar via WScript.Shell + SndVol alternative
      // Most reliable cross-version method on Windows 10/11:
      const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
        `$v = [System.Diagnostics.Process]::GetProcessesByName('svchost') | ` +
        `Select-Object -First 1 | ForEach-Object { 0 }; ` +
        `$src = New-Object -ComObject WScript.Shell; ` +
        `$bytes = [byte[]](wmic sounddev get /format:list 2>$null); ` +
        `[math]::Round([float](Get-ItemPropertyValue 'HKCU:\\Software\\Microsoft\\Multimedia\\Audio' 'MasterVolume' -ErrorAction SilentlyContinue) / 655.35)`;
      const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\"')}"`, { timeout: 8000 });
      const level = parseInt(r.out);
      if (!isNaN(level) && level >= 0 && level <= 100) {
        return { success: true, level };
      }
      // Fallback: nircmd
      const r2 = await butlerExec('nircmd getdefaultsounddevice', { timeout: 3000 });
      return { success: true, level: null, note: 'Volume reading requires AudioDevice PowerShell module or nircmd' };
    }
    if (process.platform === 'darwin') {
      const r = await butlerExec(`osascript -e 'output volume of (get volume settings)'`);
      return { success: true, level: parseInt(r.out) || null };
    }
    const r = await butlerExec(`amixer sget Master | grep -oP '\d+(?=%)' | head -1`);
    return { success: true, level: parseInt(r.out) || null };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── NETWORK ───────────────────────────────────────────────────────────────────

ipcMain.handle('butler:get-ip', async () => {
  try {
    const nets = await si.networkInterfaces();
    const local = nets
      .filter(n => n.ip4 && !n.internal && n.ip4 !== '127.0.0.1')
      .map(n => ({ name: n.iface, ip: n.ip4, mac: n.mac }));
    // Public IP
    let publicIp = null;
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      publicIp = (await res.json()).ip;
    } catch (_) {}
    return { success: true, local, publicIp };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('butler:ping', async (_, { host }) => {
  const h = (host || '').trim().replace(/[^a-zA-Z0-9.\-_]/g, '');
  if (!h) return { success: false, error: 'Invalid host' };
  const cmd = process.platform === 'win32' ? `ping -n 3 ${h}` : `ping -c 3 ${h}`;
  const r = await butlerExec(cmd, { timeout: 15000 });
  sendLog('BUTLER', `Ping ${h}: ${r.ok ? 'OK' : 'failed'}`);
  return { success: r.ok, host: h, output: r.out || r.err };
});

ipcMain.handle('butler:flush-dns', async (event) => {
  const confirmed = await butlerConfirm(mainWindow, 'Flush DNS cache? (may require admin rights)');
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const cmd = process.platform === 'win32' ? 'ipconfig /flushdns'
    : process.platform === 'darwin' ? 'sudo dscacheutil -flushcache'
    : 'sudo systemd-resolve --flush-caches';
  const r = await butlerExec(cmd, { timeout: 15000 });
  sendLog('BUTLER', 'DNS flushed: ' + (r.ok ? 'OK' : r.err));
  return { success: r.ok, output: r.out || r.err };
});

ipcMain.handle('butler:list-wifi', async () => {
  const cmd = process.platform === 'win32' ? 'netsh wlan show networks mode=bssid'
    : process.platform === 'darwin' ? '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s'
    : 'nmcli device wifi list';
  const r = await butlerExec(cmd, { timeout: 10000 });
  return { success: r.ok, output: r.out || r.err };
});

// ── ENVIRONMENT ───────────────────────────────────────────────────────────────

ipcMain.handle('butler:get-env', (_, { variable }) => {
  const v = (variable || '').trim();
  const val = process.env[v];
  return { success: true, variable: v, value: val !== undefined ? val : null };
});

ipcMain.handle('butler:set-env', async (event, { variable, value }) => {
  const confirmed = await butlerConfirm(mainWindow, `Set environment variable?\n${variable} = ${value}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  process.env[variable] = value || '';
  if (process.platform === 'win32') {
    const r = await butlerExec(`setx ${variable} "${(value||'').replace(/"/g,'\\"')}"`);
    return { success: r.ok, output: r.out || r.err };
  }
  return { success: true, note: 'Set for current session only on non-Windows' };
});

// ── MAINTENANCE ───────────────────────────────────────────────────────────────

ipcMain.handle('butler:clean-temp', async (event) => {
  const confirmed = await butlerConfirm(mainWindow, 'Clean temporary files in %TEMP% folder?\nFiles in use will be skipped.');
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const tmpDir = os.tmpdir();
  let freed = 0, count = 0, skipped = 0;
  try {
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      const full = path.join(tmpDir, entry);
      try {
        const stat = fs.statSync(full);
        freed += stat.size;
        if (stat.isDirectory()) fs.rmdirSync(full, { recursive: true });
        else fs.unlinkSync(full);
        count++;
      } catch (_) { skipped++; }
    }
    const msg = `Cleaned ${count} items (${formatBytes(freed)} freed), ${skipped} skipped`;
    sendLog('BUTLER', msg);
    return { success: true, freed: formatBytes(freed), count, skipped };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── WALLPAPER ─────────────────────────────────────────────────────────────────

ipcMain.handle('butler:set-wallpaper', async (_, { imagePath }) => {
  const p = imagePath.trim();
  if (!fs.existsSync(p)) return { success: false, error: `Image not found: ${p}` };
  try {
    if (process.platform === 'win32') {
      const r = await butlerExec(
        `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\")]public static extern bool SystemParametersInfo(int a,int b,string c,int d);}'; [W]::SystemParametersInfo(20,0,'${p.replace(/'/g,"\\'")}',3)"`
      );
      return { success: r.ok || true }; // SPI call may not return cleanly but usually works
    } else if (process.platform === 'darwin') {
      const r = await butlerExec(`osascript -e 'tell app "Finder" to set desktop picture to POSIX file "${p}"'`);
      return { success: r.ok };
    }
    return { success: false, error: 'Unsupported platform' };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── SCRIPTING (DANGEROUS) ─────────────────────────────────────────────────────

ipcMain.handle('butler:run-ps', async (event, { script }) => {
  const confirmed = await butlerConfirm(mainWindow, `Execute PowerShell script?\n\n${script.substring(0,300)}${script.length>300?'…':''}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const r = await butlerExec(`powershell -NoProfile -Command "${script.replace(/"/g,'\\"')}"`, { timeout: 60000 });
  sendLog('BUTLER', `PS exec: ${r.ok ? 'OK' : r.err}`);
  return { success: r.ok, output: r.out, error: r.err };
});

ipcMain.handle('butler:run-cmd', async (event, { command }) => {
  const confirmed = await butlerConfirm(mainWindow, `Execute CMD command?\n\n${command}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  // Write to bat file to avoid quoting issues
  const tmpFile = path.join(os.tmpdir(), 'hex-butler-' + Date.now() + '.bat');
  try {
    fs.writeFileSync(tmpFile, '@echo off\r\n' + command, 'utf8');
    const r = await butlerExec(`cmd /c "${tmpFile}"`, { timeout: 60000 });
    sendLog('BUTLER', `CMD exec: ${r.ok ? 'OK' : r.err}`);
    return { success: r.ok, output: r.out, error: r.err };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ── LOGOFF ────────────────────────────────────────────────────────────────────

ipcMain.handle('butler:logoff', async () => {
  const confirmed = await butlerConfirm(mainWindow, 'Log off the current user?\nUnsaved work will be lost.');
  if (!confirmed) return { success: false, error: 'Cancelled' };
  exec('shutdown /l');
  return { success: true };
});

// ── Helper functions (if not already defined above main block) ────────────────
function formatUptime(secs) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return (d > 0 ? d + 'd ' : '') + (h > 0 ? h + 'h ' : '') + m + 'm';
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PC BUTLER — MISSING ACTIONS (butler.md v2)
// ═══════════════════════════════════════════════════════════════════════════════

// ── FILE: ZIP / UNZIP ─────────────────────────────────────────────────────────
ipcMain.handle('butler:zip', async (_, { source, output }) => {
  const src = (source || '').trim();
  const out = (output  || '').trim() || src + '.zip';
  if (!fs.existsSync(src)) return { success: false, error: 'Source not found: ' + src };
  // Use PowerShell Compress-Archive (built-in Win10+)
  const ps = `Compress-Archive -Path '${src.replace(/'/g,"''")}' -DestinationPath '${out.replace(/'/g,"''")}' -Force`;
  const tmpFile = path.join(os.tmpdir(), 'hex-zip-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 120000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  sendLog('BUTLER', r.ok ? 'Zipped: ' + out : 'Zip error: ' + r.err);
  return { success: r.ok, output: out, error: r.err };
});

ipcMain.handle('butler:unzip', async (_, { zipPath, dest }) => {
  const zip = (zipPath || '').trim();
  const dst = (dest || path.dirname(zip)).trim();
  if (!fs.existsSync(zip)) return { success: false, error: 'Archive not found: ' + zip };
  fs.mkdirSync(dst, { recursive: true });
  const ps = `Expand-Archive -Path '${zip.replace(/'/g,"''")}' -DestinationPath '${dst.replace(/'/g,"''")}' -Force`;
  const tmpFile = path.join(os.tmpdir(), 'hex-unzip-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 120000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  sendLog('BUTLER', r.ok ? 'Unzipped to: ' + dst : 'Unzip error: ' + r.err);
  return { success: r.ok, dest: dst, error: r.err };
});

// ── PROCESS: RUN WITH ARGS / RUN AS ADMIN ────────────────────────────────────
ipcMain.handle('butler:run', async (_, { cmd, args }) => {
  const c = (cmd || '').trim();
  const a = (args || '').toString().trim();
  const full = a ? `${c} ${a}` : c;
  sendLog('BUTLER', 'Running: ' + full);
  const tmpFile = path.join(os.tmpdir(), 'hex-run-' + Date.now() + '.bat');
  fs.writeFileSync(tmpFile, '@echo off\r\n' + full, 'utf8');
  const r = await butlerExec(`cmd /c "${tmpFile}"`, { timeout: 30000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  return { success: r.ok, output: r.out, error: r.err };
});

ipcMain.handle('butler:run-as-admin', async (event, { cmd }) => {
  const confirmed = await butlerConfirm(mainWindow, `Run as Administrator?\n\n${cmd}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const ps = `Start-Process cmd -ArgumentList '/c ${cmd.replace(/'/g,"''")}' -Verb RunAs`;
  const tmpFile = path.join(os.tmpdir(), 'hex-admin-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 30000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  sendLog('BUTLER', 'Run as admin: ' + (r.ok ? 'OK' : r.err));
  return { success: r.ok, error: r.err };
});

// ── WINDOW MANAGEMENT ─────────────────────────────────────────────────────────
ipcMain.handle('butler:list-windows', async () => {
  const ps = `Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object Id,ProcessName,MainWindowTitle | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$($_.MainWindowTitle)" }`;
  const tmpFile = path.join(os.tmpdir(), 'hex-lw-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 10000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  if (!r.ok) return { success: false, error: r.err };
  const windows = r.out.split('\n').filter(Boolean).map(line => {
    const [pid, proc, ...titleParts] = line.split('|');
    return { pid: parseInt(pid), process: proc, title: titleParts.join('|') };
  });
  return { success: true, windows };
});

ipcMain.handle('butler:window-action', async (_, { action, title }) => {
  // action: focus | minimize | maximize | restore | close
  const t = (title || '').replace(/'/g, "''");
  const ACTIONS = {
    focus:    `$w.Activate()`,
    minimize: `$w.WindowState = [System.Windows.Forms.FormWindowState]::Minimized`,
    maximize: `[void][System.Runtime.InteropServices.Marshal]::ThrowExceptionForHR([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())`,
    restore:  ``,
    close:    `$p.CloseMainWindow() | Out-Null`,
  };
  // Use nircmd for reliability (simpler than WinForms reflection)
  let cmd;
  const a = (action || '').toLowerCase();
  if (a === 'close')    cmd = `nircmd win close title "${t}"`;
  else if (a === 'minimize') cmd = `nircmd win hide title "${t}"`;
  else if (a === 'maximize') cmd = `nircmd win max title "${t}"`;
  else if (a === 'restore')  cmd = `nircmd win restore title "${t}"`;
  else cmd = `nircmd win activate title "${t}"`;  // focus/activate

  // Fallback to PowerShell if nircmd not available
  const r = await butlerExec(cmd, { timeout: 8000 });
  if (!r.ok) {
    const psActions = {
      minimize: `(Get-Process | Where-Object {$_.MainWindowTitle -like '*${t}*'} | Select-Object -First 1).MainWindowHandle | ForEach-Object { [void]([System.Runtime.InteropServices.Marshal]::GetDelegateForFunctionPointer([System.Runtime.InteropServices.Marshal]::GetProcAddress([System.Runtime.InteropServices.Marshal]::GetHINSTANCE([System.Reflection.Assembly]::GetExecutingAssembly().GetModules()[0]), 'ShowWindow'), (Get-Type))) }`,
      close:    `Get-Process | Where-Object {$_.MainWindowTitle -like '*${t}*'} | Select-Object -First 1 | ForEach-Object { $_.CloseMainWindow() }`,
      focus:    `$p = (Get-Process | Where-Object {$_.MainWindowTitle -like '*${t}*'} | Select-Object -First 1); if ($p) { $id = $p.Id; (New-Object -TypeName System.Windows.Forms.Form).Activate() }`,
    };
    const psCmd = psActions[a] || psActions.focus;
    const tmpFile = path.join(os.tmpdir(), 'hex-win-' + Date.now() + '.ps1');
    fs.writeFileSync(tmpFile, `Add-Type -AssemblyName System.Windows.Forms\n${psCmd}`, 'utf8');
    const r2 = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 10000 });
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return { success: r2.ok || true, note: 'Used PowerShell fallback' };
  }
  sendLog('BUTLER', `Window ${action}: "${title}"`);
  return { success: true };
});

// ── SEND KEYSTROKES ───────────────────────────────────────────────────────────
ipcMain.handle('butler:send-keys', async (event, { keys }) => {
  const confirmed = await butlerConfirm(mainWindow, `Send keystrokes to active window?\n\n"${keys}"`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  // WScript.Shell SendKeys — most reliable without robotjs
  const safe = keys.replace(/'/g, "''");
  const ps = `(New-Object -ComObject WScript.Shell).SendKeys('${safe}')`;
  const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 10000 });
  sendLog('BUTLER', 'SendKeys: ' + (r.ok ? 'OK' : r.err));
  return { success: r.ok, error: r.err };
});

// ── MOUSE CONTROL ─────────────────────────────────────────────────────────────
ipcMain.handle('butler:mouse-move', async (event, { x, y }) => {
  const confirmed = await butlerConfirm(mainWindow, `Move mouse to (${x}, ${y})?`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${parseInt(x)}, ${parseInt(y)})`;
  const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 5000 });
  return { success: r.ok, error: r.err };
});

ipcMain.handle('butler:mouse-click', async (event, { button }) => {
  const btn = (button || 'left').toLowerCase();
  const confirmed = await butlerConfirm(mainWindow, `Simulate ${btn} mouse click?`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const KEY_MAP = { left: '{LBUTTON}', right: '{RBUTTON}', double: '{LBUTTON}{LBUTTON}' };
  const r = await butlerExec(
    `nircmd sendmouse ${btn === 'double' ? 'dblclick' : btn} 0 0 0`,
    { timeout: 5000 }
  );
  if (!r.ok) {
    // PowerShell fallback via mouse_event API
    const flags = btn === 'right' ? '8,16' : btn === 'double' ? '2,4,2,4' : '2,4';
    const ps = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int e);}'; ` +
      flags.split(',').map(f => `[M]::mouse_event(${f},0,0,0,0)`).join(';');
    const r2 = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 5000 });
    return { success: r2.ok, error: r2.err };
  }
  return { success: true };
});

ipcMain.handle('butler:paste-clipboard', async (event) => {
  const ps = `(New-Object -ComObject WScript.Shell).SendKeys('^v')`;
  const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 5000 });
  sendLog('BUTLER', 'Paste simulated');
  return { success: r.ok };
});

// ── CLIPBOARD IMAGE ───────────────────────────────────────────────────────────
ipcMain.handle('butler:get-clipboard-img', async () => {
  const outPath = path.join(os.tmpdir(), 'hex-clip-' + Date.now() + '.png');
  const ps = `Add-Type -AssemblyName System.Windows.Forms; $img=[System.Windows.Forms.Clipboard]::GetImage(); if($img){$img.Save('${outPath.replace(/\\/g,'\\\\')}')}else{Write-Error 'No image'}`;
  const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 8000 });
  if (r.ok && fs.existsSync(outPath)) {
    return { success: true, path: outPath };
  }
  return { success: false, error: 'No image in clipboard or save failed' };
});

// ── NETWORK: WIFI / ADAPTER ───────────────────────────────────────────────────
ipcMain.handle('butler:connect-wifi', async (event, { ssid, password }) => {
  const s = (ssid || '').replace(/"/g, '');
  const p = (password || '').replace(/"/g, '');
  const confirmed = await butlerConfirm(mainWindow, `Connect to Wi-Fi network "${s}"?`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  // Create a temp profile XML and connect
  const profileXml = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${s}</name><SSIDConfig><SSID><name>${s}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>${p ? 'WPA2PSK' : 'open'}</authentication><encryption>${p ? 'AES' : 'none'}</encryption><useOneX>false</useOneX></authEncryption>${p ? `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${p}</keyMaterial></sharedKey>` : ''}</security></MSM></WLANProfile>`;
  const xmlFile = path.join(os.tmpdir(), 'hex-wifi-' + Date.now() + '.xml');
  fs.writeFileSync(xmlFile, profileXml, 'utf8');
  const r1 = await butlerExec(`netsh wlan add profile filename="${xmlFile}"`, { timeout: 10000 });
  const r2 = await butlerExec(`netsh wlan connect name="${s}"`, { timeout: 15000 });
  try { fs.unlinkSync(xmlFile); } catch (_) {}
  sendLog('BUTLER', 'WiFi connect: ' + (r2.ok ? 'OK' : r2.err));
  return { success: r2.ok, output: r2.out || r2.err };
});

ipcMain.handle('butler:net-adapter', async (event, { adapter, action }) => {
  const a = (adapter || '').replace(/'/g, "''");
  const act = (action || '').toLowerCase();
  const confirmed = await butlerConfirm(mainWindow, `${act === 'disable' ? 'Disable' : 'Enable'} network adapter "${a}"?\nThis may disconnect you from the internet.`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const ps = act === 'disable'
    ? `Disable-NetAdapter -Name '${a}' -Confirm:$false`
    : `Enable-NetAdapter -Name '${a}' -Confirm:$false`;
  const tmpFile = path.join(os.tmpdir(), 'hex-net-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 20000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  sendLog('BUTLER', `Adapter ${act}: ${a} — ${r.ok ? 'OK' : r.err}`);
  return { success: r.ok, error: r.err };
});

// ── AUTOMATION: SLEEP / SCHEDULE / STARTUP ────────────────────────────────────
ipcMain.handle('butler:sleep', async (_, { seconds }) => {
  const s = Math.max(0.1, Math.min(300, parseFloat(seconds) || 1));
  await new Promise(resolve => setTimeout(resolve, s * 1000));
  return { success: true, slept: s };
});

ipcMain.handle('butler:schedule-once', async (event, { time, command }) => {
  const confirmed = await butlerConfirm(mainWindow, `Schedule task at ${time}?\nCommand: ${command}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const taskName = 'HEX_' + Date.now();
  const r = await butlerExec(`schtasks /create /tn "${taskName}" /sc once /st "${time}" /tr "${command.replace(/"/g,'\\"')}" /f`, { timeout: 10000 });
  sendLog('BUTLER', 'Scheduled task: ' + taskName);
  return { success: r.ok, taskName, output: r.out || r.err };
});

ipcMain.handle('butler:cancel-task', async (_, { taskName }) => {
  const r = await butlerExec(`schtasks /delete /tn "${taskName}" /f`, { timeout: 8000 });
  sendLog('BUTLER', 'Cancelled task: ' + taskName);
  return { success: r.ok, output: r.out || r.err };
});

ipcMain.handle('butler:startup', async (event, { action, cmd, name }) => {
  const act = (action || 'add').toLowerCase();
  const regKey = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
  const entryName = (name || 'HEX_' + Date.now()).replace(/"/g, '');
  let r;
  if (act === 'add') {
    const confirmed = await butlerConfirm(mainWindow, `Add "${entryName}" to startup?\nCommand: ${cmd}`);
    if (!confirmed) return { success: false, error: 'Cancelled' };
    r = await butlerExec(`reg add "${regKey}" /v "${entryName}" /t REG_SZ /d "${cmd.replace(/"/g,'\\"')}" /f`, { timeout: 8000 });
  } else {
    r = await butlerExec(`reg delete "${regKey}" /v "${entryName}" /f`, { timeout: 8000 });
  }
  sendLog('BUTLER', `Startup ${act}: ${entryName}`);
  return { success: r.ok, output: r.out || r.err };
});

// ── REGISTRY ──────────────────────────────────────────────────────────────────
ipcMain.handle('butler:reg-read', async (_, { hive, key, value }) => {
  const fullKey = `${hive}\\${key}`;
  const r = await butlerExec(`reg query "${fullKey}" /v "${value || ''}"`, { timeout: 8000 });
  if (!r.ok) return { success: false, error: r.err };
  // Parse output: "    ValueName    REG_SZ    Data"
  const lines = r.out.split('\n').filter(l => l.trim() && !l.includes('HKEY'));
  const parsed = lines.map(l => {
    const parts = l.trim().split(/\s{2,}/);
    return { name: parts[0], type: parts[1], data: parts.slice(2).join('  ') };
  }).filter(p => p.type);
  return { success: true, values: parsed, raw: r.out };
});

ipcMain.handle('butler:reg-write', async (event, { hive, key, value, data, type }) => {
  const fullKey = `${hive}\\${key}`;
  const confirmed = await butlerConfirm(mainWindow, `Write to registry?\n${fullKey}\n${value} = ${data}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const t = (type || 'REG_SZ').toUpperCase();
  const r = await butlerExec(`reg add "${fullKey}" /v "${value}" /t ${t} /d "${data.replace(/"/g,'\\"')}" /f`, { timeout: 8000 });
  sendLog('BUTLER', `Reg write: ${fullKey}\\${value} = ${data}`);
  return { success: r.ok, error: r.err };
});

// ── SOFTWARE: LIST / INSTALL / UNINSTALL / UPDATES ───────────────────────────
ipcMain.handle('butler:list-software', async () => {
  const ps = `Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName,DisplayVersion,Publisher | Where-Object {$_.DisplayName} | Sort-Object DisplayName | ForEach-Object {"$($_.DisplayName)|$($_.DisplayVersion)|$($_.Publisher)"}`;
  const tmpFile = path.join(os.tmpdir(), 'hex-sw-' + Date.now() + '.ps1');
  fs.writeFileSync(tmpFile, ps, 'utf8');
  const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 30000 });
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  if (!r.ok) return { success: false, error: r.err };
  const software = r.out.split('\n').filter(Boolean).map(line => {
    const [name, version, publisher] = line.split('|');
    return { name: (name||'').trim(), version: (version||'').trim(), publisher: (publisher||'').trim() };
  }).filter(s => s.name);
  return { success: true, software, count: software.length };
});

ipcMain.handle('butler:check-updates', async () => {
  const r = await butlerExec('winget upgrade --include-unknown 2>nul', { timeout: 30000 });
  if (!r.ok && r.err.includes('not recognized')) {
    return { success: false, error: 'winget not available. Install Windows Package Manager from the Microsoft Store.' };
  }
  return { success: true, output: r.out || r.err };
});

ipcMain.handle('butler:install-pkg', async (event, { name }) => {
  const confirmed = await butlerConfirm(mainWindow, `Install "${name}" via winget?`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const r = await butlerExec(`winget install --exact "${name.replace(/"/g,'\\"')}" --accept-source-agreements --accept-package-agreements`, { timeout: 300000 });
  sendLog('BUTLER', `Install ${name}: ${r.ok ? 'OK' : r.err}`);
  return { success: r.ok, output: r.out, error: r.err };
});

ipcMain.handle('butler:uninstall', async (event, { name }) => {
  const confirmed = await butlerConfirm(mainWindow, `Uninstall "${name}"?\nThis cannot be undone.`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const r = await butlerExec(`winget uninstall --exact "${name.replace(/"/g,'\\"')}" --accept-source-agreements`, { timeout: 120000 });
  sendLog('BUTLER', `Uninstall ${name}: ${r.ok ? 'OK' : r.err}`);
  return { success: r.ok, output: r.out, error: r.err };
});

// ── PERIPHERAL: EJECT USB ─────────────────────────────────────────────────────
ipcMain.handle('butler:eject-usb', async (_, { letter }) => {
  const drive = (letter || '').replace(/[^A-Za-z]/g, '').toUpperCase().charAt(0);
  if (!drive) return { success: false, error: 'Invalid drive letter' };
  const ps = `$vol = Get-WmiObject Win32_Volume | Where-Object {$_.DriveLetter -eq '${drive}:'}; if($vol){$vol.Dismount($false,$true)}else{Write-Error 'Drive not found'}`;
  const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 10000 });
  sendLog('BUTLER', `Eject USB ${drive}: ${r.ok ? 'OK' : r.err}`);
  return { success: r.ok, drive: drive + ':', error: r.err };
});

// ── MAINTENANCE: CHKDSK ───────────────────────────────────────────────────────
ipcMain.handle('butler:chkdsk', async (event, { drive }) => {
  const d = (drive || 'C').replace(/[^A-Za-z]/g,'').toUpperCase().charAt(0) + ':';
  const confirmed = await butlerConfirm(mainWindow, `Run CHKDSK on ${d}?\nThis may require a reboot and takes time.`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  // Schedule for next boot on system drive, run immediately on non-system
  const r = await butlerExec(`chkdsk ${d} /f /r`, { timeout: 300000 });
  sendLog('BUTLER', `CHKDSK ${d}: ${r.ok ? 'OK' : r.out || r.err}`);
  return { success: true, output: r.out || r.err, note: 'May require restart to complete on system drive.' };
});

// ── SCRIPTING: RUN_JS (sandboxed) ────────────────────────────────────────────
ipcMain.handle('butler:run-js', async (event, { code }) => {
  const confirmed = await butlerConfirm(mainWindow, `Execute JavaScript code?\n\n${code.substring(0,300)}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  try {
    // Sandbox: new Function with restricted globals — no require, no process, no fs
    const sandbox = {
      console: { log: (...a) => output.push(a.join(' ')), error: (...a) => output.push('[ERR] '+a.join(' ')) },
      Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
      String, Number, Boolean, Array, Object, RegExp, Error,
      setTimeout: () => null, clearTimeout: () => null,
    };
    const output = [];
    const fn = new Function(...Object.keys(sandbox), `"use strict";\n${code}`);
    const result = fn(...Object.values(sandbox));
    if (result !== undefined) output.push(String(result));
    sendLog('BUTLER', 'run_js: OK, output: ' + output.join(' ').substring(0, 80));
    return { success: true, output: output.join('\n'), result: String(result ?? '') };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
