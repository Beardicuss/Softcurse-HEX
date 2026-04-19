'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const buildHexAPI = require('./src/preload/build-hex-api');

contextBridge.exposeInMainWorld('hexAPI', buildHexAPI(ipcRenderer));
