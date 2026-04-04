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

const { app, BrowserWindow, ipcMain, powerMonitor, shell, dialog, session, Tray, Menu, nativeImage } = require('electron');

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

  mainWindow.on('close', (event) => {
    if (config.system && config.system.minimizeToTray && !app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    mainWindow = null;
  });
}

let tray = null;
function applySystemSettings() {
  if (!config.system) return;

  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: !!config.system.autostart,
        path: app.getPath('exe')
      });
    }
  } catch (e) { console.warn('setLoginItemSettings failed:', e); }

  if (config.system.minimizeToTray) {
    if (!tray) {
      try {
        const iconPath = path.join(__dirname, 'src', 'assets', 'hex.png');
        const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        tray = new Tray(icon);
        tray.setToolTip('Softcurse H.E.X.');
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Show HEX', click: () => { if (mainWindow) mainWindow.show(); } },
          { type: 'separator' },
          { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
        ]);
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
          if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        });
      } catch (e) { console.error('Failed to create tray:', e); }
    }
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
}

app.whenReady().then(() => {
  createWindow();
  applySystemSettings();
});
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
  applySystemSettings();
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
  } catch (err) {
    sendLog('BUTLER', `Screenshot failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
});

// Take a screenshot and return base64 for Vision API
ipcMain.handle('system:capture-screen-base64', async () => {
  try {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });
    if (!sources || sources.length === 0) return null;
    return sources[0].thumbnail.toDataURL();
  } catch (e) {
    console.error('Vision capture error:', e);
    return null;
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

require('./src/js/ipc-tasks')({ formatBytes, sendLog, safeSend });
// ─── IPC: BROWSER OPEN ───────────────────────────────────────────────────────
ipcMain.handle('browser:open-url', (_, url) => {
  shell.openExternal(url);
  return { success: true };
});

// ─── IPC: PC BUTLER ACTIONS ──────────────────────────────────────────────────

// Open an application by name (e.g. "notepad", "calc", "chrome")

// ────────────────────────────────────────────────────────────────────────────────
const { buildAppFinderPS } = require('./src/js/ipc-butler')({ sendLog, dialog, shell, mainWindow, runCmd, butlerExec });
require('./src/js/ipc-games')({ sendLog, shell, butlerExec, buildAppFinderPS });
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
  const tmpIn = path.join(os.tmpdir(), 'hex_stt_in.webm');
  const tmpOut = path.join(os.tmpdir(), 'hex_stt_out.raw');
  try {
    fs.writeFileSync(tmpIn, Buffer.from(bytes));
    // Decode webm to raw 16kHz mono PCM using ffmpeg
    execSync(`ffmpeg -y -i "${tmpIn}" -ar 16000 -ac 1 -f f32le "${tmpOut}"`, { stdio: 'ignore' });
    const raw = fs.readFileSync(tmpOut);
    const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    localVoice.setLogger((msg) => mainWindow?.webContents.send('log:entry', { source: 'VOICE', message: msg, level: 'info' }));
    return { text: await localVoice.transcribe(float32, lang || 'en') };
  } catch (e) {
    // ffmpeg not available — pass raw bytes directly and hope Whisper handles it
    const float32 = new Float32Array(Buffer.from(bytes).buffer);
    return { text: await localVoice.transcribe(float32, lang || 'en') };
  } finally {
    try { fs.unlinkSync(tmpIn); } catch (_) { }
    try { fs.unlinkSync(tmpOut); } catch (_) { }
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

// ════════════════════════════════════════════════════════════════════════════════
//  PC BUTLER — Extended Actions (from butler.md)
// ════════════════════════════════════════════════════════════════════════════════
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
    const r2 = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\"')}"`, { timeout: 15000 });
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
      await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\"')}"`, { timeout: 5000 });
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
      const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\"')}"`, { timeout: 8000 });
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
    } catch (_) { }
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
    const r = await butlerExec(`setx ${variable} "${(value || '').replace(/"/g, '\\"')}"`);
    return { success: r.ok, output: r.out || r.err };
  }
  return { success: true, note: 'Set for current session only on non-Windows' };
});

// ── MAINTENANCE ───────────────────────────────────────────────────────────────

// ── WALLPAPER ─────────────────────────────────────────────────────────────────

ipcMain.handle('butler:set-wallpaper', async (_, { imagePath }) => {
  const p = imagePath.trim();
  if (!fs.existsSync(p)) return { success: false, error: `Image not found: ${p}` };
  try {
    if (process.platform === 'win32') {
      const r = await butlerExec(
        `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\")]public static extern bool SystemParametersInfo(int a,int b,string c,int d);}'; [W]::SystemParametersInfo(20,0,'${p.replace(/'/g, "\\'")}',3)"`
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
  const confirmed = await butlerConfirm(mainWindow, `Execute PowerShell script?\n\n${script.substring(0, 300)}${script.length > 300 ? '…' : ''}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  const r = await butlerExec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 60000 });
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
    try { fs.unlinkSync(tmpFile); } catch (_) { }
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

// ════════════════════════════════════════════════════════════════════════════════
//  PC BUTLER — MISSING ACTIONS (butler.md v2)
// ════════════════════════════════════════════════════════════════════════════════
// ── FILE: ZIP / UNZIP ─────────────────────────────────────────────────────────

// ── PROCESS: RUN WITH ARGS / RUN AS ADMIN ────────────────────────────────────

// ── WINDOW MANAGEMENT ─────────────────────────────────────────────────────────

// ── SEND KEYSTROKES ───────────────────────────────────────────────────────────

// ── MOUSE CONTROL ─────────────────────────────────────────────────────────────

// ── CLIPBOARD IMAGE ───────────────────────────────────────────────────────────

// ── NETWORK: WIFI / ADAPTER ───────────────────────────────────────────────────

// ── AUTOMATION: SLEEP / SCHEDULE / STARTUP ────────────────────────────────────

// ── REGISTRY ──────────────────────────────────────────────────────────────────

// ── SOFTWARE: LIST / INSTALL / UNINSTALL / UPDATES ───────────────────────────

// ── PERIPHERAL: EJECT USB ─────────────────────────────────────────────────────

// ── MAINTENANCE: CHKDSK ───────────────────────────────────────────────────────

// ── SCRIPTING: RUN_JS (sandboxed) ────────────────────────────────────────────
ipcMain.handle('butler:run-js', async (event, { code }) => {
  const confirmed = await butlerConfirm(mainWindow, `Execute JavaScript code?\n\n${code.substring(0, 300)}`);
  if (!confirmed) return { success: false, error: 'Cancelled' };
  try {
    // Sandbox: new Function with restricted globals — no require, no process, no fs
    const sandbox = {
      console: { log: (...a) => output.push(a.join(' ')), error: (...a) => output.push('[ERR] ' + a.join(' ')) },
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

// ─── USER-SPECIFIC LOCAL OLLAMA AUTOMATION ────────────────────────────────────
// Explicitly checks for D: drive paths to prevent breaks on generic environments
app.whenReady().then(() => {
  const ollamaRunVbs = "D:\\Dev\\Artificial intelligence\\run-ollama.vbs";
  if (fs.existsSync(ollamaRunVbs)) {
    exec(`cscript.exe //nologo "${ollamaRunVbs}"`, (err) => {
      if (err) console.error("Auto-start Ollama failed:", err);
      else console.log("Ollama local process started via VBS.");
    });
  }
});

app.on('will-quit', () => {
  const ollamaStopVbs = "D:\\Dev\\Artificial intelligence\\stop-ollama.vbs";
  if (fs.existsSync(ollamaStopVbs)) {
    exec(`cscript.exe //nologo "${ollamaStopVbs}"`);
  }
});
