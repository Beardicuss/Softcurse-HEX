'use strict';

const assert = require('node:assert/strict');
const createCoreBridge = require('../src/preload/bridges/core');

const sampleCapabilities = {
  schema: 'hex.hunter-capabilities.v1',
  generatedAt: '2026-06-24T00:00:00.000Z',
  fetchedAt: '2026-06-24T00:00:00.000Z',
  source: 'hunter-live',
  stale: false,
  staleAgeMs: 0,
  staleAfterMs: 600000,
  degraded: false,
  preferredProvider: 'mistral',
  activeProvider: 'mistral',
  providers: [
    {
      provider: 'mistral',
      label: 'MISTRAL',
      status: 'ready',
      validKeys: 2,
      totalKeys: 4,
      score: 8.4,
      preferred: true,
      onCooldown: false,
      cooldownUntil: null,
      models: ['mistral-small-latest', 'codestral-latest'],
      executionKeysAvailable: true,
      source: 'hunter-live'
    },
    {
      provider: 'openai',
      label: 'OPENAI',
      status: 'invalid',
      validKeys: 0,
      totalKeys: 3,
      score: 0.3,
      preferred: false,
      onCooldown: false,
      cooldownUntil: null,
      models: ['gpt-4o-mini'],
      executionKeysAvailable: false,
      source: 'hunter-live'
    }
  ],
  summary: {
    totalProviders: 2,
    readyProviders: 1,
    cooldownProviders: 0,
    degradedProviders: 1,
    stale: false,
    liveKeys: 2
  }
};

const sampleResponse = {
  success: true,
  capabilities: sampleCapabilities,
  providers: {
    mistral: sampleCapabilities.providers[0],
    openai: sampleCapabilities.providers[1]
  },
  manualKeys: {
    mistral: [{ id: 'manual-key-id', masked: 'mist...key' }]
  }
};

const calls = [];
const ipcRenderer = {
  invoke(channel, payload) {
    calls.push({ channel, payload });
    if (channel !== 'ai:get-provider-capabilities') {
      throw new Error('Unexpected IPC channel: ' + channel);
    }
    return Promise.resolve(sampleResponse);
  },
  send() {},
  on() {},
  removeAllListeners() {}
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const api = createCoreBridge(ipcRenderer);
  assert.equal(typeof api.getProviderCapabilities, 'function', 'bridge must expose getProviderCapabilities');

  const result = await api.getProviderCapabilities({ force: true });
  assert.equal(calls.length, 1, 'bridge should make one IPC call');
  assert.equal(calls[0].channel, 'ai:get-provider-capabilities', 'bridge must use canonical IPC channel');
  assert.deepEqual(calls[0].payload, { force: true }, 'bridge must pass payload through');
  assertDesktopCapabilitiesResponse(result);

  console.log('Desktop provider capabilities contract OK:', {
    channel: calls[0].channel,
    providers: Object.keys(result.providers).length,
    activeProvider: result.capabilities.activeProvider,
    stale: result.capabilities.stale,
    publicLeaksLiveKeys: result.capabilities.providers.some((item) => Object.hasOwn(item, 'liveKeys'))
  });
}
function assertDesktopCapabilitiesResponse(payload) {
  assert.equal(payload?.success, true, 'response.success must be true');
  assert.ok(payload.capabilities, 'response.capabilities is required');
  assert.ok(payload.providers && typeof payload.providers === 'object' && !Array.isArray(payload.providers), 'response.providers map is required');
  assert.ok(payload.manualKeys && typeof payload.manualKeys === 'object' && !Array.isArray(payload.manualKeys), 'response.manualKeys map is required');

  const packet = payload.capabilities;
  assert.equal(packet.schema, 'hex.hunter-capabilities.v1', 'capability schema changed');
  assert.equal(typeof packet.generatedAt, 'string', 'generatedAt is required');
  assert.equal(typeof packet.source, 'string', 'source is required');
  assert.equal(typeof packet.stale, 'boolean', 'stale flag is required');
  assert.equal(typeof packet.degraded, 'boolean', 'degraded flag is required');
  assert.ok(Array.isArray(packet.providers), 'capabilities.providers array is required');
  assert.ok(packet.summary && typeof packet.summary === 'object', 'capabilities.summary is required');
  assert.equal(typeof packet.summary.totalProviders, 'number', 'summary.totalProviders is required');
  assert.equal(typeof packet.summary.readyProviders, 'number', 'summary.readyProviders is required');
  assert.equal(typeof packet.summary.cooldownProviders, 'number', 'summary.cooldownProviders is required');
  assert.equal(typeof packet.summary.degradedProviders, 'number', 'summary.degradedProviders is required');
  assert.equal(typeof packet.summary.liveKeys, 'number', 'summary.liveKeys is required');

  for (const provider of packet.providers) {
    assertProvider(provider);
    assert.equal(Object.hasOwn(provider, 'liveKeys'), false, 'renderer-facing provider must not expose raw liveKeys');
    assert.ok(payload.providers[provider.provider], 'providers map must include ' + provider.provider);
    assertProvider(payload.providers[provider.provider]);
  }
}

function assertProvider(provider) {
  assert.equal(typeof provider.provider, 'string', 'provider.provider is required');
  assert.equal(typeof provider.label, 'string', 'provider.label is required');
  assert.equal(typeof provider.status, 'string', 'provider.status is required');
  assert.ok(['ready', 'cooldown', 'rate_limited', 'invalid', 'exhausted', 'degraded', 'unavailable', 'empty'].includes(provider.status), 'unknown provider status: ' + provider.status);
  assert.equal(typeof provider.validKeys, 'number', 'provider.validKeys is required');
  assert.equal(typeof provider.totalKeys, 'number', 'provider.totalKeys is required');
  assert.equal(typeof provider.score, 'number', 'provider.score is required');
  assert.ok(Array.isArray(provider.models), 'provider.models is required');
}


