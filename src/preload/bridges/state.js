'use strict';

module.exports = function createStateBridge(ipcRenderer) {
  return {
    getMemory: () => ipcRenderer.invoke('memory:get'),
    setMemory: (data) => ipcRenderer.invoke('memory:set', data),
    clearMemory: () => ipcRenderer.invoke('memory:clear'),

    brain: {
      load: () => ipcRenderer.invoke('brain:load'),
      save: (data) => ipcRenderer.invoke('brain:save', data),
    },

    faceAuth: {
      settings: () => ipcRenderer.invoke('face-auth:settings'),
      enable: () => ipcRenderer.invoke('face-auth:enable'),
      disable: () => ipcRenderer.invoke('face-auth:disable'),
      enroll: (imageDataUrl) => ipcRenderer.invoke('face-auth:enroll', { imageDataUrl }),
      unenroll: () => ipcRenderer.invoke('face-auth:unenroll'),
      verify: (imageDataUrl) => ipcRenderer.invoke('face-auth:verify', { imageDataUrl }),
      setThreshold: (value) => ipcRenderer.invoke('face-auth:set-threshold', { value }),
      onRequired: (cb) => ipcRenderer.on('face-auth:required', (_, data) => cb(data)),
    },

    onSystemUpdate: (cb) => ipcRenderer.on('system:update', (_, data) => cb(data)),
    onActivityEvent: (cb) => ipcRenderer.on('activity:event', (_, data) => cb(data)),
    onTaskProgress: (cb) => ipcRenderer.on('task:progress', (_, data) => cb(data)),
    onReminderFire: (cb) => ipcRenderer.on('reminder:fire', (_, data) => cb(data)),
    onLogEntry: (cb) => ipcRenderer.on('log:entry', (_, data) => cb(data)),
  };
};
