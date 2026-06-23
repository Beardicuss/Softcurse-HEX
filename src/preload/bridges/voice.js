'use strict';

module.exports = function createVoiceBridge(ipcRenderer) {
  return {
    voice: {
      status: () => ipcRenderer.invoke('voice:status'),
      transcribe: (samples, lang) => ipcRenderer.invoke('voice:transcribe', { samples, lang }),
      transcribeRaw: (bytes, lang) => ipcRenderer.invoke('voice:transcribeRaw', { bytes, lang }),
      synthesize: (text, lang, speed) => ipcRenderer.invoke('voice:synthesize', { text, lang, speed }),
      synthesizeGCloud: (payload) => ipcRenderer.invoke('voice:gcloud-synthesize', payload),
      downloadModels: (targets, whisperSize) => ipcRenderer.invoke('voice:download-models', { targets, whisperSize }),
      onDownloadProgress: (cb) => ipcRenderer.on('voice:download-progress', (_, data) => cb(data)),
      openModelsDir: () => ipcRenderer.invoke('voice:open-models-dir'),
      setModelsDir: (dir) => ipcRenderer.invoke('voice:set-models-dir', dir),
      browseDir: () => ipcRenderer.invoke('voice:browse-dir'),
    },
  };
};
