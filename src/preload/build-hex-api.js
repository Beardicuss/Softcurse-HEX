'use strict';

const createCoreBridge = require('./bridges/core');
const createSystemBridge = require('./bridges/system');
const createButlerBridge = require('./bridges/butler');
const createBrowserBridge = require('./bridges/browser');
const createPluginsBridge = require('./bridges/plugins');
const createStateBridge = require('./bridges/state');
const createVoiceBridge = require('./bridges/voice');
const createCloudBridge = require('./bridges/cloud');

module.exports = function buildHexAPI(ipcRenderer) {
  return Object.assign(
    {},
    createCoreBridge(ipcRenderer),
    createSystemBridge(ipcRenderer),
    createButlerBridge(ipcRenderer),
    createBrowserBridge(ipcRenderer),
    createPluginsBridge(ipcRenderer),
    createStateBridge(ipcRenderer),
    createVoiceBridge(ipcRenderer),
    createCloudBridge(ipcRenderer)
  );
};
