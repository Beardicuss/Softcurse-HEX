'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'performance-policy.js'), 'utf8');

function loadPolicy(config, stats = {}) {
  const sandbox = {
    window: {
      _hexConfig: config,
      sysStats: stats
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'performance-policy.js' });
  return sandbox.window.hexPerformancePolicy;
}

const lite = loadPolicy({ performance: { mode: 'lite', localModelAutostart: true, continuousVoice: true, localTts: true } });
assert.equal(lite.mode(), 'lite');
assert.equal(lite.isLite(), true);
assert.equal(lite.allowLocalModelAutostart(), false, 'Lite mode must block local model autostart');
assert.equal(lite.allowAutoVoice(), false, 'Lite mode must block continuous voice autostart');
assert.equal(lite.allowLocalTts(), false, 'Lite mode must prefer OS TTS');
assert.equal(lite.allowStartupInventoryScan(), false, 'Lite mode must defer startup inventory scan');
assert.equal(lite.awarenessMultiplier(), 4, 'Lite mode should slow awareness refresh');
assert.equal(lite.needsDesktopContext('hello hex, what is up?'), false, 'normal dialogue should not request desktop context');
assert.equal(lite.needsDesktopContext('open third file from downloads'), true, 'desktop actions should request desktop context');
assert.equal(lite.needsVisionContext('hello hex, what is up?'), false, 'normal dialogue should not request vision');
assert.equal(lite.needsVisionContext('what is on my screen?'), true, 'screen questions should request vision');
assert.equal(lite.allowVisionCapture('hello hex', {}), false, 'Lite mode must block non-visual screenshot capture');
assert.equal(lite.allowVisionCapture('what is on my screen?', {}), true, 'Lite mode should allow explicit visual capture');

const deep = loadPolicy({ performance: { mode: 'deep-local', localModelAutostart: true, continuousVoice: true, localTts: true } });
assert.equal(deep.isDeepLocal(), true);
assert.equal(deep.allowLocalModelAutostart(), true, 'Deep Local may autostart local model when explicitly enabled');
assert.equal(deep.allowAutoVoice(), true, 'Deep Local may autostart continuous voice when explicitly enabled');
assert.equal(deep.allowLocalTts(), true, 'Deep Local may use local TTS');
assert.equal(deep.awarenessMultiplier(), 1, 'Deep Local keeps full awareness speed');

const pressured = loadPolicy({ performance: { mode: 'deep-local', localModelAutostart: true, continuousVoice: true, localTts: true } }, { cpu: 91, ram: 70 });
assert.equal(pressured.isSystemUnderPressure(), true, 'high CPU should count as pressure');
assert.equal(pressured.allowLocalModelAutostart(), false, 'pressure must block local model autostart');
assert.equal(pressured.allowAutoVoice(), false, 'pressure must block continuous voice');
assert.equal(pressured.allowLocalTts(), false, 'pressure must block local TTS');

console.log('Performance policy contract OK:', {
  liteAutostart: lite.allowLocalModelAutostart(),
  deepAutostart: deep.allowLocalModelAutostart(),
  desktopIntent: lite.needsDesktopContext('open second app')
});