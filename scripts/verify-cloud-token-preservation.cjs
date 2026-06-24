'use strict';

const assert = require('assert');
const registerConfigIPC = require('../src/main/ipc-config');

const { redactConfig, mergeConfigPreservingSecrets } = registerConfigIPC._private || {};

assert.equal(typeof redactConfig, 'function', 'redactConfig test hook must exist');
assert.equal(typeof mergeConfigPreservingSecrets, 'function', 'mergeConfigPreservingSecrets test hook must exist');

const current = {
  language: 'en',
  llm: { apiKey: 'provider-secret', apiKeys: { openai: 'openai-secret' }, manualApiKeys: { mistral: ['mistral-secret'] } },
  voice: { gcloudTtsKey: 'voice-secret' },
  cloud: {
    enabled: true,
    serverUrl: 'https://hex-server.softcursesys.workers.dev',
    accessToken: 'cloud-secret-token',
    profileId: 'prof_1',
    sessionId: 'sess_1',
    deviceId: 'dev_1'
  }
};

const incomingFromRenderer = {
  language: 'en',
  llm: { provider: 'llamacpp', apiKey: '', apiKeys: {}, manualApiKeys: {} },
  voice: { gcloudTtsKey: '' },
  cloud: {
    enabled: true,
    serverUrl: 'https://hex-server.softcursesys.workers.dev',
    accessToken: '',
    profileId: 'prof_2'
  }
};

const merged = mergeConfigPreservingSecrets(current, incomingFromRenderer);
assert.equal(merged.cloud.accessToken, 'cloud-secret-token', 'blank renderer token must preserve saved cloud access token');
assert.equal(merged.cloud.profileId, 'prof_2', 'non-secret cloud fields should still update');
assert.equal(merged.llm.apiKey, 'provider-secret', 'blank renderer LLM key must preserve saved key');
assert.deepEqual(merged.llm.apiKeys, current.llm.apiKeys, 'blank renderer provider key map must preserve saved keys');
assert.deepEqual(merged.llm.manualApiKeys, current.llm.manualApiKeys, 'blank renderer manual key map must preserve saved keys');
assert.equal(merged.voice.gcloudTtsKey, 'voice-secret', 'blank renderer voice key must preserve saved key');

const redacted = redactConfig(merged);
assert.equal(redacted.cloud.accessToken, '', 'redacted config must not expose cloud token');
assert.equal(redacted.cloud.hasAccessToken, true, 'redacted config must tell renderer that a cloud token exists');
assert.equal(redacted.llm.apiKey, '', 'redacted config must not expose LLM key');
assert.equal(redacted.llm.hasApiKey, true, 'redacted config must tell renderer that an LLM key exists');
assert.deepEqual(redacted.llm.apiKeys, {}, 'redacted config must not expose provider key map');
assert.deepEqual(redacted.llm.manualApiKeys, {}, 'redacted config must not expose manual key map');
assert.equal(redacted.voice.gcloudTtsKey, '', 'redacted config must not expose voice key');
assert.equal(redacted.voice.hasGcloudTtsKey, true, 'redacted config must tell renderer that a voice key exists');

console.log('cloud token preservation contract ok');