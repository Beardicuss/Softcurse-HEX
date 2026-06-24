import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tmpDir = path.join(os.tmpdir(), 'hex-capability-contract');
fs.mkdirSync(tmpDir, { recursive: true });
const sourceDir = path.resolve('cloudflare/hex-server/src');
fs.writeFileSync(
  path.join(tmpDir, 'hunter-api.mjs'),
  fs.readFileSync(path.join(sourceDir, 'hunter-api.js'), 'utf8')
);
fs.writeFileSync(
  path.join(tmpDir, 'hunter-capabilities.mjs'),
  fs.readFileSync(path.join(sourceDir, 'hunter-capabilities.js'), 'utf8').replace("'./hunter-api'", "'./hunter-api.mjs'")
);

const {
  buildHunterCapabilityPacket,
  toPublicCapabilityPacket,
  HUNTER_CAPABILITY_SCHEMA
} = await import(pathToFileURL(path.join(tmpDir, 'hunter-capabilities.mjs')).href + '?t=' + Date.now());

function createKvMock() {
  const store = new Map();
  return {
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name }))
      };
    }
  };
}

function installHunterFetchMock({ fail = false } = {}) {
  globalThis.fetch = async (url) => {
    if (fail) return response(503, { success: false, error: 'hunter offline' });
    const path = new URL(String(url)).pathname;
    if (path === '/api/hunter/provider-stats') {
      return response(200, {
        success: true,
        stats: [
          {
            provider: 'mistral',
            valid_keys: 2,
            total_keys: 4,
            models: ['mistral-small-latest', 'codestral-latest'],
            last_sync: '2026-06-24T00:00:00.000Z'
          },
          {
            provider: 'openai',
            valid_keys: 0,
            total_keys: 2,
            models: ['gpt-4o-mini'],
            last_sync: '2026-06-24T00:00:00.000Z'
          }
        ]
      });
    }
    if (path === '/api/hunter/key-summary') {
      return response(200, {
        success: true,
        summary: {
          providers: {
            Mistral: { valid_keys: 2, total_keys: 4, models: ['mistral-small-latest'] },
            OpenAI: { valid_keys: 0, total_keys: 2, models: ['gpt-4o-mini'] }
          }
        }
      });
    }
    if (path === '/api/hunter/valid-keys') {
      return response(200, {
        success: true,
        keys: {
          Mistral: ['mistral-key-a', 'mistral-key-b'],
          OpenAI: []
        }
      });
    }
    return response(404, { success: false, error: 'unexpected path ' + path });
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    async json() { return payload; }
  };
}

function assertPacketShape(packet) {
  assert.equal(packet.schema, HUNTER_CAPABILITY_SCHEMA, 'schema must be stable');
  assert.equal(typeof packet.generatedAt, 'string', 'generatedAt is required');
  assert.equal(typeof packet.source, 'string', 'source is required');
  assert.equal(typeof packet.stale, 'boolean', 'stale flag is required');
  assert.equal(typeof packet.degraded, 'boolean', 'degraded flag is required');
  assert.ok(packet.summary && typeof packet.summary === 'object', 'summary is required');
  assert.equal(typeof packet.summary.totalProviders, 'number', 'summary.totalProviders is required');
  assert.equal(typeof packet.summary.readyProviders, 'number', 'summary.readyProviders is required');
  assert.equal(typeof packet.summary.cooldownProviders, 'number', 'summary.cooldownProviders is required');
  assert.equal(typeof packet.summary.degradedProviders, 'number', 'summary.degradedProviders is required');
  assert.equal(typeof packet.summary.liveKeys, 'number', 'summary.liveKeys is required');
  assert.ok(Array.isArray(packet.providers), 'providers array is required');
  assert.ok(packet.providers.length >= 2, 'expected mocked providers');
  for (const provider of packet.providers) {
    assert.equal(typeof provider.provider, 'string', 'provider id is required');
    assert.equal(typeof provider.label, 'string', 'provider label is required');
    assert.equal(typeof provider.status, 'string', 'provider status is required');
    assert.equal(typeof provider.validKeys, 'number', 'provider validKeys is required');
    assert.equal(typeof provider.totalKeys, 'number', 'provider totalKeys is required');
    assert.ok(Array.isArray(provider.models), 'provider models array is required');
    assert.equal(typeof provider.score, 'number', 'provider score is required');
  }
}

const env = {
  HUNTER_API_BASE_URL: 'https://hunter.test',
  HUNTER_API_TOKEN: 'test-token',
  CACHE: createKvMock()
};

installHunterFetchMock();
const livePacket = await buildHunterCapabilityPacket(env, { preferredProvider: 'openai' });
assertPacketShape(livePacket);
assert.equal(livePacket.source, 'hunter-live');
assert.equal(livePacket.stale, false);
assert.equal(livePacket.degraded, false);
assert.equal(livePacket.summary.liveKeys, 2);
assert.equal(livePacket.providers.find((item) => item.provider === 'mistral')?.status, 'ready');
assert.equal(livePacket.providers.find((item) => item.provider === 'openai')?.status, 'degraded');
assert.deepEqual(livePacket.providers.find((item) => item.provider === 'mistral')?.liveKeys, ['mistral-key-a', 'mistral-key-b']);

const publicPacket = toPublicCapabilityPacket(livePacket);
assertPacketShape(publicPacket);
assert.equal(publicPacket.providers.some((item) => Object.hasOwn(item, 'liveKeys')), false, 'public packet must not expose liveKeys');

installHunterFetchMock({ fail: true });
const stalePacket = await buildHunterCapabilityPacket(env, { preferredProvider: 'mistral' });
assertPacketShape(stalePacket);
assert.equal(stalePacket.source, 'hunter-cache');
assert.equal(stalePacket.stale, true);
assert.equal(stalePacket.degraded, true);
assert.equal(typeof stalePacket.degradationReason, 'string');
assert.equal(stalePacket.providers.find((item) => item.provider === 'mistral')?.status, 'ready');

console.log('Hunter capability contract OK:', {
  schema: livePacket.schema,
  liveProviders: livePacket.summary.totalProviders,
  readyProviders: livePacket.summary.readyProviders,
  staleFallback: stalePacket.stale,
  publicLeaksLiveKeys: publicPacket.providers.some((item) => Object.hasOwn(item, 'liveKeys'))
});

