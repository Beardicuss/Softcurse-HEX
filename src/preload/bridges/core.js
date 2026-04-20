'use strict';

module.exports = function createCoreBridge(ipcRenderer) {
  return {
    getConfig: () => ipcRenderer.invoke('config:get'),
    setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
    rescheduleHunter: () => ipcRenderer.invoke('hunter:reschedule'),
    runHunterNow: () => ipcRenderer.invoke('hunter:runNow'),
    getHunterStatus: () => ipcRenderer.invoke('hunter:status'),

    appendFinetune: (lines) => ipcRenderer.invoke('finetune:append', { lines }),
    getFinetunePath: () => ipcRenderer.invoke('finetune:get-path'),
    clearFinetune: () => ipcRenderer.invoke('finetune:clear'),

    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    windowDragStart: () => ipcRenderer.send('window:drag-start'),
    windowDragMove: () => ipcRenderer.send('window:drag-move'),
    windowDragStop: () => ipcRenderer.send('window:drag-stop'),

    ollamaListModels: () => ipcRenderer.invoke('ollama:list-models'),
    getLiveKeys: () => ipcRenderer.invoke('ai:get-live-keys'),

    on: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),
    receive: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  };
};
