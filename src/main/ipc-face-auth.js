'use strict';
// ── main/ipc-face-auth.js ─────────────────────────────────────────────────────
// IPC handlers: face-auth:settings/enable/disable/enroll/unenroll/verify/set-threshold
// Also sends the face-auth:required event on app ready if auth is enabled.

module.exports = function registerFaceAuthIPC({
  ipcMain, app,
  FaceAuth,
  getWindow,
  sendLog,
}) {
  const faceAuth = new FaceAuth(app.getPath('userData'), (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    sendLog('SECURITY', msg);
  });

  // ── IPC handlers ──────────────────────────────────────────────────────────

  ipcMain.handle('face-auth:settings', () => ({
    success: true,
    ...faceAuth.getSettings(),
  }));

  ipcMain.handle('face-auth:enable', () => faceAuth.enable());

  ipcMain.handle('face-auth:disable', () => faceAuth.disable());

  ipcMain.handle('face-auth:enroll', (_, { imageDataUrl }) =>
    faceAuth.enroll(imageDataUrl)
  );

  ipcMain.handle('face-auth:unenroll', () => faceAuth.unenroll());

  ipcMain.handle('face-auth:verify', (_, { imageDataUrl }) =>
    faceAuth.verify(imageDataUrl)
  );

  ipcMain.handle('face-auth:set-threshold', (_, { value }) =>
    faceAuth.setThreshold(value)
  );

  // ── Send lock-screen event after window is ready ───────────────────────────
  function checkFaceAuthOnReady() {
    setTimeout(() => {
      const win = getWindow();
      if (win && faceAuth.isEnabled()) {
        win.webContents.send('face-auth:required', faceAuth.getSettings());
      }
    }, 1500);
  }

  return { checkFaceAuthOnReady };
};
