'use strict';

const assert = require('assert/strict');
const registerLiveKeys = require('../src/main/live-keys');

const handlers = new Map();
const logs = [];
const ipcMain = {
  handle(channel, handler) {
    handlers.set(channel, handler);
  }
};

let cloudEnabled = false;
const config = {
  llm: { manualApiKeys: {} },
  cloud: {
    enabled: false,
    serverUrl: 'https://hex-server.test',
    accessToken: 'contract-token'
  }
};

const originalFetch = global.fetch;
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

global.setInterval = () => ({ mocked: true });
global.clearInterval = () => {};

let capabilityMode = 'valid';
const validCapabilities = {
  schema: 'hex.hunter-capabilities.v1',
  source: 'hunter-live',
  stale: false,
  degraded: false,
  activeProvider: 'mistral',
  providers: [
    {
      provider: 'Mistral',
      label: 'MISTRAL',
      status: 'ready',
      validKeys: 2,
      totalKeys: 4,
      score: 10,
      models: ['mistral-small-latest'],
      liveKeys: ['must-not-leak']
    },
    {
      provider: 'OpenAI',
      label: 'OPENAI',
      status: 'invalid',
      validKeys: 0,
      totalKeys: 12,
      score: 0.2,
      models: ['gpt-4o-mini'],
      liveKeys: ['must-not-leak-either']
    }
  ],
  summary: { totalProviders: 2, readyProviders: 1, cooldownProviders: 0, degradedProviders: 1, liveKeys: 2 }
};

const validKeys = {
  mistral: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']
};

global.fetch = async (url) => {
  const pathname = String(url);
  if (pathname.includes('/api/hunter/capabilities')) {
    if (capabilityMode === 'valid') {
      return jsonResponse({ success: true, capabilities: validCapabilities });
    }
    return jsonResponse({
      success: true,
      capabilities: {
        schema: 'hex.hunter-capabilities.v999',
        source: 'broken-test-packet',
        providers: [{ provider: 'mistral', liveKeys: ['leak'], status: 'banana' }]
      }
    });
  }
  if (pathname.includes('/api/hunter/valid-keys')) {
    return jsonResponse({ success: true, keys: validKeys });
  }
  return jsonResponse({ success: false, error: 'unexpected route' }, 404);
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

async function invoke(channel, payload) {
  assert.ok(handlers.has(channel), `missing IPC handler: ${channel}`);
  return handlers.get(channel)({}, payload);
}

async function main() {
  registerLiveKeys({
    ipcMain,
    sendLog: (scope, message, level) => logs.push({ scope, message, level }),
    getConfig: () => ({
      ...config,
      cloud: { ...config.cloud, enabled: cloudEnabled }
    }),
    setConfig: () => {},
    saveConfig: () => {}
  });

  cloudEnabled = true;

  const first = await invoke('ai:get-provider-capabilities', { force: true });
  assert.equal(first.success, true);
  assert.equal(first.capabilities.schema, 'hex.hunter-capabilities.v1');
  assert.equal(first.capabilities.activeProvider, 'mistral');
  assert.equal(first.capabilities.providers[0].provider, 'mistral');
  assert.equal(first.capabilities.providers[0].status, 'ready');
  assert.equal(Object.hasOwn(first.capabilities.providers[0], 'liveKeys'), false, 'raw keys must not leak to renderer');

  capabilityMode = 'invalid';
  const second = await invoke('ai:get-provider-capabilities', { force: true });
  assert.equal(second.success, true);
  assert.equal(second.capabilities.schema, 'hex.hunter-capabilities.v1');
  assert.equal(second.capabilities.activeProvider, 'mistral', 'bad packet should keep last-good active provider');
  assert.equal(second.capabilities.providers[0].status, 'ready', 'bad packet should not poison provider status');
  assert.equal(second.capabilities.summary.readyProviders >= 1, true, 'bad packet should not collapse ready provider count');
  assert.equal(second.capabilities.providers.some((item) => Object.hasOwn(item, 'liveKeys')), false, 'bad packet must not leak raw keys');
  assert.equal(logs.some((entry) => /failed desktop contract/i.test(entry.message)), true, 'bad packet should be logged');

  console.log('Live key capability resilience OK:', {
    activeProvider: second.capabilities.activeProvider,
    providers: second.capabilities.providers.length,
    readyProviders: second.capabilities.summary.readyProviders,
    rejectedBadPacket: true
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });