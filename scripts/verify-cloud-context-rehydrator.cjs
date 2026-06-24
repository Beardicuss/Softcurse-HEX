'use strict';

const assert = require('assert/strict');

const merged = [];
const ingested = [];
let synced = false;
let promoted = false;
let persisted = false;

global.window = {
  hexCandidateStore: {
    merge(kind, items) {
      merged.push({ kind, items });
      return items;
    }
  },
  hexPcEntityMemory: {
    ingest(items, kind, weight) {
      ingested.push({ kind, weight, items });
      return items;
    }
  },
  hexPcAwareness: { syncFromCandidates() { synced = true; } },
  hexPcEntityPromoter: { promoteInventorySnapshot() { promoted = true; } },
  hexPcInventory: { persistNow() { persisted = true; } }
};

require('../src/js/cloud-context-rehydrator.js');

const packet = {
  schema: 'hex.context-packet.v2',
  continuityState: {
    schema: 'hex.continuity-state.v1',
    activeSurface: 'browser',
    browser: { open: true, title: 'Metallica video', url: 'https://youtube.com' },
    hasDesktopInventory: true,
    freshness: { sessionSeconds: 20, inventorySeconds: 90, lastTurnSeconds: 12, lastActionSeconds: 10 }
  },
  retrieval: {
    schema: 'hex.retrieval-summary.v1',
    categoryCounts: { apps: 2, recent: 1 },
    reasons: {
      memories: [{ id: 'm1', kind: 'browser_context', reason: 'matched: youtube | browser surface' }]
    }
  },
  references: {
    desktop: [{ index: 1, kind: 'recent', label: 'YouTube results', value: 'YouTube results', retrievalReason: 'matched: youtube' }],
    browser: [{ index: 1, kind: 'browser', label: 'Metallica video', value: 'Metallica video', retrievalReason: 'matched: video' }],
    desktopByCategory: {
      apps: [{ index: 1, kind: 'app', label: 'Chrome', value: 'Chrome', retrievalReason: 'focus kind app' }],
      recent: [{ index: 1, kind: 'recent', label: 'YouTube results', value: 'YouTube results' }]
    }
  },
  relevantMemories: [
    { id: 'm1', kind: 'browser_context', content: 'User is browsing YouTube results.', confidence: 0.91, retrievalReason: 'matched: youtube | browser surface' }
  ],
  desktopContext: {
    appCandidates: ['Visual Studio Code']
  }
};

assert.equal(window.hexCloudContextRehydrator.applyPacket(packet), true);
const continuityState = window.hexCloudContextRehydrator.getLastContinuityState();
assert.equal(continuityState.schema, 'hex.continuity-state.v1');
assert.equal(continuityState.activeSurface, 'browser');
assert.equal(continuityState.browser.open, true);
assert.equal(continuityState.freshness.inventorySeconds, 90);
assert.equal(synced, true, 'awareness should refresh after rehydration');
assert.equal(promoted, true, 'entity promoter should run after rehydration');
assert.equal(persisted, true, 'inventory should persist after rehydration');

const appCategory = merged.find((entry) => entry.kind === 'app' && entry.items.some((item) => item.label === 'Chrome'));
assert.ok(appCategory, 'app category should be merged');
assert.equal(appCategory.items[0].meta.retrievalSchema, 'hex.retrieval-summary.v1');
assert.equal(appCategory.items[0].meta.categoryCount, 2);
assert.equal(appCategory.items[0].meta.retrievalReason, 'focus kind app');

const memoryIngest = ingested.find((entry) => entry.kind === 'recent' && entry.items.some((item) => item.meta?.source === 'cloud-memory'));
assert.ok(memoryIngest, 'cloud memory should be ingested locally');
assert.equal(memoryIngest.items[0].meta.retrievalReason, 'matched: youtube | browser surface');
assert.equal(memoryIngest.items[0].meta.retrievalSchema, 'hex.retrieval-summary.v1');

const browserIngest = ingested.find((entry) => entry.kind === 'browser');
assert.ok(browserIngest, 'browser references should be ingested into PC entity memory');
assert.equal(browserIngest.items[0].meta.retrievalReason, 'matched: video');

console.log('Cloud context rehydrator contract OK:', {
  merged: merged.length,
  ingested: ingested.length,
  preservedReason: memoryIngest.items[0].meta.retrievalReason,
  continuitySchema: continuityState.schema
});