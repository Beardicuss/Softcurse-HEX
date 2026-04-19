'use strict';

module.exports = function createPluginsBridge(ipcRenderer) {
  return {
    plugins: {
      list: () => ipcRenderer.invoke('plugins:list'),
      discover: () => ipcRenderer.invoke('plugins:discover'),
      load: (id) => ipcRenderer.invoke('plugins:load', { id }),
      unload: (id) => ipcRenderer.invoke('plugins:unload', { id }),
      execute: (pluginId, action, args) => ipcRenderer.invoke('plugins:execute', { pluginId, action, args }),
      getActionTags: () => ipcRenderer.invoke('plugins:get-action-tags'),
      openFolder: () => ipcRenderer.invoke('plugins:open-folder'),
      installLocal: () => ipcRenderer.invoke('plugins:install-local'),
      remove: (id) => ipcRenderer.invoke('plugins:remove', { id }),
    },
  };
};
