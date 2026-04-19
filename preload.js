'use strict';

const { contextBridge, ipcRenderer } = require('electron');

try {
    const buildHexAPI = require('./src/preload/build-hex-api');
    contextBridge.exposeInMainWorld('hexAPI', buildHexAPI(ipcRenderer));
} catch (e) {
    contextBridge.exposeInMainWorld('hexAPI', {
        _preloadError: e.stack,
        on: () => { },
        receive: () => { },
        send: () => { },
        invoke: () => { }
    });
}
