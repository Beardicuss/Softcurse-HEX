'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const activities = [];

global.window = {
  addLog() {},
  hexCloudSync: {
    runDetached(_label, task) { return task(); },
    recordActivity(activity) { activities.push(activity); }
  }
};

require(path.join(__dirname, '..', 'src', 'js', 'brain-telemetry.js'));

const item = window.hexBrainTelemetry.sync({
  phase: 'route',
  user: 'open third video',
  route: 'direct-browser-action',
  reason: 'cloud-priority-view',
  actionSurface: 'browser',
  providerRequired: false,
  serverPacket: true,
  packetHealth: {
    schema: 'hex.context-packet-health.v1',
    level: 'stale',
    ready: false,
    issues: ['all-context-stale'],
    references: { active: 1, background: 1, total: 2 },
    freshness: { browser: { state: 'fresh' }, inventory: { state: 'stale' } },
    routingGuidance: {
      schema: 'hex.routing-guidance.v1',
      activeSurfaces: ['browser'],
      backgroundOnlySurfaces: ['inventory'],
      missingSurfaces: [],
      clarificationTriggers: ['stale-inventory-context'],
      recoveryPolicy: 'prefer-live-local-context-before-provider-or-clarification',
      browserFollowUpPolicy: 'server-browser-context-active'
    }
  },
  localLiveContext: {
    browser: { open: true, title: 'Eminem - YouTube', url: 'https://youtube.com', candidateCount: 5, candidatesFresh: true, candidatesAgeMs: 1200, snapshotAgeMs: 900 },
    bestTarget: { label: 'Eminem - Lose Yourself', kind: 'video', surface: 'browser', source: 'live-browser-candidates', fresh: true, ageMs: 1200, index: 1 },
    desktopBestTarget: { label: 'Visual Studio Code', kind: 'app', surface: 'desktop', source: 'app-candidates', fresh: true, ageMs: 3000, index: 1, path: 'C:/Apps/Code.exe' },
    candidates: { app: { count: 3, fresh: true, ageMs: 3000 }, file: { count: 2, fresh: false, ageMs: 900000 } },
    referenceCandidateCount: 7,
    lastResolvedReference: { label: 'Eminem - Lose Yourself', kind: 'video', surface: 'browser', source: 'live-browser-candidates' }
  },
  priority: {
    active: [
      {
        label: 'Eminem - Lose Yourself',
        kind: 'browser',
        purpose: 'browser',
        score: 0.97,
        confidence: 0.91,
        freshnessReason: 'browser-fresh',
        ageSeconds: 8
      }
    ],
    background: [
      { label: 'Visual Studio Code', kind: 'app', purpose: 'inventory', score: 0.54, ageSeconds: 900 }
    ],
    guidance: 'Prefer active browser/session references for follow-up commands.'
  }
});

assert.equal(item.priority.activeCount, 1);
assert.equal(item.priority.backgroundCount, 1);
assert.equal(item.priority.topActive.label, 'Eminem - Lose Yourself');
assert.equal(item.priority.topActive.kind, 'browser');
assert.equal(item.priority.topActive.ageSeconds, 8);
assert.equal(item.priority.topBackground.label, 'Visual Studio Code');
assert.match(item.priority.guidance, /Prefer active browser/);
assert.equal(window.hexBrainTelemetry.recent(1)[0].priority.topActive.label, 'Eminem - Lose Yourself');
assert.equal(activities[0].details.priority.topActive.kind, 'browser');
assert.equal(item.packetHealth.level, 'stale');
assert.equal(item.packetHealth.ready, false);
assert.equal(item.packetHealth.issues[0], 'all-context-stale');
assert.equal(item.packetHealth.references.active, 1);
assert.equal(item.packetHealth.freshness.browser, 'fresh');
assert.equal(item.packetHealth.routingGuidance.schema, 'hex.routing-guidance.v1');
assert.equal(item.packetHealth.routingGuidance.recoveryPolicy, 'prefer-live-local-context-before-provider-or-clarification');
assert.equal(item.packetHealth.routingGuidance.browserFollowUpPolicy, 'server-browser-context-active');
assert.equal(item.packetHealth.routingGuidance.backgroundOnlySurfaces[0], 'inventory');
assert.equal(item.packetHealth.routingGuidance.clarificationTriggers[0], 'stale-inventory-context');
assert.equal(activities[0].details.packetHealth.level, 'stale');
assert.equal(activities[0].details.packetHealth.routingGuidance.browserFollowUpPolicy, 'server-browser-context-active');
assert.equal(item.localLiveContext.browser.open, true);
assert.equal(item.localLiveContext.browser.candidateCount, 5);
assert.equal(item.localLiveContext.browser.candidatesFresh, true);
assert.equal(item.localLiveContext.candidates.app.fresh, true);
assert.equal(item.localLiveContext.candidates.file.fresh, false);
assert.equal(item.localLiveContext.bestTarget.label, 'Eminem - Lose Yourself');
assert.equal(item.localLiveContext.bestTarget.fresh, true);
assert.equal(item.localLiveContext.bestTarget.source, 'live-browser-candidates');
assert.equal(item.localLiveContext.desktopBestTarget.label, 'Visual Studio Code');
assert.equal(item.localLiveContext.desktopBestTarget.kind, 'app');
assert.equal(item.localLiveContext.desktopBestTarget.fresh, true);
assert.equal(item.localLiveContext.desktopBestTarget.path, 'C:/Apps/Code.exe');
assert.equal(item.localLiveContext.lastResolvedReference.source, 'live-browser-candidates');
assert.equal(activities[0].details.localLiveContext.browser.title, 'Eminem - YouTube');
assert.equal(activities[0].details.localLiveContext.bestTarget.source, 'live-browser-candidates');
assert.equal(activities[0].details.localLiveContext.desktopBestTarget.source, 'app-candidates');

const nullPriority = window.hexBrainTelemetry.sync({
  phase: 'route',
  user: 'voice mode off',
  route: 'direct-command',
  reason: 'local-control',
  priority: null,
  packetHealth: {
    schema: 'hex.context-packet-health.v1',
    level: 'degraded',
    ready: false,
    references: { active: 0, background: 0 }
  }
});

assert.equal(nullPriority.priority, null);
assert.equal(nullPriority.packetHealth.references.active, 0);

console.log('Brain telemetry priority contract OK');
