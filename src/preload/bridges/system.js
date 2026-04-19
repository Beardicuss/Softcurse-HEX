'use strict';

module.exports = function createSystemBridge(ipcRenderer) {
  return {
    getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
    getProcesses: () => ipcRenderer.invoke('system:get-processes'),
    killProcess: (pid) => ipcRenderer.invoke('system:kill-process', pid),
    runTask: (id) => ipcRenderer.invoke('system:run-task', id),
    clearBrowserCache: () => ipcRenderer.invoke('system:clear-browser-cache'),
    safeExec: (cmd) => ipcRenderer.invoke('system:safe-exec', cmd),
    execWithConfirm: (cmd) => ipcRenderer.invoke('system:exec-with-confirm', cmd),
    captureScreenBase64: () => ipcRenderer.invoke('system:capture-screen-base64'),

    setReminder: (reminder) => ipcRenderer.invoke('reminders:set', reminder),
    cancelReminder: (id) => ipcRenderer.invoke('reminders:cancel', id),

    recurring: {
      add: (cron, label, command) => ipcRenderer.invoke('schedule:add-recurring', { cron, label, command }),
      cancel: (id) => ipcRenderer.invoke('schedule:cancel-recurring', { id }),
      list: () => ipcRenderer.invoke('schedule:list-recurring'),
    },

    clipboard: {
      history: () => ipcRenderer.invoke('clipboard:history'),
      search: (query) => ipcRenderer.invoke('clipboard:search', { query }),
      paste: (index) => ipcRenderer.invoke('clipboard:paste-item', { index }),
    },

    systemHealth: () => ipcRenderer.invoke('system:health'),

    smartFiles: {
      batchRename: (dir, pattern, replacement) => ipcRenderer.invoke('butler:batch-rename', { dir, pattern, replacement }),
      organize: (dir) => ipcRenderer.invoke('butler:organize-files', { dir }),
      findDuplicates: (dir) => ipcRenderer.invoke('butler:find-duplicates', { dir }),
    },
  };
};
