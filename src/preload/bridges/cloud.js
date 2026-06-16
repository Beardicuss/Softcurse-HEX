'use strict';

module.exports = function createCloudBridge(ipcRenderer) {
  return {
    cloud: {
      status: () => ipcRenderer.invoke('cloud:status'),
      health: () => ipcRenderer.invoke('cloud:health'),
      bootstrap: () => ipcRenderer.invoke('cloud:bootstrap'),
      resolveProfile: (payload) => ipcRenderer.invoke('cloud:resolve-profile', payload),
      getContinuity: (payload) => ipcRenderer.invoke('cloud:get-continuity', payload),
      getLiveSession: (payload) => ipcRenderer.invoke('cloud:get-live-session', payload),
      setLiveSession: (payload) => ipcRenderer.invoke('cloud:set-live-session', payload),
      ensureSession: (payload) => ipcRenderer.invoke('cloud:ensure-session', payload),
      pushMessage: (payload) => ipcRenderer.invoke('cloud:push-message', payload),
    }
  };
};
