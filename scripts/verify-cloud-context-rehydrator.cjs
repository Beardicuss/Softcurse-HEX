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
    routingGuidance: {
      schema: 'hex.routing-guidance.v1',
      activeSurfaces: ['session', 'browser', 'inventory', 'action'],
      backgroundOnlySurfaces: [],
      missingSurfaces: [],
      clarificationTriggers: [],
      recoveryPolicy: 'server-context-can-drive-routing',
      browserFollowUpPolicy: 'server-browser-context-active'
    },
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
assert.equal(appCategory.items[0].meta.contextFresh, true);
assert.equal(appCategory.items[0].meta.contextStale, false);

const memoryIngest = ingested.find((entry) => entry.kind === 'recent' && entry.items.some((item) => item.meta?.source === 'cloud-memory'));
assert.ok(memoryIngest, 'cloud memory should be ingested locally');
assert.equal(memoryIngest.items[0].meta.retrievalReason, 'matched: youtube | browser surface');
assert.equal(memoryIngest.items[0].meta.retrievalSchema, 'hex.retrieval-summary.v1');

const browserIngest = ingested.find((entry) => entry.kind === 'browser');
assert.ok(browserIngest, 'browser references should be ingested into PC entity memory');
assert.equal(browserIngest.items[0].meta.retrievalReason, 'matched: video');
assert.equal(browserIngest.items[0].meta.contextFresh, true);

const priorityView = window.hexCloudContextRehydrator.getPriorityView();
assert.equal(priorityView.schema, 'hex.desktop-priority-view.v1');
assert.ok(priorityView.active.some((item) => item.kind === 'browser' && item.contextFresh), 'fresh browser references should be active');
assert.ok(priorityView.active[0].score >= priorityView.active.at(-1).score, 'active priority references should be score-ranked');
const packetHealth = window.hexCloudContextRehydrator.getPacketHealth();
assert.equal(packetHealth.schema, 'hex.context-packet-health.v1');
assert.equal(packetHealth.level, 'ready');
assert.equal(packetHealth.ready, true);
assert.equal(packetHealth.references.active > 0, true);
assert.equal(packetHealth.routingGuidance.schema, 'hex.routing-guidance.v1');
assert.equal(packetHealth.routingGuidance.browserFollowUpPolicy, 'server-browser-context-active');
assert.equal(packet.contextPacketHealth.level, 'ready');


merged.length = 0;
ingested.length = 0;
synced = false;
promoted = false;
persisted = false;

const stalePacket = {
  ...packet,
  continuityState: {
    ...packet.continuityState,
    freshness: { sessionSeconds: 7200, inventorySeconds: 90000, lastTurnSeconds: 7200, lastActionSeconds: 7200 }
  }
};

assert.equal(window.hexCloudContextRehydrator.applyPacket(stalePacket), true);
assert.equal(synced, true, 'awareness may still receive stale background candidates');
assert.equal(promoted, false, 'stale inventory must not promote as live state');
assert.equal(persisted, false, 'stale inventory must not overwrite persisted inventory');

const staleApp = merged.find((entry) => entry.kind === 'app' && entry.items.some((item) => item.label === 'Chrome'));
assert.ok(staleApp, 'stale app category should still be available as background context');
assert.equal(staleApp.items[0].meta.contextStale, true);
const staleAppIngest = ingested.find((entry) => entry.kind === 'app' && entry.items.some((item) => item.label === 'Chrome'));
assert.ok(staleAppIngest.weight < 1.3, 'stale inventory should ingest with reduced weight');
const stalePriorityView = window.hexCloudContextRehydrator.getPriorityView();
assert.equal(stalePriorityView.active.length, 0, 'stale packet references must not stay active');
assert.ok(stalePriorityView.background.some((item) => item.label === 'Metallica video'), 'stale browser reference should remain as background memory');
const staleHealth = window.hexCloudContextRehydrator.getPacketHealth();
assert.equal(staleHealth.level, 'stale');
assert.equal(staleHealth.issues.includes('all-context-stale'), true);
assert.equal(staleHealth.references.background > 0, true);
assert.equal(staleHealth.routingGuidance.recoveryPolicy, 'server-context-can-drive-routing');

assert.equal(window.hexCloudContextRehydrator.applyPacket(null), false);
const invalidHealth = window.hexCloudContextRehydrator.getPacketHealth();
assert.equal(invalidHealth.level, 'invalid');
assert.equal(invalidHealth.ready, false);
assert.equal(invalidHealth.issues.includes('packet-not-object'), true);

const nullPriorityHealth = window.hexCloudContextRehydrator.getPacketHealth({
  schema: 'hex.context-packet.v2',
  continuityState: {
    schema: 'hex.continuity-state.v1',
    hasDesktopInventory: true,
    freshness: { sessionSeconds: 1, inventorySeconds: 1, lastTurnSeconds: 1, lastActionSeconds: 1 }
  },
  retrieval: { schema: 'hex.retrieval-summary.v1' },
  references: { priority: [] }
});
assert.equal(nullPriorityHealth.references.active, 0);

console.log('Cloud context rehydrator contract OK:', {
  merged: merged.length,
  ingested: ingested.length,
  preservedReason: memoryIngest.items[0].meta.retrievalReason,
  continuitySchema: continuityState.schema
});
