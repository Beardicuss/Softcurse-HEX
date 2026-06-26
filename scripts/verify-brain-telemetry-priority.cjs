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

console.log('Brain telemetry priority contract OK');