'use strict';

module.exports = function createBrowserBridge(ipcRenderer) {
  return {
    openUrl: (url) => ipcRenderer.invoke('browser:open-url', url),

    browser: {
      open: (url) => ipcRenderer.invoke('butler:browser-open', { url }),
      search: (query) => ipcRenderer.invoke('web:search', query),
      scrape: (url) => ipcRenderer.invoke('web:scrape', url),
    },
  };
};
