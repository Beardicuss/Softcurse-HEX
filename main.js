'use strict';
// ════════════════════════════════════════════════════════════════════════════════
//  Softcurse H.E.X. — main.js (Phase 2 refactored bootstrap)
//
//  This file is intentionally small. All domain logic lives in main/*.js.
//  Wiring order matches the original file exactly — zero behavioral changes.
// ════════════════════════════════════════════════════════════════════════════════

// ── Suppress Electron's internal 'Render frame was disposed' stderr noise ─────
const _origConsoleError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Render frame was disposed')) return;
  if (args[1] instanceof Error && args[1].message?.includes('Render frame was disposed')) return;
  _origConsoleError.apply(console, args);
};

// ── Electron + Node core ───────────────────────────────────────────────────────
const {
  app, BrowserWindow, ipcMain, powerMonitor, shell, dialog,
  session, Tray, Menu, nativeImage, globalShortcut, safeStorage, screen, clipboard,
} = require('electron');

app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const schedule = require('node-schedule');
const si = require('systeminformation');
const PluginLoader = require('./src/js/plugin-loader');
const FaceAuth = require('./src/js/face-auth');
const webAgent = require('./src/js/web-agent');

// ── Path constants ─────────────────────────────────────────────────────────────
const userDataPath = process.env.HEX_USER_DATA || app.getPath('userData');
const CONFIG_PATH = path.join(userDataPath, 'config.json');

// ── Helpers ────────────────────────────────────────────────────────────────────
const { formatBytes, formatUptime, runCmd, butlerExec, makeButlerConfirm } =
  require('./src/main/helpers');

// ── Config ─────────────────────────────────────────────────────────────────────
const { loadConfig, saveConfig: _saveConfig } = require('./src/main/config');

let config = loadConfig(safeStorage, app, CONFIG_PATH);
const getConfig = () => config;
const setConfig = (cfg) => { config = cfg; };
const saveConfig = (cfg) => _saveConfig(safeStorage, cfg, CONFIG_PATH);

// ── Local voice engine ─────────────────────────────────────────────────────────
let localVoice;
try {
  localVoice = require('./local-voice/engine');
  const savedCfg = config;
  if (savedCfg.voice?.modelsDir) {
    localVoice.setModelsDir(savedCfg.voice.modelsDir);
  } else {
    const fallbackDir = path.join(app.getPath('userData'), 'voice-models');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    localVoice.setModelsDir(fallbackDir);
  }
  if (savedCfg.voice?.whisperSize) localVoice.setWhisperSize(savedCfg.voice.whisperSize);
} catch (e) { console.warn('Local voice not loaded:', e.message); }

// ── Window ref (shared mutable — modules use getWindow()) ─────────────────────
let mainWindow = null;
let localLlmProcess = null;
const getWindow = () => mainWindow;

// ── safeSend / sendLog (need window ref) ──────────────────────────────────────
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
function getBundledLlamaServerPath() {
  const candidates = [
    path.join('D:', 'Dev', 'Artificial intelligence', 'llama.cpp', 'llama-server.exe'),
    path.join(__dirname, 'bin', 'llama.cpp', 'llama-server.exe'),
    path.join(__dirname, 'llama-server.exe')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function isLocalLlmReachable(baseUrl) {
  try {
    const url = String(baseUrl || 'http://127.0.0.1:8080').replace(/\/+$/, '') + '/v1/models';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function startConfiguredLocalLlm() {
  const cfg = getConfig();
  if (!cfg.llm?.autoOllama) return;

  if (cfg.llm?.provider === 'llamacpp') {
    if (localLlmProcess && !localLlmProcess.killed) return;
    if (await isLocalLlmReachable(cfg.llm.baseUrl)) {
      console.log('Softcurse: llama.cpp server already reachable');
      sendLog('SYSTEM', 'Local Qwen brain already online.');
      return;
    }
    const serverPath = getBundledLlamaServerPath();
    const configuredModelPath = cfg.llm.ggufPath || path.join('models', 'qwen3', 'Qwen3-8B-Q4_K_M.gguf');
    const modelPath = path.isAbsolute(configuredModelPath) ? configuredModelPath : path.join(__dirname, configuredModelPath);
    if (!serverPath || !fs.existsSync(modelPath)) {
      console.warn('Softcurse: llama.cpp autostart skipped; missing server or model');
      sendLog('SYSTEM', 'Local Qwen autostart skipped: server or model file missing.');
      return;
    }
    const cpuCount = require('os').cpus()?.length || 8;
    const args = [
      '--model', modelPath,
      '--host', '127.0.0.1',
      '--port', '8080',
      '--ctx-size', '8192',
      '--threads', String(Math.max(4, Math.min(8, cpuCount)))
    ];
    localLlmProcess = spawn(serverPath, args, {
      cwd: path.dirname(serverPath),
      windowsHide: true,
      stdio: 'ignore'
    });
    localLlmProcess.unref();
    localLlmProcess.on('exit', () => { localLlmProcess = null; });
    console.log('Softcurse: llama.cpp Qwen auto-start requested');
    sendLog('SYSTEM', 'Starting local Qwen brain via llama.cpp...');
    return;
  }

  if (cfg.llm?.provider === 'ollama') {
    try {
      const vbsPath = path.join(__dirname, 'scripts', 'ollama', 'run-ollama.vbs');
      require('child_process').exec(`wscript.exe "${vbsPath}"`, (err) => {
        if (err) console.warn('Softcurse: Failed to auto-start local Ollama', err);
        else console.log('Softcurse: Ollama auto-started via bundled script');
      });
    } catch (_) { }
  }
}

function stopConfiguredLocalLlm() {
  const cfg = getConfig();
  if (!cfg.llm?.autoOllama) return;
  if (cfg.llm?.provider === 'llamacpp') {
    try {
      if (localLlmProcess && !localLlmProcess.killed) localLlmProcess.kill();
    } catch (err) {
      console.warn('Softcurse: Failed to stop llama.cpp process', err);
    }
    localLlmProcess = null;
    return;
  }
  if (cfg.llm?.provider === 'ollama') {
    try {
      const stopVbs = path.join(__dirname, 'scripts', 'ollama', 'stop-ollama.vbs');
      require('child_process').execSync(`wscript.exe "${stopVbs}"`, { timeout: 4000 });
    } catch (err) {
      console.warn('Softcurse: Failed to auto-stop local Ollama', err);
    }
  }
}

// ── Telemetry ─────────────────────────────────────────────────────────────────
const { startPolling } = require('./src/main/telemetry')({
  si, formatBytes, safeSend, powerMonitor, getConfig,
});

// ── Window + tray ──────────────────────────────────────────────────────────────
const { createWindow, applySystemSettings } = require('./src/main/window')({
  BrowserWindow, Tray, Menu, nativeImage, shell, app,
  getConfig,
  startPolling,
  onWindowCreated: (win) => { mainWindow = win; },
  onWindowClosed: () => { mainWindow = null; },
  sendLog,
});

// ── Live AI keys ───────────────────────────────────────────────────────────────
require('./src/main/live-keys')({ ipcMain, sendLog, getConfig, setConfig, saveConfig });

// ── Config IPC ────────────────────────────────────────────────────────────────
require('./src/main/ipc-config')({
  ipcMain, getConfig, setConfig, saveConfig, applySystemSettings, localVoice,
});

// ── Cloud continuity IPC ─────────────────────────────────────────────────────
require('./src/main/ipc-cloud')({
  ipcMain, getConfig, setConfig, saveConfig, sendLog,
});

// ── System IPC ────────────────────────────────────────────────────────────────
const SAFE_COMMANDS = ['echo', 'date', 'hostname', 'whoami', 'uptime', 'df', 'free', 'top', 'ps'];
require('./src/main/ipc-system')({
  ipcMain, ipcOn: ipcMain.on.bind(ipcMain),
  screen, shell, dialog, app,
  si, fetch,
  getConfig, getWindow,
  safeSend, sendLog,
  runCmd, butlerExec,
  SAFE_COMMANDS,
});

// ── Brain / memory / finetune IPC ─────────────────────────────────────────────
require('./src/main/ipc-brain')({ ipcMain, app });

// ── Voice IPC ─────────────────────────────────────────────────────────────────
require('./src/main/ipc-voice')({
  ipcMain, app, shell, dialog,
  localVoice,
  getConfig, setConfig, saveConfig,
  sendLog,
});

// ── Reminders + schedules IPC ─────────────────────────────────────────────────
const { loadPersistedReminders, loadPersistedSchedules, activeReminders } =
  require('./src/main/ipc-reminders')({ ipcMain, app, schedule, safeSend, sendLog });

// ── ipc-tasks (already extracted in earlier phase) ────────────────────────────
require('./src/js/ipc-tasks')({ formatBytes, sendLog, safeSend });

// ── ipc-butler (already extracted in earlier phase) ───────────────────────────
const { buildAppFinderPS } = require('./src/js/ipc-butler')({
  sendLog, dialog, shell,
  get mainWindow() { return mainWindow; },
  runCmd, butlerExec,
});
require('./src/js/ipc-games')({ sendLog, shell, butlerExec, buildAppFinderPS });

// ── Butler extended IPC ───────────────────────────────────────────────────────
require('./src/main/ipc-butler-extended')({
  ipcMain, app, shell, dialog,
  clipboard,
  getConfig, getWindow,
  butlerExec, sendLog,
  activeReminders,
});

// ── Browser IPC ───────────────────────────────────────────────────────────────
require('./src/main/ipc-browser')({
  ipcMain, app, shell,
  webAgent,
  butlerExec, sendLog,
});

// ── Clipboard history IPC ─────────────────────────────────────────────────────
const { startClipboardPolling } = require('./src/main/ipc-clipboard')({ ipcMain, clipboard });

// ── Plugins IPC ───────────────────────────────────────────────────────────────
const { loadAll: loadAllPlugins } = require('./src/main/ipc-plugins')({
  ipcMain, app, shell, dialog,
  PluginLoader,
  sendLog,
  butlerExec,
});

// ── Face auth IPC ─────────────────────────────────────────────────────────────
const { checkFaceAuthOnReady } = require('./src/main/ipc-face-auth')({
  ipcMain, app,
  FaceAuth,
  getWindow,
  sendLog,
});

// ── Hunter IPC ────────────────────────────────────────────────────────────────
const { scheduleHunter } = require('./src/main/ipc-hunter')({
  ipcMain, app,
  spawn,
  getConfig,
  sendLog,
});

// ════════════════════════════════════════════════════════════════════════════════
//  App lifecycle
// ════════════════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  createWindow();
  applySystemSettings();

  // Auto-start the selected local engine if configured.
  startConfiguredLocalLlm().catch((err) => {
    console.warn('Softcurse: Failed to auto-start local LLM', err);
    sendLog('SYSTEM', 'Local engine autostart failed: ' + (err?.message || String(err)), 'warn');
  });

  // Load persisted reminders and schedules
  loadPersistedReminders();
  loadPersistedSchedules();

  // Start clipboard history polling
  startClipboardPolling();

  // Copy bundled plugins + auto-load all discovered plugins
  loadAllPlugins();

  // Face auth lock-screen check
  checkFaceAuthOnReady();

  // Schedule background hunter
  scheduleHunter();

  // Global hotkey: Ctrl+Shift+H to summon HEX
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
  globalShortcut.unregisterAll();

  // Stop the selected local engine if HEX started it.
  stopConfiguredLocalLlm();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });




