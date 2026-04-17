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

const { app, BrowserWindow, ipcMain, powerMonitor, shell, dialog, session, Tray, Menu, nativeImage, globalShortcut, safeStorage } = require('electron');

// Audio safety flags
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const schedule = require('node-schedule');
const si = require('systeminformation');
const PluginLoader = require('./src/js/plugin-loader');
const FaceAuth = require('./src/js/face-auth');

// Local voice engine (Whisper STT + Piper TTS)
// ─── CONFIG ──────────────────────────────────────────────────────────────────
const userDataPath = process.env.HEX_USER_DATA || app.getPath('userData');
const CONFIG_PATH = path.join(userDataPath, 'config.json');
const MEMORY_PATH = path.join(userDataPath, 'memory.json');
const REMINDERS_PATH = path.join(userDataPath, 'reminders.json');
const SCHEDULES_PATH = path.join(userDataPath, 'schedules.json');
let localVoice;
try {
  localVoice = require('./local-voice/engine');
  // If config has a custom models path, apply it immediately
  const savedCfg = loadConfig();
  if (savedCfg.voice && savedCfg.voice.modelsDir) {
    localVoice.setModelsDir(savedCfg.voice.modelsDir);
  } else {
    // If installer removes bundled models, we MUST default to the user's writable AppData
    const fallbackDir = path.join(app.getPath('userData'), 'voice-models');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    localVoice.setModelsDir(fallbackDir);
  }
  // Restore saved whisper model size
  if (savedCfg.voice && savedCfg.voice.whisperSize) {
    localVoice.setWhisperSize(savedCfg.voice.whisperSize);
  }
} catch (e) { console.warn('Local voice not loaded:', e.message); }

// ─── CONFIG GLOBALS ARE NOW ALLOCATED AT TOP OF FILE ─────────────────────────

// ─── API KEY ENCRYPTION (Electron safeStorage → OS credential store) ─────────
const ENC_PREFIX = 'enc::';

function encryptKey(plaintext) {
  if (!plaintext || plaintext.startsWith(ENC_PREFIX)) return plaintext;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(plaintext);
      return ENC_PREFIX + buf.toString('base64');
    }
  } catch (_) { }
  return plaintext; // fallback: store plaintext if encryption unavailable
}

function decryptKey(stored) {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (_) { }
  return ''; // corrupted → return empty
}

function encryptApiKeys(cfg) {
  const c = JSON.parse(JSON.stringify(cfg)); // deep clone
  if (c.llm?.apiKey) c.llm.apiKey = encryptKey(c.llm.apiKey);
  if (c.llm?.apiKeys) {
    for (const [k, v] of Object.entries(c.llm.apiKeys)) {
      c.llm.apiKeys[k] = encryptKey(v);
    }
  }
  if (c.llm?.geminiVisionKey) c.llm.geminiVisionKey = encryptKey(c.llm.geminiVisionKey);
  if (c.voice?.gcloudTtsKey) c.voice.gcloudTtsKey = encryptKey(c.voice.gcloudTtsKey);
  return c;
}

function decryptApiKeys(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  if (c.llm?.apiKey) c.llm.apiKey = decryptKey(c.llm.apiKey);
  if (c.llm?.apiKeys) {
    for (const [k, v] of Object.entries(c.llm.apiKeys)) {
      c.llm.apiKeys[k] = decryptKey(v);
    }
  }
  if (c.llm?.geminiVisionKey) c.llm.geminiVisionKey = decryptKey(c.llm.geminiVisionKey);
  if (c.voice?.gcloudTtsKey) c.voice.gcloudTtsKey = decryptKey(c.voice.gcloudTtsKey);
  return c;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      let hasConfigChange = false;
      // Auto-migrate old AppData voice models path to the new local-voice default
      if (raw.voice && raw.voice.modelsDir && raw.voice.modelsDir.includes('AppData')) {
        raw.voice.modelsDir = path.join(app.getAppPath(), 'local-voice', 'models');
        hasConfigChange = true;
      }

      const hasPlainKeys = (raw.llm?.apiKey && !raw.llm.apiKey.startsWith(ENC_PREFIX))
        || (raw.llm?.apiKeys && Object.values(raw.llm.apiKeys).some(v => v && !v.startsWith(ENC_PREFIX)));

      if ((hasPlainKeys && safeStorage.isEncryptionAvailable()) || hasConfigChange) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(encryptApiKeys(raw), null, 2));
      }
      return decryptApiKeys(raw); // always return decrypted to runtime
    }
  } catch (_) { }
  return {
    language: 'ka',
    userName: 'Operator',
    llm: { provider: 'ollama', model: 'qwen2.5:7b', apiKey: '', baseUrl: 'http://localhost:11434' },
    voice: { enabled: true, wakeWord: 'hey hex', volume: 0.9, rate: 0.95, pitch: 0.85, voiceName: '' },
    monitoring: { breaks: true, breakIntervalMin: 90, idleThresholdMin: 5, proactiveAdvice: true },
    ui: { theme: 'cyber', notifications: true }
  };
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(encryptApiKeys(cfg), null, 2)); } catch (e) { console.error(e); }
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
  if (config.llm && config.llm.autoOllama) {
    try {
      const vbsPath = path.join(__dirname, 'scripts', 'ollama', 'run-ollama.vbs');
      exec(`wscript.exe "${vbsPath}"`, (err) => {
        if (err) console.warn('Softcurse: Failed to auto-start local Ollama', err);
        else console.log('Softcurse: Ollama auto-started via bundled script');
      });
    } catch (_) { }
  }
});

app.on('will-quit', () => {
  if (config.llm && config.llm.autoOllama) {
    try {
      const stopVbs = path.join(__dirname, 'scripts', 'ollama', 'stop-ollama.vbs');
      require('child_process').execSync(`wscript.exe "${stopVbs}"`, { timeout: 4000 });
    } catch (err) {
      console.warn('Softcurse: Failed to auto-stop local Ollama', err);
    }
  }
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

  let _pollCount = 0;
  let _lastTemp = '—';

  const poll = async () => {
    // Don't poll if window is gone
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      return;
    }
    _pollCount++;
    try {
      // Temperature is expensive on Windows (WMI) — only check every 6th cycle (~30s)
      const doTemp = (_pollCount % 6 === 0);
      const tasks = [
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
      ];
      if (doTemp) tasks.push(si.cpuTemperature());

      const results = await Promise.allSettled(tasks);

      const cpu = results[0].status === 'fulfilled' ? results[0].value : null;
      const m = results[1].status === 'fulfilled' ? results[1].value : null;
      const d = results[2].status === 'fulfilled' ? results[2].value : [];
      const n = results[3].status === 'fulfilled' ? results[3].value : [];
      if (doTemp) {
        const t = results[4].status === 'fulfilled' ? results[4].value : null;
        _lastTemp = t && t.main ? Math.round(t.main) + '°C' : '—';
      }

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
        temp: _lastTemp,
        ts: Date.now()
      };

      safeSend('system:update', payload);
    } catch (e) { /* silently skip */ }
  };

  poll();
  pollTimer = setInterval(poll, 5000);
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

// ─── AI LIVE KEYS: Parser, IPC Handler & File Watcher ────────────────────────
const LEAKED_KEYS_PATH = path.join(app.getPath('userData'), 'leaked-api-keys.json');

// Map the title-case provider names from the JSON to the lowercase IDs used in ai.js
const PROVIDER_NORM = {
  'anthropic': 'anthropic', 'Anthropic': 'anthropic',
  'openai': 'openai', 'OpenAI': 'openai',
  'mistral': 'mistral', 'Mistral': 'mistral',
  'together': 'together', 'Together AI': 'together',
  'grok': 'grok', 'xAI / Grok': 'grok', 'xAI': 'grok',
  'gemini': 'gemini', 'Google Gemini': 'gemini',
  'cohere': 'cohere', 'Cohere': 'cohere',
  'hf': 'hf', 'Hugging Face': 'hf', 'HuggingFace': 'hf',
  'replicate': 'replicate', 'Replicate': 'replicate',
};

let _liveApiKeys = {}; // { provider: [key1, key2, ...] }

function parseLeakedKeys() {
  try {
    const defaultKeysPath = path.join(__dirname, 'ai', 'leaked-api-keys.json');
    if (!fs.existsSync(LEAKED_KEYS_PATH) && fs.existsSync(defaultKeysPath)) {
      // Seed first run
      fs.copyFileSync(defaultKeysPath, LEAKED_KEYS_PATH);
    }

    if (!fs.existsSync(LEAKED_KEYS_PATH)) return {};
    const raw = fs.readFileSync(LEAKED_KEYS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const pool = {};
    if (!data.commits || !Array.isArray(data.commits)) return {};
    for (const commit of data.commits) {
      if (!commit.leaked_keys) continue;
      for (const k of commit.leaked_keys) {
        if (k.validity !== 'valid' || !k.value_full) continue;
        const provId = PROVIDER_NORM[k.provider] || PROVIDER_NORM[commit.provider] || (commit.provider || '').toLowerCase().replace(/\s+/g, '');
        if (!provId) continue;
        if (!pool[provId]) pool[provId] = [];
        // Deduplicate
        if (!pool[provId].includes(k.value_full)) {
          pool[provId].push(k.value_full);
        }
      }
    }
    return pool;
  } catch (err) {
    console.warn('Softcurse: Failed to parse leaked-api-keys.json', err.message);
    return {};
  }
}

// Initial load
_liveApiKeys = parseLeakedKeys();

ipcMain.handle('ai:get-live-keys', () => {
  return { success: true, keys: _liveApiKeys };
});

// File watcher: auto-reload when the hunter updates the JSON
let _liveKeysDebounce = null;
try {
  if (fs.existsSync(path.dirname(LEAKED_KEYS_PATH))) {
    fs.watch(LEAKED_KEYS_PATH, { persistent: false }, () => {
      // Debounce rapid writes
      if (_liveKeysDebounce) clearTimeout(_liveKeysDebounce);
      _liveKeysDebounce = setTimeout(() => {
        _liveApiKeys = parseLeakedKeys();
        safeSend('ai:live-keys-updated', _liveApiKeys);
        console.log('Softcurse: Live AI keys reloaded —', Object.keys(_liveApiKeys).map(p => `${p}:${_liveApiKeys[p].length}`).join(', '));
      }, 500);
    });
  }
} catch (e) { console.warn('Softcurse: Could not watch leaked-api-keys.json', e.message); }

// ─── WEB SUB-AGENT (Phase 14) ────────────────────────────────────────────────
const webAgent = require('./src/js/web-agent');

ipcMain.handle('web:scrape', async (_, url) => {
  sendLog('WEB', `Scraping: ${url}`, 'info');
  const result = await webAgent.scrapeUrl(url);
  if (result.success) sendLog('WEB', `Scraped "${result.title}" (${result.charCount} chars)`, 'info');
  else sendLog('WEB', `Scrape failed: ${result.error}`, 'warn');
  return result;
});

ipcMain.handle('web:search', async (_, query) => {
  sendLog('WEB', `Searching: "${query}"`, 'info');
  const result = await webAgent.searchWeb(query);
  if (result.success) sendLog('WEB', `Found ${result.count} results for "${query}"`, 'info');
  else sendLog('WEB', `Search failed: ${result.error}`, 'warn');
  return result;
});

// Clean up browser on quit
app.on('will-quit', () => { webAgent.closeBrowser().catch(() => { }); });

// ─── ADAPTIVE INTELLIGENCE (Phase 15) ────────────────────────────────────────
const BRAIN_PATH = path.join(app.getPath('userData'), 'hex-profile.json');

ipcMain.handle('brain:load', async () => {
  try {
    if (fs.existsSync(BRAIN_PATH)) {
      return JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf-8'));
    }
    return null;
  } catch (e) {
    console.warn('Brain load failed:', e.message);
    return null;
  }
});

ipcMain.handle('brain:save', async (_, data) => {
  try {
    fs.writeFileSync(BRAIN_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

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

// ─── IPC: FINE-TUNE DATA ─────────────────────────────────────────────────────
const FINETUNE_PATH = path.join(__dirname, 'hex-finetune.jsonl');

ipcMain.handle('finetune:append', (_, { lines }) => {
  try {
    const text = lines.join('\n') + '\n';
    fs.appendFileSync(FINETUNE_PATH, text, 'utf8');
    return { success: true, path: FINETUNE_PATH };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('finetune:get-path', () => {
  return { path: FINETUNE_PATH, exists: fs.existsSync(FINETUNE_PATH) };
});

ipcMain.handle('finetune:clear', () => {
  try {
    if (fs.existsSync(FINETUNE_PATH)) fs.unlinkSync(FINETUNE_PATH);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── IPC: WINDOW CONTROLS ────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close', () => mainWindow?.close());

const { screen } = require('electron');
let dragStartWindowPos = null;
let dragStartMousePos = null;

ipcMain.on('window:drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return;
  dragStartWindowPos = win.getPosition();
  dragStartMousePos = screen.getCursorScreenPoint();
});

ipcMain.on('window:drag-move', (event) => {
  if (!dragStartWindowPos || !dragStartMousePos) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return;
  const currentMousePos = screen.getCursorScreenPoint();
  const dx = currentMousePos.x - dragStartMousePos.x;
  const dy = currentMousePos.y - dragStartMousePos.y;
  win.setPosition(dragStartWindowPos[0] + dx, dragStartWindowPos[1] + dy);
});

ipcMain.on('window:drag-stop', () => {
  dragStartWindowPos = null;
  dragStartMousePos = null;
});

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
// ─── IPC: REMINDERS (PERSISTENT) ─────────────────────────────────────────────
const activeReminders = new Map();

function loadPersistedReminders() {
  try {
    if (!fs.existsSync(REMINDERS_PATH)) return;
    const saved = JSON.parse(fs.readFileSync(REMINDERS_PATH, 'utf8'));
    const now = Date.now();
    for (const r of saved) {
      const remaining = new Date(r.fireAt).getTime() - now;
      if (remaining > 0) {
        const job = schedule.scheduleJob(new Date(r.fireAt), () => {
          safeSend('reminder:fire', { id: r.id, label: r.label });
          sendLog('HEX', `Reminder fired: ${r.label}`, 'info');
          activeReminders.delete(r.id);
          savePersistedReminders();
        });
        activeReminders.set(r.id, { job, label: r.label, fireAt: r.fireAt });
      } else {
        // Missed reminder — fire immediately
        safeSend('reminder:fire', { id: r.id, label: r.label });
        sendLog('HEX', `Missed reminder fired: ${r.label}`, 'info');
      }
    }
    if (activeReminders.size > 0) sendLog('HEX', `Restored ${activeReminders.size} persisted reminder(s).`, 'info');
  } catch (e) { console.warn('Failed to load reminders:', e.message); }
}

function savePersistedReminders() {
  try {
    const arr = [];
    for (const [id, data] of activeReminders) {
      arr.push({ id, label: data.label, fireAt: data.fireAt });
    }
    fs.writeFileSync(REMINDERS_PATH, JSON.stringify(arr, null, 2));
  } catch (e) { console.warn('Failed to save reminders:', e.message); }
}

ipcMain.handle('reminders:set', (_, { id, label, delayMs }) => {
  if (activeReminders.has(id)) activeReminders.get(id).job.cancel();
  const fireAt = new Date(Date.now() + delayMs).toISOString();
  const job = schedule.scheduleJob(new Date(fireAt), () => {
    safeSend('reminder:fire', { id, label });
    sendLog('HEX', `Reminder fired: ${label}`, 'info');
    activeReminders.delete(id);
    savePersistedReminders();
  });
  activeReminders.set(id, { job, label, fireAt });
  savePersistedReminders();
  sendLog('HEX', `Reminder set: "${label}" in ${Math.round(delayMs / 60000)} min`, 'info');
  return { success: true, fireAt };
});

ipcMain.handle('reminders:cancel', (_, id) => {
  if (activeReminders.has(id)) {
    activeReminders.get(id).job.cancel();
    activeReminders.delete(id);
    savePersistedReminders();
    return { success: true };
  }
  return { success: false, error: 'Not found' };
});

// ─── RECURRING SCHEDULES ─────────────────────────────────────────────────────
const activeSchedules = new Map();

function loadPersistedSchedules() {
  try {
    if (!fs.existsSync(SCHEDULES_PATH)) return;
    const saved = JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf8'));
    for (const s of saved) {
      if (!s.id || !s.cron || !s.command) continue;
      const job = schedule.scheduleJob(s.cron, () => {
        safeSend('recurring:fire', { id: s.id, label: s.label, command: s.command });
        sendLog('HEX', `Schedule fired: ${s.label}`, 'info');
      });
      activeSchedules.set(s.id, { job, cron: s.cron, label: s.label, command: s.command });
    }
    if (activeSchedules.size > 0) sendLog('HEX', `Restored ${activeSchedules.size} persisted schedule(s).`, 'info');
  } catch (e) { console.warn('Failed to load schedules:', e.message); }
}

function savePersistedSchedules() {
  try {
    const arr = [];
    for (const [id, data] of activeSchedules) {
      arr.push({ id, cron: data.cron, label: data.label, command: data.command });
    }
    fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(arr, null, 2));
  } catch (e) { console.warn('Failed to save schedules:', e.message); }
}

ipcMain.handle('schedule:add-recurring', (_, { cron, label, command }) => {
  const id = 'sch_' + Date.now();
  try {
    const job = schedule.scheduleJob(cron, () => {
      safeSend('recurring:fire', { id, label, command });
      sendLog('HEX', `Schedule fired: ${label}`, 'info');
    });
    if (!job) throw new Error('Invalid CRON expression');
    activeSchedules.set(id, { job, cron, label, command });
    savePersistedSchedules();
    sendLog('HEX', `Recurring schedule created: "${label}" (${cron})`, 'info');
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('schedule:cancel-recurring', (_, { id }) => {
  if (activeSchedules.has(id)) {
    activeSchedules.get(id).job.cancel();
    activeSchedules.delete(id);
    savePersistedSchedules();
    sendLog('HEX', `Recurring schedule canceled: ${id}`, 'info');
    return { success: true };
  }
  return { success: false, error: 'Not found' };
});

ipcMain.handle('schedule:list-recurring', () => {
  const arr = [];
  for (const [id, data] of activeSchedules) {
    arr.push({ id, cron: data.cron, label: data.label, command: data.command });
  }
  return arr;
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

ipcMain.handle('voice:download-models', async (_, { targets, whisperSize }) => {
  if (!localVoice) throw new Error('Local voice engine not available');
  // Ensure the engine uses the user-configured models dir before downloading
  if (config.voice && config.voice.modelsDir) {
    localVoice.setModelsDir(config.voice.modelsDir);
  }
  // Save the selected whisper size to config for persistence
  if (whisperSize) {
    config.voice = { ...(config.voice || {}), whisperSize };
    saveConfig(config);
  }
  await localVoice.downloadModels(targets || ['stt', 'tts-en', 'tts-ru', 'tts-ka'], (progress) => {
    safeSend('voice:download-progress', progress);
  }, whisperSize || 'tiny');
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

// ─── SECONDARY LIFECYCLE HOOKS ─────────────────────────────────────────────
app.whenReady().then(() => {

  // ── Load persisted reminders ────────────────────────────────────────────────
  loadPersistedReminders();
  loadPersistedSchedules();

  // ── Global Hotkey: Ctrl+Shift+H to summon H.E.X. ───────────────────────────
  try {
    globalShortcut.register('Ctrl+Shift+H', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) { console.warn('Global shortcut registration failed:', e.message); }
});

app.on('will-quit', () => {
  // ── Unregister global shortcuts ──────────────────────────────────────────
  globalShortcut.unregisterAll();
});

// ─── IPC: OLLAMA MODEL DISCOVERY ─────────────────────────────────────────────
ipcMain.handle('ollama:list-models', async () => {
  try {
    const baseUrl = config.llm?.baseUrl || 'http://localhost:11434';
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      size: m.size ? Math.round(m.size / 1e9 * 10) / 10 + ' GB' : '?',
      modified: m.modified_at || ''
    }));
    return { success: true, models };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: WEATHER ────────────────────────────────────────────────────────────
ipcMain.handle('butler:weather', async (_, { city }) => {
  try {
    // First try wttr.in (no API key needed)
    const c = (city || '').trim().replace(/[^a-zA-Z0-9 ,.-]/g, '') || 'auto';
    const res = await fetch(`https://wttr.in/${encodeURIComponent(c)}?format=j1`, {
      headers: { 'User-Agent': 'HEX/1.1' }
    });
    if (!res.ok) return { success: false, error: `Weather API HTTP ${res.status}` };
    const data = await res.json();
    const cur = data.current_condition?.[0] || {};
    const area = data.nearest_area?.[0] || {};
    return {
      success: true,
      city: area.areaName?.[0]?.value || city || '?',
      country: area.country?.[0]?.value || '?',
      temp_c: cur.temp_C || '?',
      temp_f: cur.temp_F || '?',
      feels_like_c: cur.FeelsLikeC || '?',
      humidity: cur.humidity || '?',
      wind_kmph: cur.windspeedKmph || '?',
      wind_dir: cur.winddir16Point || '?',
      description: cur.weatherDesc?.[0]?.value || '?',
      uv: cur.uvIndex || '?',
      visibility_km: cur.visibility || '?',
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: QR CODE GENERATION ─────────────────────────────────────────────────
ipcMain.handle('butler:qr-code', async (_, { text }) => {
  try {
    const input = (text || '').trim();
    if (!input) return { success: false, error: 'No text provided' };
    // Use PowerShell + .NET to generate QR code as PNG
    const ts = Date.now();
    const outPath = path.join(os.homedir(), 'Desktop', `qr_${ts}.png`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(input)}`;
    const ps = `Invoke-WebRequest -Uri '${qrUrl}' -OutFile '${outPath}'`;
    const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 15000 });
    if (r.ok && fs.existsSync(outPath)) {
      shell.openPath(outPath);
      sendLog('BUTLER', `QR code saved: ${outPath}`);
      return { success: true, path: outPath };
    }
    return { success: false, error: r.err || 'QR generation failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: SPEED TEST ─────────────────────────────────────────────────────────
ipcMain.handle('butler:speed-test', async () => {
  try {
    // Download test (~10MB file) to measure speed
    const testUrl = 'https://speed.cloudflare.com/__down?bytes=10000000';
    const start = Date.now();
    const res = await fetch(testUrl);
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const buffer = await res.arrayBuffer();
    const elapsed = (Date.now() - start) / 1000;
    const sizeMB = buffer.byteLength / (1024 * 1024);
    const speedMbps = Math.round((sizeMB * 8 / elapsed) * 10) / 10;
    sendLog('BUTLER', `Speed test: ${speedMbps} Mbps (${sizeMB.toFixed(1)} MB in ${elapsed.toFixed(1)}s)`);
    return {
      success: true,
      download_mbps: speedMbps,
      size_mb: Math.round(sizeMB * 10) / 10,
      elapsed_sec: Math.round(elapsed * 10) / 10,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


// ─── IPC: MORNING DIGEST ─────────────────────────────────────────────────────
const LAST_DIGEST_PATH = path.join(app.getPath('userData'), 'last_digest.json');

ipcMain.handle('butler:morning-digest', async () => {
  try {
    // Check if we already ran today
    try {
      if (fs.existsSync(LAST_DIGEST_PATH)) {
        const last = JSON.parse(fs.readFileSync(LAST_DIGEST_PATH, 'utf8'));
        const today = new Date().toDateString();
        if (last.date === today) return { success: true, skipped: true, reason: 'Already briefed today' };
      }
    } catch (_) { }

    const results = {};

    // Weather
    try {
      const wRes = await fetch('https://wttr.in/?format=j1', { headers: { 'User-Agent': 'HEX/1.1' } });
      if (wRes.ok) {
        const w = await wRes.json();
        const cur = w.current_condition?.[0] || {};
        const area = w.nearest_area?.[0] || {};
        results.weather = {
          city: area.areaName?.[0]?.value || '?',
          temp: cur.temp_C + '°C',
          description: cur.weatherDesc?.[0]?.value || '?',
          humidity: cur.humidity + '%',
          wind: cur.windspeedKmph + ' km/h',
        };
      }
    } catch (_) { results.weather = null; }

    // System health
    try {
      const mem = process.memoryUsage();
      const uptime = os.uptime();
      const hrs = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      results.system = {
        uptime: `${hrs}h ${mins}m`,
        freeRAM: Math.round(os.freemem() / 1e9 * 10) / 10 + ' GB',
        totalRAM: Math.round(os.totalmem() / 1e9 * 10) / 10 + ' GB',
        cpuCores: os.cpus().length,
        platform: os.platform() + ' ' + os.release(),
      };
    } catch (_) { results.system = null; }

    // Pending reminders
    try {
      const pending = [];
      for (const [id, data] of activeReminders) {
        pending.push({ id, label: data.label, fireAt: data.fireAt });
      }
      results.reminders = pending;
    } catch (_) { results.reminders = []; }

    results.date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    results.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Mark as done for today
    fs.writeFileSync(LAST_DIGEST_PATH, JSON.stringify({ date: new Date().toDateString() }));

    return { success: true, skipped: false, digest: results };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: DICTIONARY ─────────────────────────────────────────────────────────
ipcMain.handle('butler:define', async (_, { word }) => {
  try {
    const w = (word || '').trim().replace(/[^a-zA-Z\s-]/g, '');
    if (!w) return { success: false, error: 'No word provided' };
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
    if (!res.ok) return { success: false, error: `Word "${w}" not found` };
    const data = await res.json();
    const entry = data[0] || {};
    const meanings = (entry.meanings || []).slice(0, 3).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).slice(0, 2).map(d => d.definition),
      example: m.definitions?.[0]?.example || null,
    }));
    return {
      success: true,
      word: entry.word || w,
      phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
      meanings,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: TRANSLATE ──────────────────────────────────────────────────────────
ipcMain.handle('butler:translate', async (_, { text, from, to }) => {
  try {
    const t = (text || '').trim();
    if (!t) return { success: false, error: 'No text provided' };
    const src = from || 'en';
    const tgt = to || 'ru';
    // Use MyMemory free API (no key needed, 5000 chars/day)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.substring(0, 500))}&langpair=${src}|${tgt}`;
    const res = await fetch(url);
    if (!res.ok) return { success: false, error: `Translation API HTTP ${res.status}` };
    const data = await res.json();
    return {
      success: true,
      original: t,
      translated: data.responseData?.translatedText || '?',
      from: src,
      to: tgt,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: SEND EMAIL ─────────────────────────────────────────────────────────
ipcMain.handle('butler:send-email', async (_, { to, subject, body }) => {
  try {
    if (!to || !subject) return { success: false, error: 'Missing to/subject' };
    // Use PowerShell Send-MailMessage (available on all Windows)
    // User must configure SMTP in config.json under smtp: { server, port, user, pass }
    const smtp = config.smtp;
    if (!smtp || !smtp.server || !smtp.user) {
      return { success: false, error: 'Email not configured. Set smtp.server, smtp.port, smtp.user, smtp.pass in config.' };
    }
    const ps = [
      `$pass = ConvertTo-SecureString '${smtp.pass}' -AsPlainText -Force`,
      `$cred = New-Object System.Management.Automation.PSCredential('${smtp.user}', $pass)`,
      `Send-MailMessage -From '${smtp.user}' -To '${to}' -Subject '${(subject || '').replace(/'/g, "''")}' -Body '${(body || '').replace(/'/g, "''")}' -SmtpServer '${smtp.server}' -Port ${smtp.port || 587} -UseSsl -Credential $cred`,
    ].join('; ');
    const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 30000 });
    if (r.ok) {
      sendLog('BUTLER', `Email sent to ${to}`);
      return { success: true, to, subject };
    }
    return { success: false, error: r.err || 'Send failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: YOUTUBE / MEDIA DOWNLOAD ───────────────────────────────────────────
ipcMain.handle('butler:download-media', async (_, { url, format }) => {
  try {
    if (!url) return { success: false, error: 'No URL provided' };
    const desktopDir = path.join(os.homedir(), 'Desktop');
    const fmt = format || 'best';

    // Try yt-dlp first (most capable)
    const ytdlpPaths = [
      'yt-dlp',  // in PATH
      path.join(os.homedir(), 'yt-dlp.exe'),
      'D:\\Tools\\yt-dlp.exe',
    ];

    let ytdlpBin = null;
    for (const p of ytdlpPaths) {
      try {
        const check = await butlerExec(`"${p}" --version`, { timeout: 5000 });
        if (check.ok) { ytdlpBin = p; break; }
      } catch (_) { }
    }

    if (ytdlpBin) {
      sendLog('BUTLER', `Downloading via yt-dlp: ${url}`);
      const outputTmpl = path.join(desktopDir, '%(title)s.%(ext)s');
      let cmd = `"${ytdlpBin}" -o "${outputTmpl}" "${url}"`;
      if (fmt === 'audio') cmd = `"${ytdlpBin}" -x --audio-format mp3 -o "${outputTmpl}" "${url}"`;
      else if (fmt === 'mp4') cmd = `"${ytdlpBin}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" -o "${outputTmpl}" "${url}"`;

      const r = await butlerExec(cmd, { timeout: 300000 }); // 5min timeout
      if (r.ok) {
        sendLog('BUTLER', `Download complete: ${url}`);
        return { success: true, method: 'yt-dlp', output: r.out?.substring(0, 500) || '' };
      }
      return { success: false, error: r.err || 'yt-dlp failed' };
    }

    // Fallback: direct download for simple URLs
    sendLog('BUTLER', `yt-dlp not found. Direct download: ${url}`);
    const ts = Date.now();
    const ext = url.match(/\.(mp4|mp3|webm|mkv|avi|wav|flac|ogg)/i)?.[1] || 'mp4';
    const outPath = path.join(desktopDir, `download_${ts}.${ext}`);
    const ps = `Invoke-WebRequest -Uri '${url}' -OutFile '${outPath}'`;
    const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 120000 });
    if (r.ok && fs.existsSync(outPath)) {
      shell.openPath(outPath);
      return { success: true, method: 'direct', path: outPath };
    }
    return { success: false, error: 'yt-dlp not installed and direct download failed. Install yt-dlp for YouTube support.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── PLUGIN SYSTEM ───────────────────────────────────────────────────────────
const pluginsDir = path.join(app.getPath('userData'), 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  sendLog('PLUGINS', msg);
});

ipcMain.handle('plugins:open-folder', async () => {
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  await shell.openPath(pluginsDir);
  return { success: true };
});

// Copy bundled sample plugins on first run
app.whenReady().then(() => {
  const bundledPluginsDir = path.join(__dirname, 'plugins');
  if (fs.existsSync(bundledPluginsDir)) {
    try {
      const entries = fs.readdirSync(bundledPluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dest = path.join(pluginsDir, entry.name);
        if (!fs.existsSync(dest)) {
          fs.cpSync(path.join(bundledPluginsDir, entry.name), dest, { recursive: true });
          console.log(`[Plugins] Copied bundled plugin: ${entry.name}`);
        }
      }
    } catch (e) { console.warn('Plugin copy error:', e.message); }
  }
  // Auto-load all discovered plugins
  const loaded = pluginLoader.loadAll();
  if (loaded.length) sendLog('PLUGINS', `${loaded.length} plugin(s) active.`);
});

ipcMain.handle('plugins:list', () => {
  return { success: true, plugins: pluginLoader.listLoaded() };
});

ipcMain.handle('plugins:discover', () => {
  return { success: true, plugins: pluginLoader.discover().map(m => ({ id: m.id, name: m.name, version: m.version, description: m.description, actions: m.actions })) };
});

ipcMain.handle('plugins:install-local', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Plugin ZIP File',
      filters: [{ name: 'Plugin Archives', extensions: ['zip'] }],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const zipPath = result.filePaths[0];
    const zipName = path.basename(zipPath, '.zip');
    const pluginId = zipName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const destDir = path.join(pluginsDir, pluginId);

    sendLog('PLUGINS', `Installing local plugin: ${pluginId} from ${zipPath}`);

    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });

    // Extract using powershell Expand-Archive
    await new Promise((resolve, reject) => {
      exec(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // Try hot-load by parsing the newly extracted manifest
    try {
      const manifestPath = path.join(destDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest._dir = destDir;
        manifest._mainPath = path.join(destDir, manifest.main);
        pluginLoader.loadPlugin(manifest);
      }
    } catch (e) {
      sendLog('PLUGINS', `Hot-load failed: ${e.message}`);
    }

    sendLog('PLUGINS', `Plugin "${pluginId}" installed successfully from local file.`);
    return { success: true, pluginId };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('plugins:remove', async (_, { id }) => {
  try {
    pluginLoader.unloadPlugin(id); // Hot unload
    const destDir = path.join(pluginsDir, id);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    sendLog('PLUGINS', `Removed plugin: ${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('plugins:load', (_, { id }) => {
  const manifests = pluginLoader.discover();
  const manifest = manifests.find(m => m.id === id);
  if (!manifest) return { success: false, error: `Plugin "${id}" not found` };
  const ok = pluginLoader.loadPlugin(manifest);
  return { success: ok, error: ok ? null : 'Failed to load plugin' };
});

ipcMain.handle('plugins:unload', (_, { id }) => {
  return { success: pluginLoader.unloadPlugin(id) };
});

ipcMain.handle('plugins:execute', async (_, { pluginId, action, args }) => {
  return await pluginLoader.execute(pluginId, action, args || []);
});

ipcMain.handle('plugins:get-action-tags', () => {
  return { success: true, tags: pluginLoader.getActionTags() };
});

// ─── IPC: BROWSER AUTOMATION ─────────────────────────────────────────────────
ipcMain.handle('butler:browser-open', async (_, { url }) => {
  try {
    if (!url) return { success: false, error: 'No URL provided' };
    await shell.openExternal(url);
    sendLog('BUTLER', `Opened in browser: ${url}`);
    return { success: true, url };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('butler:browser-search', async (_, { query }) => {
  try {
    if (!query) return { success: false, error: 'No query provided' };
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await shell.openExternal(searchUrl);
    sendLog('BUTLER', `Google search: ${query}`);
    return { success: true, query, url: searchUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('butler:browser-scrape', async (_, { url }) => {
  try {
    if (!url) return { success: false, error: 'No URL provided' };
    // Use PowerShell Invoke-WebRequest to grab page content
    const ps = `(Invoke-WebRequest -Uri '${url}' -UseBasicParsing).Content | Select-Object -First 1`;
    const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 15000 });
    if (r.ok) {
      // Extract text-like content, strip HTML tags
      let text = (r.out || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      text = text.substring(0, 3000); // Limit size
      return { success: true, url, text, length: text.length };
    }
    return { success: false, error: r.err || 'Scrape failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: CLIPBOARD HISTORY ─────────────────────────────────────────────────
const clipboardHistory = [];
const MAX_CLIP_HISTORY = 50;
let lastClipText = '';

function pollClipboard() {
  try {
    const { clipboard } = require('electron');
    const current = clipboard.readText();
    if (current && current !== lastClipText && current.trim().length > 0) {
      lastClipText = current;
      clipboardHistory.unshift({ text: current.substring(0, 1000), ts: Date.now() });
      if (clipboardHistory.length > MAX_CLIP_HISTORY) clipboardHistory.pop();
    }
  } catch (_) { }
}

app.whenReady().then(() => setInterval(pollClipboard, 2000));

ipcMain.handle('clipboard:history', () => {
  return { success: true, items: clipboardHistory.slice(0, 30) };
});

ipcMain.handle('clipboard:search', (_, { query }) => {
  const q = (query || '').toLowerCase();
  const found = clipboardHistory.filter(c => c.text.toLowerCase().includes(q));
  return { success: true, items: found.slice(0, 20) };
});

ipcMain.handle('clipboard:paste-item', (_, { index }) => {
  const item = clipboardHistory[index];
  if (!item) return { success: false, error: 'Invalid index' };
  require('electron').clipboard.writeText(item.text);
  return { success: true, text: item.text.substring(0, 100) };
});

// ─── IPC: SYSTEM HEALTH MONITOR ──────────────────────────────────────────────
ipcMain.handle('system:health', async () => {
  try {
    const [cpu, mem, disk, temp, battery, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.cpuTemperature().catch(() => null),
      si.battery().catch(() => null),
      si.networkStats().catch(() => null),
    ]);

    const result = {
      cpu: {
        load: Math.round(cpu.currentLoad * 10) / 10,
        cores: cpu.cpus?.length || os.cpus().length,
      },
      ram: {
        total_gb: Math.round(mem.total / 1e9 * 10) / 10,
        used_gb: Math.round(mem.active / 1e9 * 10) / 10,
        free_gb: Math.round(mem.available / 1e9 * 10) / 10,
        percent: Math.round(mem.active / mem.total * 100),
      },
      disks: (disk || []).map(d => ({
        mount: d.mount,
        size_gb: Math.round(d.size / 1e9),
        used_gb: Math.round(d.used / 1e9),
        percent: Math.round(d.use),
      })),
      temperature: temp?.main ? Math.round(temp.main) + '°C' : null,
      battery: battery?.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null,
      network: net?.[0] ? {
        iface: net[0].iface,
        rx_sec: Math.round(net[0].rx_sec / 1024) + ' KB/s',
        tx_sec: Math.round(net[0].tx_sec / 1024) + ' KB/s',
      } : null,
      uptime_hrs: Math.round(os.uptime() / 3600 * 10) / 10,
    };

    // Alerts
    result.alerts = [];
    if (result.ram.percent > 85) result.alerts.push(`⚠ RAM usage: ${result.ram.percent}%`);
    if (result.cpu.load > 80) result.alerts.push(`⚠ CPU load: ${result.cpu.load}%`);
    for (const d of result.disks) {
      if (d.percent > 90) result.alerts.push(`⚠ Disk ${d.mount}: ${d.percent}% full`);
    }
    if (temp?.main && temp.main > 80) result.alerts.push(`🔥 CPU temp: ${temp.main}°C`);

    return { success: true, health: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: SMART FILE OPERATIONS ──────────────────────────────────────────────
ipcMain.handle('butler:batch-rename', async (_, { dir, pattern, replacement }) => {
  try {
    if (!dir || !pattern) return { success: false, error: 'Missing dir or pattern' };
    const files = fs.readdirSync(dir);
    const regex = new RegExp(pattern, 'gi');
    let count = 0;
    for (const file of files) {
      const newName = file.replace(regex, replacement || '');
      if (newName !== file) {
        fs.renameSync(path.join(dir, file), path.join(dir, newName));
        count++;
      }
    }
    return { success: true, renamed: count };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('butler:organize-files', async (_, { dir }) => {
  try {
    if (!dir) return { success: false, error: 'No directory' };
    const files = fs.readdirSync(dir, { withFileTypes: true });
    const typeMap = {
      images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico'],
      videos: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'],
      audio: ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.wma', '.m4a'],
      documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
      archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
      code: ['.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.java', '.cpp', '.c', '.h', '.rs', '.go'],
    };
    let moved = 0;
    for (const file of files) {
      if (!file.isFile()) continue;
      const ext = path.extname(file.name).toLowerCase();
      let category = 'other';
      for (const [cat, exts] of Object.entries(typeMap)) {
        if (exts.includes(ext)) { category = cat; break; }
      }
      const destDir = path.join(dir, category);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir);
      fs.renameSync(path.join(dir, file.name), path.join(destDir, file.name));
      moved++;
    }
    return { success: true, organized: moved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('butler:find-duplicates', async (_, { dir }) => {
  try {
    if (!dir) return { success: false, error: 'No directory' };
    const files = fs.readdirSync(dir, { withFileTypes: true }).filter(f => f.isFile());
    const sizeMap = new Map();
    for (const f of files) {
      const stat = fs.statSync(path.join(dir, f.name));
      const key = stat.size;
      if (!sizeMap.has(key)) sizeMap.set(key, []);
      sizeMap.get(key).push(f.name);
    }
    const duplicates = [...sizeMap.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([size, names]) => ({ size, files: names }));
    return { success: true, duplicates, total: duplicates.reduce((s, d) => s + d.files.length, 0) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC: SCREEN RECORDING ───────────────────────────────────────────────────
let screenRecordProcess = null;

ipcMain.handle('butler:record-screen', async (_, { action }) => {
  const desktopDir = path.join(os.homedir(), 'Desktop');

  if (action === 'start' || action === 'START') {
    if (screenRecordProcess) return { success: false, error: 'Already recording' };
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(desktopDir, `recording_${ts}.mp4`);

    try {
      // Use ffmpeg with gdigrab (Windows) for screen + audio capture
      const ffmpegPaths = ['ffmpeg', 'D:\\Tools\\ffmpeg.exe', path.join(os.homedir(), 'ffmpeg.exe')];
      let ffmpegBin = null;
      for (const p of ffmpegPaths) {
        try {
          const check = await butlerExec(`"${p}" -version`, { timeout: 3000 });
          if (check.ok) { ffmpegBin = p; break; }
        } catch (_) { }
      }

      if (!ffmpegBin) {
        // Fallback: use PowerShell screen recorder via .NET
        const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen`;
        return { success: false, error: 'ffmpeg not found. Install ffmpeg for screen recording with audio.' };
      }

      // Start ffmpeg recording: screen (gdigrab) + system audio (dshow)
      const args = [
        '-f', 'gdigrab', '-framerate', '30', '-i', 'desktop',
        '-f', 'dshow', '-i', 'audio=Stereo Mix',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-y', outPath
      ];

      // Try with audio first, fall back to video-only
      try {
        screenRecordProcess = spawn(ffmpegBin, args, { stdio: 'pipe' });
      } catch (_) {
        // Fallback: video only (no audio device)
        const videoArgs = [
          '-f', 'gdigrab', '-framerate', '30', '-i', 'desktop',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-y', outPath
        ];
        screenRecordProcess = spawn(ffmpegBin, videoArgs, { stdio: 'pipe' });
      }

      screenRecordProcess._outPath = outPath;
      screenRecordProcess.on('exit', () => { screenRecordProcess = null; });
      screenRecordProcess.on('error', (e) => {
        sendLog('BUTLER', `Recording error: ${e.message}`);
        screenRecordProcess = null;
      });

      sendLog('BUTLER', `Screen recording started: ${outPath}`);
      return { success: true, status: 'recording', path: outPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (action === 'stop' || action === 'STOP') {
    if (!screenRecordProcess) return { success: false, error: 'Not recording' };
    const outPath = screenRecordProcess._outPath;
    try {
      // Send 'q' to ffmpeg to gracefully stop
      screenRecordProcess.stdin.write('q');
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (screenRecordProcess) {
        screenRecordProcess.kill('SIGINT');
        screenRecordProcess = null;
      }
    } catch (_) {
      screenRecordProcess?.kill();
      screenRecordProcess = null;
    }
    sendLog('BUTLER', `Screen recording saved: ${outPath}`);
    if (outPath && fs.existsSync(outPath)) shell.openPath(outPath);
    return { success: true, status: 'stopped', path: outPath };
  }

  return { success: false, error: 'Invalid action. Use START or STOP.' };
});

// ─── FACE RECOGNITION AUTH ───────────────────────────────────────────────────
const faceAuth = new FaceAuth(app.getPath('userData'), (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  sendLog('SECURITY', msg);
});

ipcMain.handle('face-auth:settings', () => {
  return { success: true, ...faceAuth.getSettings() };
});

ipcMain.handle('face-auth:enable', () => {
  return faceAuth.enable();
});

ipcMain.handle('face-auth:disable', () => {
  return faceAuth.disable();
});

ipcMain.handle('face-auth:enroll', (_, { imageDataUrl }) => {
  return faceAuth.enroll(imageDataUrl);
});

ipcMain.handle('face-auth:unenroll', () => {
  return faceAuth.unenroll();
});

ipcMain.handle('face-auth:verify', (_, { imageDataUrl }) => {
  return faceAuth.verify(imageDataUrl);
});

ipcMain.handle('face-auth:set-threshold', (_, { value }) => {
  return faceAuth.setThreshold(value);
});

// On app ready, send face-auth status to renderer so it can show lock screen if needed
app.whenReady().then(() => {
  setTimeout(() => {
    if (mainWindow && faceAuth.isEnabled()) {
      mainWindow.webContents.send('face-auth:required', faceAuth.getSettings());
    }
  }, 1500);

  // Phase 13: Background Credential Hunter Spawn (with recursive auto-scheduling)
  try {
    const hunterScript = path.join(__dirname, 'ai', 'credential-hunter.js');
    const hunterTimestampFile = path.join(app.getPath('userData'), 'hunter-last-run.json');
    let _hunterTimer = null;

    function scheduleHunter() {
      if (_hunterTimer) { clearTimeout(_hunterTimer); _hunterTimer = null; }
      if (!fs.existsSync(hunterScript) || app.isQuiting) return;

      const userLimitMinutes = config.llm?.hunterLimitMinutes || 1440;
      const HUNTER_COOLDOWN_MS = userLimitMinutes * 60 * 1000;
      let delayMs = 0;

      try {
        if (fs.existsSync(hunterTimestampFile)) {
          const { lastRun } = JSON.parse(fs.readFileSync(hunterTimestampFile, 'utf8'));
          const elapsed = Date.now() - lastRun;
          if (elapsed < HUNTER_COOLDOWN_MS) delayMs = HUNTER_COOLDOWN_MS - elapsed;
        }
      } catch (_) { /* corrupt file */ }

      if (delayMs > 0) {
        sendLog('HUNTER', `Sleeping. Next run automatically in ${Math.ceil(delayMs / 60000)} min.`, 'info');
      } else {
        sendLog('HUNTER', `Cooldown passed. Launching credential hunter now...`, 'info');
      }

      _hunterTimer = setTimeout(() => {
        _hunterTimer = null;
        if (app.isQuiting) return;
        try {
          fs.writeFileSync(hunterTimestampFile, JSON.stringify({ lastRun: Date.now(), date: new Date().toISOString() }));
          sendLog('HUNTER', `Spawning ai/credential-hunter.js (interval: ${userLimitMinutes} min)`, 'info');
          const hunterProc = spawn('node', [hunterScript], {
            cwd: __dirname,
            env: { ...process.env, HEX_USER_DATA: String(app.getPath('userData')), HEX_HUNTER_LIMIT: String(userLimitMinutes) },
            stdio: ['ignore', 'pipe', 'pipe']
          });

          let stdoutBuffer = '';
          hunterProc.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop();
            for (const line of lines) if (line.trim()) sendLog('HUNTER', line.trim(), 'info');
          });

          let stderrBuffer = '';
          hunterProc.stderr.on('data', (chunk) => {
            stderrBuffer += chunk.toString();
            const lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop();
            for (const line of lines) if (line.trim()) sendLog('HUNTER', line.trim(), 'warn');
          });

          hunterProc.on('close', (code) => {
            sendLog('HUNTER', `Credential hunter finished (code ${code}). Next run in ${userLimitMinutes} min.`, 'info');
            scheduleHunter();
          });

          hunterProc.unref();
        } catch (err) {
          sendLog('SYSTEM', 'Fatal error spawning hunter: ' + err.message, 'warn');
          // Reschedule defensively
          setTimeout(scheduleHunter, 60000); // Wait 1 minute and retry
        }
      }, delayMs);
    }

    // Expose reschedule so saving settings can kick it live
    ipcMain.handle('hunter:reschedule', () => {
      sendLog('HUNTER', 'Settings changed — rescheduling credential hunter.', 'info');
      scheduleHunter();
      return { success: true };
    });

    ipcMain.handle('hunter:status', () => {
      const userLimitMinutes = config.llm?.hunterLimitMinutes || 1440;
      const HUNTER_COOLDOWN_MS = userLimitMinutes * 60 * 1000;
      let delayMs = 0;
      try {
        if (fs.existsSync(hunterTimestampFile)) {
          const { lastRun } = JSON.parse(fs.readFileSync(hunterTimestampFile, 'utf8'));
          const elapsed = Date.now() - lastRun;
          if (elapsed < HUNTER_COOLDOWN_MS) delayMs = HUNTER_COOLDOWN_MS - elapsed;
        }
      } catch (_) { }
      return { delayMs, userLimitMinutes };
    });

    scheduleHunter();

  } catch (e) {
    sendLog('SYSTEM', 'Failed to launch credential hunter: ' + e.message, 'warn');
  }
});
