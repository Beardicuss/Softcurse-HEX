'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'cloud-sync.js'), 'utf8');
const calls = [];
const sandbox = {
  config: {
    cloud: {
      enabled: true,
      serverUrl: 'https://hex-server.example',
      profileId: 'profile-1',
      sessionId: 'session-1',
      deviceId: 'device-1'
    },
    onboarding: { completed: true }
  },
  currentMode: 'hex',
  addLog() {},
  setTimeout,
  Promise,
  window: {
    _hexConfig: {
      cloud: { enabled: true, serverUrl: 'https://hex-server.example' },
      performance: { mode: 'lite' }
    },
    hexPerformancePolicy: {
      isLite: () => true,
      needsDesktopContext: (query) => /open|file|window|browser/i.test(String(query || ''))
    },
    hexCloudContextRehydrator: { applyPacket() {} },
    hexAPI: {
      cloud: {
        getContextPacket(payload) {
          calls.push(payload);
          return Promise.resolve({ success: true, packet: { schema: 'hex.context-packet.v2', query: payload.query, generatedAt: new Date().toISOString() } });
        }
      }
    }
  }
};
sandbox.globalThis = sandbox;

vm.runInNewContext(source, sandbox, { filename: 'cloud-sync.js' });
const sync = sandbox.window.hexCloudSync;

const localState = { sessionContext: { activeSurface: 'chat', primaryGoal: 'test' } };
const cacheKey = sync._makeContextCacheKey('hello hex', localState);
sync._cacheContextPacket(cacheKey, localState, { schema: 'hex.context-packet.v2', query: 'hello hex' });

assert.ok(sync._getReusableContextPacket('how are you?', localState), 'Lite dialogue should reuse a recent same-scope packet');
assert.equal(sync._getReusableContextPacket('open second file', localState), null, 'desktop/action queries need fresh context');
assert.equal(sync._getReusableContextPacket('how are you?', { sessionContext: { activeSurface: 'browser' } }), null, 'different scope must not reuse packet');

console.log('Cloud context Lite reuse contract OK:', {
  reusableDialogue: !!sync._getReusableContextPacket('how are you?', localState),
  freshForDesktop: sync._getReusableContextPacket('open second file', localState) === null
});