'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'cloud-sync.js'), 'utf8');
const logs = [];
let mode = 'success';
let calls = 0;
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
  addLog(source, message, level) { logs.push({ source, message, level }); },
  setTimeout,
  Date,
  Promise,
  window: {
    _hexConfig: {
      cloud: { enabled: true, serverUrl: 'https://hex-server.example' },
      performance: { mode: 'lite' }
    },
    hexPerformancePolicy: {
      isLite: () => false,
      needsDesktopContext: () => true
    },
    hexCloudContextRehydrator: { applyPacket() {} },
    hexAPI: {
      cloud: {
        getContextPacket(payload) {
          calls += 1;
          if (mode === 'timeout') return Promise.resolve({ success: false, error: 'context packet timed out' });
          return Promise.resolve({ success: true, packet: { schema: 'hex.context-packet.v2', query: payload.query, marker: 'last-good' } });
        }
      }
    }
  }
};
sandbox.globalThis = sandbox;

vm.runInNewContext(source, sandbox, { filename: 'cloud-sync.js' });
const sync = sandbox.window.hexCloudSync;
const localState = { sessionContext: { activeSurface: 'browser', primaryGoal: 'youtube' } };

(async () => {
  const first = await sync.getContextPacket('open third video', localState);
  assert.equal(first.marker, 'last-good');
  mode = 'timeout';
  const second = await sync.getContextPacket('open another video', localState);
  assert.equal(second.marker, 'last-good', 'soft cloud timeout should reuse last-good context');
  const third = await sync.getContextPacket('open another video again', localState);
  assert.equal(third.marker, 'last-good', 'repeated timeout should still reuse last-good context');
  const degradedLogs = logs.filter((entry) => /Context packet degraded/.test(entry.message));
  assert.equal(degradedLogs.length, 1, 'soft timeout notices should be debounced');
  assert.ok(calls >= 3, 'test should exercise fresh cloud calls, not cache-only reuse');
  console.log('Cloud degraded context fallback contract OK:', { calls, degradedLogs: degradedLogs.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});