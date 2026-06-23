'use strict';

module.exports = function createCloudBridge(ipcRenderer) {
  return {
    cloud: {
      status: () => ipcRenderer.invoke('cloud:status'),
      health: () => ipcRenderer.invoke('cloud:health'),
      bootstrap: () => ipcRenderer.invoke('cloud:bootstrap'),
      hunterStatus: () => ipcRenderer.invoke('cloud:hunter-status'),
      hunterReportProvider: (payload) => ipcRenderer.invoke('cloud:hunter-report-provider', payload),
      resolveProfile: (payload) => ipcRenderer.invoke('cloud:resolve-profile', payload),
      getContinuity: (payload) => ipcRenderer.invoke('cloud:get-continuity', payload),
      getContextPacket: (payload) => ipcRenderer.invoke('cloud:get-context-packet', payload),
      syncDeviceInventory: (payload) => ipcRenderer.invoke('cloud:sync-device-inventory', payload),
      getLiveSession: (payload) => ipcRenderer.invoke('cloud:get-live-session', payload),
      setLiveSession: (payload) => ipcRenderer.invoke('cloud:set-live-session', payload),
      ensureSession: (payload) => ipcRenderer.invoke('cloud:ensure-session', payload),
      pushMessage: (payload) => ipcRenderer.invoke('cloud:push-message', payload),
      rememberFact: (payload) => ipcRenderer.invoke('cloud:remember-fact', payload),
      recordActivity: (payload) => ipcRenderer.invoke('cloud:record-activity', payload),
    }
  };
};
