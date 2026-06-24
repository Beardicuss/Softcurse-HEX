'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, saveConfig } = require('../src/main/config');

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from('encrypted:' + value, 'utf8'),
  decryptString: () => { throw new Error('simulated safeStorage context drift'); }
};

const app = {
  getAppPath: () => process.cwd()
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-cloud-vault-'));
const configPath = path.join(dir, 'config.json');

saveConfig(safeStorage, {
  language: 'en',
  cloud: {
    enabled: true,
    serverUrl: 'https://hex-server.test',
    accessToken: 'vault-token-value',
    profileId: 'prof_test'
  },
  llm: {},
  voice: {}
}, configPath);

const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.equal(raw.cloud.accessToken.startsWith('enc::'), true, 'config token should still use primary encrypted storage');
assert.equal(fs.existsSync(path.join(dir, 'cloud-token.vault.json')), true, 'cloud token vault should be written');

const loaded = loadConfig(safeStorage, app, configPath);
assert.equal(loaded.cloud.accessToken, 'vault-token-value', 'loadConfig must rehydrate cloud token from vault if safeStorage decrypt fails');
assert.equal(loaded.cloud.serverUrl, 'https://hex-server.test');

fs.rmSync(dir, { recursive: true, force: true });
console.log('cloud token vault fallback contract ok');