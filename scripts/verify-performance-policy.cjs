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
assert.equal(lite.allowDecorativeEffects(), false, 'Lite mode must suppress decorative effects');
assert.equal(lite.allowHiddenPanelRefresh(), true, 'Lite mode may refresh visible panels when not in voice surface');
assert.equal(lite.uiRefreshIntervalMs(), 30000, 'Lite mode should slow side-panel refresh cadence');
assert.equal(lite.allowTelemetryUiChatter(), false, 'Lite mode should suppress telemetry taskbus chatter');

const deep = loadPolicy({ performance: { mode: 'deep-local', localModelAutostart: true, continuousVoice: true, localTts: true } });
assert.equal(deep.isDeepLocal(), true);
assert.equal(deep.allowLocalModelAutostart(), true, 'Deep Local may autostart local model when explicitly enabled');
assert.equal(deep.allowAutoVoice(), true, 'Deep Local may autostart continuous voice when explicitly enabled');
assert.equal(deep.allowLocalTts(), true, 'Deep Local may use local TTS');
assert.equal(deep.awarenessMultiplier(), 1, 'Deep Local keeps full awareness speed');
assert.equal(deep.allowDecorativeEffects(), true, 'Deep Local may run decorative effects when not under pressure');
assert.equal(deep.allowDecorativeEffects({ voiceSurface: true }), false, 'Voice surface must suppress decorative effects');
assert.equal(deep.allowHiddenPanelRefresh({ voiceSurface: true }), false, 'Voice surface must suppress hidden panel refreshes');
assert.equal(deep.uiRefreshIntervalMs({ voiceSurface: true }), 60000, 'Voice surface should heavily slow hidden refresh loops');
assert.equal(deep.allowTelemetryUiChatter({ voiceSurface: true }), false, 'Voice surface should suppress telemetry taskbus chatter');
assert.equal(deep.allowTelemetryUiChatter(), true, 'Deep Local cockpit may show telemetry chatter');

const pressured = loadPolicy({ performance: { mode: 'deep-local', localModelAutostart: true, continuousVoice: true, localTts: true } }, { cpu: 91, ram: 70 });
assert.equal(pressured.isSystemUnderPressure(), true, 'high CPU should count as pressure');
assert.equal(pressured.allowLocalModelAutostart(), false, 'pressure must block local model autostart');
assert.equal(pressured.allowAutoVoice(), false, 'pressure must block continuous voice');
assert.equal(pressured.allowLocalTts(), false, 'pressure must block local TTS');
assert.equal(pressured.allowDecorativeEffects(), false, 'pressure must suppress decorative effects');
assert.equal(pressured.uiRefreshIntervalMs(), 60000, 'pressure should slow hidden refresh loops when panels are suspended');
assert.equal(pressured.allowTelemetryUiChatter(), false, 'pressure should suppress telemetry taskbus chatter');

console.log('Performance policy contract OK:', {
  liteAutostart: lite.allowLocalModelAutostart(),
  deepAutostart: deep.allowLocalModelAutostart(),
  desktopIntent: lite.needsDesktopContext('open second app')
});