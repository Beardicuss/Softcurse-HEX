'use strict';

const assert = require('assert/strict');
const registerCloudIPC = require('../src/main/ipc-cloud');

const handlers = new Map();
const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
let savedConfig = null;
let config = {
  cloud: {
    enabled: false,
    serverUrl: '',
    accessToken: '',
    profileId: 'prof_test',
    sessionId: 'sess_test',
    deviceId: 'dev_test'
  }
};

registerCloudIPC({
  ipcMain,
  getConfig: () => config,
  setConfig: (next) => { config = next; },
  saveConfig: (next) => { savedConfig = JSON.parse(JSON.stringify(next)); },
  sendLog: () => {}
});

async function main() {
  assert.ok(handlers.has('cloud:save-access-token'), 'cloud token save handler must be registered');
  const result = await handlers.get('cloud:save-access-token')({}, {
    accessToken: 'secret-token',
    enabled: true,
    serverUrl: 'https://hex-server.softcursesys.workers.dev/'
  });

  assert.equal(result.success, true);
  assert.equal(result.cloud.hasAccessToken, true, 'renderer should receive redacted token presence');
  assert.equal(Object.hasOwn(result.cloud, 'accessToken'), false, 'renderer must not receive raw token');
  assert.equal(config.cloud.accessToken, 'secret-token', 'main config should keep token in memory');
  assert.equal(savedConfig.cloud.accessToken, 'secret-token', 'saveConfig should receive token for encrypted disk persistence');
  assert.equal(savedConfig.cloud.serverUrl, 'https://hex-server.softcursesys.workers.dev', 'server URL should be normalized');

  console.log('cloud access token save contract ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});