'use strict';

module.exports = function createBrowserBridge(ipcRenderer) {
  return {
    openUrl: (url) => ipcRenderer.invoke('browser:open-url', url),

    browser: {
      // Headless (returns data to HEX)
      open: (url) => ipcRenderer.invoke('butler:browser-open', { url }),
      search: (query) => ipcRenderer.invoke('web:search', query),
      scrape: (url) => ipcRenderer.invoke('web:scrape', url),

      // Controlled visible browser
      navigate: (url) => ipcRenderer.invoke('web:navigate', { url }),
      smartSearch: (query, siteUrl) => ipcRenderer.invoke('web:smart-search', { query, siteUrl }),
      type: (selector, text) => ipcRenderer.invoke('web:type', { selector, text }),
      click: (selector) => ipcRenderer.invoke('web:click', { selector }),
      findClick: (text) => ipcRenderer.invoke('web:find-click', { text }),
      fillSubmit: (selector, text) => ipcRenderer.invoke('web:fill-submit', { selector, text }),
      back: () => ipcRenderer.invoke('web:back'),
      forward: () => ipcRenderer.invoke('web:forward'),
      refresh: () => ipcRenderer.invoke('web:refresh'),
      readPage: () => ipcRenderer.invoke('web:read-page'),
      screenshot: () => ipcRenderer.invoke('web:screenshot'),
      extractCandidates: () => ipcRenderer.invoke('web:extract-candidates'),
      status: () => ipcRenderer.invoke('web:session-status'),
      close: () => ipcRenderer.invoke('web:close-browser'),
    },
  };
};
