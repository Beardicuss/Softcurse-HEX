'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveConfig } = require('../src/main/config');

const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => { throw new Error('not used'); },
  decryptString: () => { throw new Error('not used'); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-config-preserve-'));
const configPath = path.join(dir, 'config.json');

fs.writeFileSync(configPath, JSON.stringify({
  cloud: { enabled: true, serverUrl: 'https://hex-server.test', accessToken: 'stored-cloud-token' },
  voice: { gcloudTtsKey: 'stored-voice-key' },
  llm: {
    apiKey: 'stored-llm-key',
    apiKeys: { openai: 'stored-openai-key' },
    manualApiKeys: { mistral: ['stored-mistral-key'] },
    visionApiKey: 'stored-vision-key'
  }
}, null, 2));

saveConfig(safeStorage, {
  cloud: { enabled: true, serverUrl: 'https://hex-server.test', accessToken: '' },
  voice: { gcloudTtsKey: '' },
  llm: { apiKey: '', apiKeys: {}, manualApiKeys: {}, visionApiKey: '' }
}, configPath);

const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.equal(saved.cloud.accessToken, 'stored-cloud-token', 'saveConfig must preserve existing cloud token on blank save');
assert.equal(saved.voice.gcloudTtsKey, 'stored-voice-key', 'saveConfig must preserve existing voice key on blank save');
assert.equal(saved.llm.apiKey, 'stored-llm-key', 'saveConfig must preserve existing LLM key on blank save');
assert.deepEqual(saved.llm.apiKeys, { openai: 'stored-openai-key' }, 'saveConfig must preserve provider key map');
assert.deepEqual(saved.llm.manualApiKeys, { mistral: ['stored-mistral-key'] }, 'saveConfig must preserve manual key map');
assert.equal(saved.llm.visionApiKey, 'stored-vision-key', 'saveConfig must preserve vision key');

fs.rmSync(dir, { recursive: true, force: true });
console.log('config save secret preservation contract ok');