'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'settings-ui.js'), 'utf8');

for (const id of [
  'cfg-performance-mode',
  'cfg-performance-voice',
  'cfg-performance-local-tts',
  'cfg-performance-awareness',
  'performance-mode-hint'
]) {
  assert.ok(html.includes(`id="${id}"`), `settings HTML must include ${id}`);
}

assert.ok(settings.includes('function updatePerformanceSettingsUI'), 'settings UI must expose performance hint updater');
assert.ok(settings.includes("mode: document.getElementById('cfg-performance-mode')?.value || 'lite'"), 'saveSettings must persist performance.mode');
assert.ok(settings.includes("localModelAutostart: (document.getElementById('cfg-performance-mode')?.value || 'lite') === 'deep-local'"), 'local model autostart must be gated by Deep Local');
assert.ok(settings.includes("continuousVoice: document.getElementById('cfg-performance-voice')?.value === 'true'"), 'saveSettings must persist continuous voice policy');
assert.ok(settings.includes("localTts: document.getElementById('cfg-performance-local-tts')?.value === 'true'"), 'saveSettings must persist local TTS policy');
assert.ok(settings.includes("awareness: document.getElementById('cfg-performance-awareness')?.value || 'on-demand'"), 'saveSettings must persist awareness policy');

console.log('Performance settings contract OK');