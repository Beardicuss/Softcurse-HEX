'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'settings-ui.js'), 'utf8');
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  window: {
    addEventListener() {},
    hexRenderUtils: { createEl: () => ({ style: {}, appendChild() {} }), clearNode() {} },
    hexAPI: {}
  },
  document: {
    documentElement: { lang: 'en' },
    getElementById: () => null,
    addEventListener() {}
  }
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'settings-ui.js' });

const guidance = sandbox.window.buildBrainDatasetGuidance;
assert.equal(typeof guidance, 'function');

const browserGap = guidance({
  exists: true,
  evolutionRecords: 12,
  good: 20,
  fix: 10,
  preferencePairs: 10,
  intents: { 'action-routing-correction': 2 },
  priority: { known: 12, missing: 0, freshBrowser: 2, staleOrMissing: 0 },
  localLive: { known: 12, freshBrowser: 2, freshDesktopBestTargets: 8, noLiveTargets: 0 },
  recovery: { staleReferenceRefusals: 0 }
});
assert.equal(browserGap.level, 'focus');
assert.match(browserGap.text, /browser follow-up corrections/i);

const desktopGap = guidance({
  exists: true,
  evolutionRecords: 12,
  good: 20,
  fix: 10,
  preferencePairs: 10,
  intents: { 'action-routing-correction': 6 },
  priority: { known: 12, missing: 0, freshBrowser: 6, staleOrMissing: 0 },
  localLive: { known: 12, freshBrowser: 6, freshDesktopBestTargets: 1, noLiveTargets: 0 },
  recovery: { staleReferenceRefusals: 0 }
});
assert.equal(desktopGap.level, 'focus');
assert.match(desktopGap.text, /desktop follow-up corrections/i);
assert.match(desktopGap.text, /open it/);
assert.match(desktopGap.text, /focus that one/);

const ready = guidance({
  exists: true,
  evolutionRecords: 40,
  good: 24,
  fix: 12,
  preferencePairs: 12,
  intents: { 'action-routing-correction': 8 },
  priority: { known: 40, missing: 0, freshBrowser: 8, staleOrMissing: 0 },
  localLive: { known: 40, freshBrowser: 8, freshDesktopBestTargets: 4, noLiveTargets: 0 },
  recovery: { staleReferenceRefusals: 0 }
});
assert.equal(ready.level, 'ready');

console.log('Brain dataset guidance contract OK');