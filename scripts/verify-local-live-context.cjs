'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const storage = new Map();
global.window = {
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); }
  },
  hexAPI: {
    browser: {
      async status() { return { open: true, url: 'https://youtube.com/results?q=eminem', title: 'Eminem - YouTube' }; }
    }
  },
  hexMemory: null,
  hexPcEntityMemory: { search() { return []; } }
};

global.document = { documentElement: { lang: 'en' } };

require(path.join(__dirname, '..', 'src', 'js', 'candidate-store.js'));
require(path.join(__dirname, '..', 'src', 'js', 'context-state.js'));

const apps = window.hexCandidateStore.set('app', [{ label: 'Visual Studio Code', value: 'Code' }], 'test-app-scan');
assert.equal(apps[0].meta.source, 'test-app-scan');
assert.ok(Number.isFinite(apps[0].meta.seenAt));
assert.equal(window.hexCandidateStore.freshness('app').fresh, true);
assert.equal(window.hexCandidateStore.freshness('app').count, 1);

window.hexContextState.updateBrowserCandidates([
  { index: 1, label: 'Eminem - Lose Yourself', text: 'Eminem - Lose Yourself', kind: 'video' },
  { index: 2, label: 'Eminem - Not Afraid', text: 'Eminem - Not Afraid', kind: 'video' }
], { open: true, url: 'https://youtube.com/results?q=eminem', title: 'Eminem - YouTube' });

const snapshot = window.hexContextState.getSnapshot();
assert.equal(snapshot.browserSnapshot.open, true);
assert.ok(Number.isFinite(snapshot.browserSnapshotUpdatedAt));
assert.ok(Number.isFinite(snapshot.browserCandidatesUpdatedAt));
assert.equal(snapshot.browserCandidates[0].label, 'Eminem - Lose Yourself');
assert.ok(Number.isFinite(snapshot.browserCandidates[0].capturedAt));

const live = window.hexContextState.getLiveContextFreshness();
assert.equal(live.browser.open, true);
assert.equal(live.browser.candidateCount, 2);
assert.equal(live.browser.candidatesFresh, true);
assert.equal(live.browser.bestTarget.label, 'Eminem - Lose Yourself');
assert.equal(live.browser.bestTarget.surface, 'browser');
assert.equal(live.browser.bestTarget.fresh, true);
assert.equal(live.bestTarget.label, 'Eminem - Lose Yourself');
assert.equal(live.bestTarget.kind, 'video');
assert.equal(live.bestTarget.source, 'browser');
assert.equal(live.desktopBestTarget.label, 'Visual Studio Code');
assert.equal(live.desktopBestTarget.kind, 'app');
assert.equal(live.desktopBestTarget.surface, 'desktop');
assert.equal(live.desktopBestTarget.fresh, true);
assert.equal(live.candidates.app.fresh, true);
assert.equal(window.hexContextState.shouldRefreshBrowserCandidates('open third video'), false);

window.hexContextState.state.browserCandidatesUpdatedAt = Date.now() - 60 * 1000;
assert.equal(window.hexContextState.shouldRefreshBrowserCandidates('open third video'), true);
assert.equal(window.hexContextState.shouldRefreshBrowserCandidates('hello hex'), false);

console.log('Local live context freshness contract OK');
