'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hexAPI', {
  // ── Config ────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  // ── Memory ────────────────────────────────────
  getMemory: () => ipcRenderer.invoke('memory:get'),
  setMemory: (data) => ipcRenderer.invoke('memory:set', data),

  // ── Fine-tune data ────────────────────────────
  appendFinetune: (lines) => ipcRenderer.invoke('finetune:append', { lines }),
  getFinetunePath: () => ipcRenderer.invoke('finetune:get-path'),
  clearFinetune: () => ipcRenderer.invoke('finetune:clear'),

  // ── Window controls ───────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  windowDragStart: () => ipcRenderer.send('window:drag-start'),
  windowDragMove: () => ipcRenderer.send('window:drag-move'),
  windowDragStop: () => ipcRenderer.send('window:drag-stop'),

  // ── System info ───────────────────────────────
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  getProcesses: () => ipcRenderer.invoke('system:get-processes'),
  killProcess: (pid) => ipcRenderer.invoke('system:kill-process', pid),
  runTask: (id) => ipcRenderer.invoke('system:run-task', id),
  clearBrowserCache: () => ipcRenderer.invoke('system:clear-browser-cache'),
  safeExec: (cmd) => ipcRenderer.invoke('system:safe-exec', cmd),
  execWithConfirm: (cmd) => ipcRenderer.invoke('system:exec-with-confirm', cmd),
  captureScreenBase64: () => ipcRenderer.invoke('system:capture-screen-base64'),

  // ── Browser ───────────────────────────────────
  openUrl: (url) => ipcRenderer.invoke('browser:open-url', url),

  // ── Butler (PC actions) ───────────────────────
  butler: {
    scanApps: () => ipcRenderer.invoke('butler:scan-apps'),
    // ── Originals ──────────────────────────────────────────
    openApp: (name) => ipcRenderer.invoke('butler:open-app', name),
    findFiles: (query, category, maxResults) => ipcRenderer.invoke('butler:find-files', { query, category, maxResults }),
    findExeInFolder: (folderPath, appName) => ipcRenderer.invoke('butler:find-exe-in-folder', { folderPath, appName }),
    createFile: (name, content) => ipcRenderer.invoke('butler:create-file', { name, content }),
    createDoc: (name, content) => ipcRenderer.invoke('butler:create-doc', { name, content }),
    openFolder: (p) => ipcRenderer.invoke('butler:open-folder', p),
    openFile: (p) => ipcRenderer.invoke('butler:open-file', p),
    emptyTrash: () => ipcRenderer.invoke('butler:empty-trash'),
    lockScreen: () => ipcRenderer.invoke('butler:lock-screen'),
    shutdown: () => ipcRenderer.invoke('butler:shutdown'),
    restart: () => ipcRenderer.invoke('butler:restart'),
    screenshot: () => ipcRenderer.invoke('butler:screenshot'),
    // ── File & Folder ──────────────────────────────────────
    copy: (src, dest) => ipcRenderer.invoke('butler:copy', { src, dest }),
    move: (src, dest) => ipcRenderer.invoke('butler:move', { src, dest }),
    delete: (item, permanent) => ipcRenderer.invoke('butler:delete', { item, permanent }),
    rename: (oldPath, newPath) => ipcRenderer.invoke('butler:rename', { oldPath, newPath }),
    createFolder: (p) => ipcRenderer.invoke('butler:create-folder', { folderPath: p }),
    listDir: (p) => ipcRenderer.invoke('butler:list-dir', { dirPath: p }),
    fileInfo: (p) => ipcRenderer.invoke('butler:file-info', { filePath: p }),
    // ── Process & System ───────────────────────────────────
    listProcesses: () => ipcRenderer.invoke('butler:list-processes'),
    killByName: (name) => ipcRenderer.invoke('butler:kill-by-name', { name }),
    sysInfo: () => ipcRenderer.invoke('butler:sys-info'),
    battery: () => ipcRenderer.invoke('butler:battery'),
    diskUsage: (p) => ipcRenderer.invoke('butler:disk-usage', { drivePath: p }),
    // ── Clipboard ──────────────────────────────────────────
    getClipboard: () => ipcRenderer.invoke('butler:get-clipboard'),
    setClipboard: (text) => ipcRenderer.invoke('butler:set-clipboard', { text }),
    clearClipboard: () => ipcRenderer.invoke('butler:clear-clipboard'),
    // ── Audio ──────────────────────────────────────────────
    setVolume: (level) => ipcRenderer.invoke('butler:set-volume', { level }),
    mute: (mute) => ipcRenderer.invoke('butler:mute', { mute }),
    getVolume: () => ipcRenderer.invoke('butler:get-volume'),
    // ── Network ────────────────────────────────────────────
    getIp: () => ipcRenderer.invoke('butler:get-ip'),
    ping: (host) => ipcRenderer.invoke('butler:ping', { host }),
    flushDns: () => ipcRenderer.invoke('butler:flush-dns'),
    listWifi: () => ipcRenderer.invoke('butler:list-wifi'),
    // ── Environment ────────────────────────────────────────
    getEnv: (variable) => ipcRenderer.invoke('butler:get-env', { variable }),
    setEnv: (variable, value) => ipcRenderer.invoke('butler:set-env', { variable, value }),
    // ── Maintenance ────────────────────────────────────────
    cleanTemp: () => ipcRenderer.invoke('butler:clean-temp'),
    weather: (city) => ipcRenderer.invoke('butler:weather', { city }),
    qrCode: (text) => ipcRenderer.invoke('butler:qr-code', { text }),
    speedTest: () => ipcRenderer.invoke('butler:speed-test'),
    morningDigest: () => ipcRenderer.invoke('butler:morning-digest'),
    define: (word) => ipcRenderer.invoke('butler:define', { word }),
    translate: (text, from, to) => ipcRenderer.invoke('butler:translate', { text, from, to }),
    sendEmail: (to, subject, body) => ipcRenderer.invoke('butler:send-email', { to, subject, body }),
    downloadMedia: (url, format) => ipcRenderer.invoke('butler:download-media', { url, format }),
    setWallpaper: (imagePath) => ipcRenderer.invoke('butler:set-wallpaper', { imagePath }),
    // ── Scripting ──────────────────────────────────────────
    runPs: (script) => ipcRenderer.invoke('butler:run-ps', { script }),
    runCmd: (command) => ipcRenderer.invoke('butler:run-cmd', { command }),
    logoff: () => ipcRenderer.invoke('butler:logoff'),
    // ── Game launchers ─────────────────────────────────────────
    getSteamGames: () => ipcRenderer.invoke('butler:get-steam-games'),
    getEpicGames: () => ipcRenderer.invoke('butler:get-epic-games'),
    launchGame: (gameName) => ipcRenderer.invoke('butler:launch-game', { gameName }),
    // ── New in v3 ──────────────────────────────────────────────
    zip: (src, out) => ipcRenderer.invoke('butler:zip', { source: src, output: out }),
    unzip: (zip, dest) => ipcRenderer.invoke('butler:unzip', { zipPath: zip, dest }),
    run: (cmd, args) => ipcRenderer.invoke('butler:run', { cmd, args }),
    runAsAdmin: (cmd) => ipcRenderer.invoke('butler:run-as-admin', { cmd }),
    listWindows: () => ipcRenderer.invoke('butler:list-windows'),
    windowAction: (action, title) => ipcRenderer.invoke('butler:window-action', { action, title }),
    sendKeys: (keys) => ipcRenderer.invoke('butler:send-keys', { keys }),
    mouseMove: (x, y) => ipcRenderer.invoke('butler:mouse-move', { x, y }),
    mouseClick: (button) => ipcRenderer.invoke('butler:mouse-click', { button }),
    pasteClipboard: () => ipcRenderer.invoke('butler:paste-clipboard'),
    getClipboardImg: () => ipcRenderer.invoke('butler:get-clipboard-img'),
    connectWifi: (ssid, password) => ipcRenderer.invoke('butler:connect-wifi', { ssid, password }),
    netAdapter: (adapter, action) => ipcRenderer.invoke('butler:net-adapter', { adapter, action }),
    sleep: (seconds) => ipcRenderer.invoke('butler:sleep', { seconds }),
    scheduleOnce: (time, command) => ipcRenderer.invoke('butler:schedule-once', { time, command }),
    cancelTask: (taskName) => ipcRenderer.invoke('butler:cancel-task', { taskName }),
    startup: (action, cmd, name) => ipcRenderer.invoke('butler:startup', { action, cmd, name }),
    regRead: (hive, key, value) => ipcRenderer.invoke('butler:reg-read', { hive, key, value }),
    regWrite: (hive, key, value, data, type) => ipcRenderer.invoke('butler:reg-write', { hive, key, value, data, type }),
    listSoftware: () => ipcRenderer.invoke('butler:list-software'),
    uninstall: (name) => ipcRenderer.invoke('butler:uninstall', { name }),
    checkUpdates: () => ipcRenderer.invoke('butler:check-updates'),
    installPkg: (name) => ipcRenderer.invoke('butler:install-pkg', { name }),
    ejectUsb: (letter) => ipcRenderer.invoke('butler:eject-usb', { letter }),
    runJs: (code) => ipcRenderer.invoke('butler:run-js', { code }),
    chkdsk: (drive) => ipcRenderer.invoke('butler:chkdsk', { drive }),
    // aliases used by action parser
    deletePerm: (item) => ipcRenderer.invoke('butler:delete', { item, permanent: true }),
    killPid: (pid) => ipcRenderer.invoke('system:kill-process', pid),
    unmute: () => ipcRenderer.invoke('butler:mute', { mute: false }),
    getSteamGames: () => ipcRenderer.invoke('butler:get-steam-games'),
    getEpicGames: () => ipcRenderer.invoke('butler:get-epic-games'),
    // Ghost Tags Action Bridging
    findFile: (name, root) => ipcRenderer.invoke('butler:find-file', { name, root }),
    grepFile: (pattern, file) => ipcRenderer.invoke('butler:grep-file', { pattern, file }),
    runPython: (script) => ipcRenderer.invoke('butler:run-python', { script }),
    gitCommand: (cmd, repo) => ipcRenderer.invoke('butler:git', { cmd, repo }),
    dockerStatus: () => ipcRenderer.invoke('butler:docker-status'),
    notify: (title, message) => ipcRenderer.invoke('butler:notify', { title, message }),
    recordScreen: (action) => ipcRenderer.invoke('butler:record-screen', { action }),
  },

  // ── Ollama ──────────────────────────────────────
  ollamaListModels: () => ipcRenderer.invoke('ollama:list-models'),

  // ── Plugins ─────────────────────────────────────
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    discover: () => ipcRenderer.invoke('plugins:discover'),
    load: (id) => ipcRenderer.invoke('plugins:load', { id }),
    unload: (id) => ipcRenderer.invoke('plugins:unload', { id }),
    execute: (pluginId, action, args) => ipcRenderer.invoke('plugins:execute', { pluginId, action, args }),
    getActionTags: () => ipcRenderer.invoke('plugins:get-action-tags'),
    openFolder: () => ipcRenderer.invoke('plugins:open-folder'),
  },

  // ── Browser Automation ──────────────────────────
  browser: {
    open: (url) => ipcRenderer.invoke('butler:browser-open', { url }),
    search: (query) => ipcRenderer.invoke('butler:browser-search', { query }),
    scrape: (url) => ipcRenderer.invoke('butler:browser-scrape', { url }),
  },

  // ── Reminders ─────────────────────────────────
  setReminder: (r) => ipcRenderer.invoke('reminders:set', r),
  cancelReminder: (id) => ipcRenderer.invoke('reminders:cancel', id),

  // ── Recurring Schedules ─────────────────────────
  recurring: {
    add: (cron, label, command) => ipcRenderer.invoke('schedule:add-recurring', { cron, label, command }),
    cancel: (id) => ipcRenderer.invoke('schedule:cancel-recurring', { id }),
    list: () => ipcRenderer.invoke('schedule:list-recurring'),
  },

  // ── Clipboard History ───────────────────────────
  clipboard: {
    history: () => ipcRenderer.invoke('clipboard:history'),
    search: (query) => ipcRenderer.invoke('clipboard:search', { query }),
    paste: (index) => ipcRenderer.invoke('clipboard:paste-item', { index }),
  },

  // ── System Health ───────────────────────────────
  systemHealth: () => ipcRenderer.invoke('system:health'),

  // ── Smart File Ops ──────────────────────────────
  smartFiles: {
    batchRename: (dir, pattern, replacement) => ipcRenderer.invoke('butler:batch-rename', { dir, pattern, replacement }),
    organize: (dir) => ipcRenderer.invoke('butler:organize-files', { dir }),
    findDuplicates: (dir) => ipcRenderer.invoke('butler:find-duplicates', { dir }),
  },

  // ── Face Auth ───────────────────────────────────
  faceAuth: {
    settings: () => ipcRenderer.invoke('face-auth:settings'),
    enable: () => ipcRenderer.invoke('face-auth:enable'),
    disable: () => ipcRenderer.invoke('face-auth:disable'),
    enroll: (imageDataUrl) => ipcRenderer.invoke('face-auth:enroll', { imageDataUrl }),
    unenroll: () => ipcRenderer.invoke('face-auth:unenroll'),
    verify: (imageDataUrl) => ipcRenderer.invoke('face-auth:verify', { imageDataUrl }),
    setThreshold: (value) => ipcRenderer.invoke('face-auth:set-threshold', { value }),
    onRequired: (cb) => ipcRenderer.on('face-auth:required', (_, d) => cb(d)),
  },

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
    transcribe: (samples, lang) => ipcRenderer.invoke('voice:transcribe', { samples, lang }),
    transcribeRaw: (bytes, lang) => ipcRenderer.invoke('voice:transcribeRaw', { bytes, lang }),
    synthesize: (text, lang, speed) => ipcRenderer.invoke('voice:synthesize', { text, lang, speed }),
    downloadModels: (targets, whisperSize) => ipcRenderer.invoke('voice:download-models', { targets, whisperSize }),
    onDownloadProgress: (cb) => ipcRenderer.on('voice:download-progress', (_, d) => cb(d)),
    openModelsDir: () => ipcRenderer.invoke('voice:open-models-dir'),
    setModelsDir: (dir) => ipcRenderer.invoke('voice:set-models-dir', dir),
    browseDir: () => ipcRenderer.invoke('voice:browse-dir'),
  },

  // ── Plugins (Local Install) ────────────────────
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    discover: () => ipcRenderer.invoke('plugins:discover'),
    installLocal: () => ipcRenderer.invoke('plugins:install-local'),
    remove: (id) => ipcRenderer.invoke('plugins:remove', { id })
  },

  // ── Web Sub-Agent ──────────────────────────────
  web: {
    scrape: (url) => ipcRenderer.invoke('web:scrape', url),
    search: (query) => ipcRenderer.invoke('web:search', query),
  },

  // ── Generic Events ────────────────────────────
  getLiveKeys: () => ipcRenderer.invoke('ai:get-live-keys'),
  on: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),
  receive: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),

  // ── Cleanup ───────────────────────────────────
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
});

