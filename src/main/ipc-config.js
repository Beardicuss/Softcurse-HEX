'use strict';
// ── main/ipc-config.js ────────────────────────────────────────────────────────
// IPC handlers: config:get, config:set

module.exports = function registerConfigIPC({
  ipcMain,
  getConfig, setConfig,
  saveConfig,
  applySystemSettings,
  localVoice,
}) {
  ipcMain.handle('config:get', () => getConfig());

  ipcMain.handle('config:set', (_, newCfg) => {
    const merged = { ...getConfig(), ...newCfg };
    setConfig(merged);
    saveConfig(merged);
    applySystemSettings();
    // Propagate voice.modelsDir to engine if changed
    if (localVoice && newCfg.voice && newCfg.voice.modelsDir) {
      localVoice.setModelsDir(newCfg.voice.modelsDir);
    }
    return merged;
  });
};
