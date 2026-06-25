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
    getFinetuneStats: () => ipcRenderer.invoke('finetune:stats'),
    exportFinetuneDatasets: () => ipcRenderer.invoke('finetune:export-clean'),
    clearFinetune: () => ipcRenderer.invoke('finetune:clear'),

    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    windowDragStart: () => ipcRenderer.send('window:drag-start'),
    windowDragMove: () => ipcRenderer.send('window:drag-move'),
    windowDragStop: () => ipcRenderer.send('window:drag-stop'),

    ollamaListModels: () => ipcRenderer.invoke('ollama:list-models'),
    getProviderCapabilities: (payload) => ipcRenderer.invoke('ai:get-provider-capabilities', payload),
    executeProvider: (payload) => ipcRenderer.invoke('ai:execute-provider', payload),
    addManualApiKey: (payload) => ipcRenderer.invoke('ai:add-manual-api-key', payload),
    removeManualApiKey: (payload) => ipcRenderer.invoke('ai:remove-manual-api-key', payload),

    on: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),
    receive: (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args)),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  };
};
