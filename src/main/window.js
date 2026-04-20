'use strict';
// ── main/window.js ────────────────────────────────────────────────────────────
// Window lifecycle: createWindow, tray, applySystemSettings.
// Returns { createWindow, applySystemSettings }.

const path = require('path');

module.exports = function registerWindow({
  BrowserWindow, Tray, Menu, nativeImage, shell, app,
  getConfig,
  startPolling,
  onWindowCreated,   // fn(win) — called after createWindow() so main.js can update its ref
  onWindowClosed,    // fn()    — called when window is set to null
  sendLog,
}) {
  let mainWindow = null;
  let tray = null;
  let pollTimer = null;

  // ── Create main window ─────────────────────────────────────────────────────
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1450,
      height: 1100,
      minWidth: 1100,
      minHeight: 720,
      backgroundColor: '#020202',
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    // Auto-grant microphone / camera permissions
    mainWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
      const allowed = ['media', 'mediaKeySystem', 'audioCapture', 'microphone'].includes(permission);
      callback(allowed);
    });
    mainWindow.webContents.session.setPermissionCheckHandler((wc, permission) => {
      return ['media', 'mediaKeySystem', 'audioCapture', 'microphone'].includes(permission);
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

    if (process.env.DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Restart polling whenever the page finishes loading (incl. after crash recovery)
    mainWindow.webContents.on('did-finish-load', () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (mainWindow && !mainWindow.isDestroyed()) {
        pollTimer = startPolling(mainWindow);
      }
    });

    // Auto-recover from renderer crashes
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.warn('Renderer crashed:', details.reason);
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
        }
      }, 500);
    });

    mainWindow.webContents.on('unresponsive', () => {
      console.warn('Renderer unresponsive — reloading...');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    });

    mainWindow.on('close', (event) => {
      const config = getConfig();
      if (config.system && config.system.minimizeToTray && !app.isQuiting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on('closed', () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      mainWindow = null;
      onWindowClosed();
    });

    onWindowCreated(mainWindow);
    return mainWindow;
  }

  // ── Tray & system settings ─────────────────────────────────────────────────
  function applySystemSettings() {
    const config = getConfig();
    if (!config.system) return;

    try {
      if (app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: !!config.system.autostart,
          path: app.getPath('exe'),
        });
      }
    } catch (e) { console.warn('setLoginItemSettings failed:', e); }

    if (config.system.minimizeToTray) {
      if (!tray) {
        try {
          const iconPath = path.join(__dirname, '..', 'assets', 'hex.png');
          const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
          tray = new Tray(icon);
          tray.setToolTip('Softcurse H.E.X.');
          const contextMenu = Menu.buildFromTemplate([
            { label: 'Show HEX', click: () => { if (mainWindow) mainWindow.show(); } },
            { type: 'separator' },
            { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
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

  return { createWindow, applySystemSettings };
};
