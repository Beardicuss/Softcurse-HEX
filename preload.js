'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hexAPI', {
  // ── Config ────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  // ── Window controls ───────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // ── System info ───────────────────────────────
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  getProcesses: () => ipcRenderer.invoke('system:get-processes'),
  killProcess: (pid) => ipcRenderer.invoke('system:kill-process', pid),
  runTask: (id) => ipcRenderer.invoke('system:run-task', id),
  clearBrowserCache: () => ipcRenderer.invoke('system:clear-browser-cache'),
  safeExec: (cmd) => ipcRenderer.invoke('system:safe-exec', cmd),
  execWithConfirm: (cmd) => ipcRenderer.invoke('system:exec-with-confirm', cmd),

  // ── Browser ───────────────────────────────────
  openUrl: (url) => ipcRenderer.invoke('browser:open-url', url),

  // ── Butler (PC actions) ───────────────────────
  butler: {
    openApp: (name) => ipcRenderer.invoke('butler:open-app', name),
    createFile: (name, content) => ipcRenderer.invoke('butler:create-file', { name, content }),
    createDoc: (name, content) => ipcRenderer.invoke('butler:create-doc', { name, content }),
    openFolder: (folderPath) => ipcRenderer.invoke('butler:open-folder', folderPath),
    openFile: (filePath) => ipcRenderer.invoke('butler:open-file', filePath),
    emptyTrash: () => ipcRenderer.invoke('butler:empty-trash'),
    lockScreen: () => ipcRenderer.invoke('butler:lock-screen'),
    shutdown: () => ipcRenderer.invoke('butler:shutdown'),
    restart: () => ipcRenderer.invoke('butler:restart'),
  },

  // ── Reminders ─────────────────────────────────
  setReminder: (r) => ipcRenderer.invoke('reminders:set', r),
  cancelReminder: (id) => ipcRenderer.invoke('reminders:cancel', id),

  // ── Memory ───────────────────────────────────
  getMemory: () => ipcRenderer.invoke('memory:get'),
  setMemory: (data) => ipcRenderer.invoke('memory:set', data),
  clearMemory: () => ipcRenderer.invoke('memory:clear'),

  // ── Events → renderer ────────────────────────
  onSystemUpdate: (cb) => ipcRenderer.on('system:update', (_, d) => cb(d)),
  onActivityEvent: (cb) => ipcRenderer.on('activity:event', (_, d) => cb(d)),
  onTaskProgress: (cb) => ipcRenderer.on('task:progress', (_, d) => cb(d)),
  onReminderFire: (cb) => ipcRenderer.on('reminder:fire', (_, d) => cb(d)),
  onLogEntry: (cb) => ipcRenderer.on('log:entry', (_, d) => cb(d)),

  // ── Local Voice Engine ────────────────────────
  voice: {
    status: () => ipcRenderer.invoke('voice:status'),
    transcribe:    (samples, lang) => ipcRenderer.invoke('voice:transcribe',    { samples, lang }),
    transcribeRaw: (bytes,   lang) => ipcRenderer.invoke('voice:transcribeRaw', { bytes,   lang }),
    synthesize: (text, lang, speed) => ipcRenderer.invoke('voice:synthesize', { text, lang, speed }),
    downloadModels: (targets) => ipcRenderer.invoke('voice:download-models', targets),
    onDownloadProgress: (cb) => ipcRenderer.on('voice:download-progress', (_, d) => cb(d)),
    openModelsDir: () => ipcRenderer.invoke('voice:open-models-dir'),
    setModelsDir:  (dir) => ipcRenderer.invoke('voice:set-models-dir', dir),
    browseDir:     () => ipcRenderer.invoke('voice:browse-dir'),
  },

  // ── Cleanup ───────────────────────────────────
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
});

