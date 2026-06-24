'use strict';

const assert = require('assert/strict');

global.window = {
  hexTaskBus: {
    messages: [],
    push(message) { this.messages.push(String(message)); }
  }
};

require('../src/js/ai.js');

const ai = window.hexAI;
assert.ok(ai, 'window.hexAI should be initialized');
assert.equal(typeof ai._buildProviderQueue, 'function', 'HexAI provider queue builder is required');

const liveKeys = {
  mistral: [true],
  cohere: [true],
  openai: [true],
  grok: [true],
  gemini: [true]
};

const fresh = ai._buildProviderQueue({
  routeProvider: 'openai',
  liveKeys,
  orchestration: {
    stale: false,
    degraded: false,
    providers: [
      { provider: 'mistral', status: 'ready', validKeys: 2, score: 8, executionKeysAvailable: true },
      { provider: 'openai', status: 'invalid', validKeys: 2, score: 99, executionKeysAvailable: true },
      { provider: 'cohere', status: 'cooldown', validKeys: 3, score: 90, executionKeysAvailable: true },
      { provider: 'grok', status: 'unavailable', validKeys: 1, score: 70, executionKeysAvailable: true }
    ],
    summary: { degradedProviders: 3 }
  }
});
assert.deepEqual(fresh, ['mistral'], 'invalid/cooldown/unavailable providers must be skipped');

const degraded = ai._buildProviderQueue({
  routeProvider: 'gemini',
  liveKeys,
  orchestration: {
    stale: false,
    degraded: true,
    providers: [
      { provider: 'gemini', status: 'degraded', validKeys: 1, score: 9, executionKeysAvailable: true },
      { provider: 'mistral', status: 'ready', validKeys: 1, score: 5, executionKeysAvailable: true }
    ],
    summary: { degradedProviders: 1 }
  }
});
assert.deepEqual(degraded, ['gemini', 'mistral'], 'degraded provider with live execution keys can be used, but is guarded');

const noExecutionKeys = ai._buildProviderQueue({
  routeProvider: 'gemini',
  liveKeys,
  orchestration: {
    stale: false,
    degraded: true,
    providers: [
      { provider: 'gemini', status: 'ready', validKeys: 1, executionKeysAvailable: false },
      { provider: 'mistral', status: 'ready', validKeys: 1, executionKeysAvailable: true }
    ]
  }
});
assert.deepEqual(noExecutionKeys, ['mistral'], 'advertised provider without private execution keys must be skipped');

const stale = ai._buildProviderQueue({
  routeProvider: 'mistral',
  liveKeys,
  orchestration: {
    stale: true,
    degraded: false,
    providers: [
      { provider: 'mistral', status: 'ready', validKeys: 2, score: 1, executionKeysAvailable: true },
      { provider: 'cohere', status: 'ready', validKeys: 1, score: 10, executionKeysAvailable: true }
    ]
  }
});
assert.deepEqual(stale, ['mistral', 'cohere'], 'stale ready providers remain usable but still guarded by execution keys');

const local = ai._buildProviderQueue({
  routeProvider: 'llamacpp',
  liveKeys: {},
  orchestration: {
    stale: true,
    providers: [
      { provider: 'openai', status: 'invalid', validKeys: 4, executionKeysAvailable: true }
    ]
  }
});
assert.deepEqual(local, ['llamacpp'], 'local llama.cpp must remain usable without remote keys');

console.log('AI provider queue guard OK:', {
  fresh: fresh.join(','),
  degraded: degraded.join(','),
  stale: stale.join(','),
  local: local.join(',')
});