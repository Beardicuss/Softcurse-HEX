'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const appended = [];
const telemetry = [];
const activities = [];

global.document = { documentElement: { lang: 'en' } };
global.window = {
  _hexConfig: { language: 'en', mode: 'hex', ai: { provider: 'mistral' } },
  _hexSelectedProvider: 'mistral',
  currentMode: 'hex',
  hexAPI: {
    appendFinetune: async (lines) => {
      appended.push(...lines.map((line) => JSON.parse(line)));
      return { success: true, path: 'C:/Users/DanTe/AppData/Roaming/softcurse-hex/hex-finetune.jsonl' };
    }
  },
  hexBrainTelemetry: {
    recent: () => [{
      user: 'fallback user',
      route: 'direct-browser-action',
      priority: { activeCount: 1, backgroundCount: 0, topActive: { label: 'Fallback browser ref', kind: 'browser', purpose: 'browser' } }
    }],
    record: (item) => telemetry.push(item)
  },
  hexCloudSync: { runDetached: (_label, task) => Promise.resolve().then(task), recordActivity: async (item) => activities.push(item) },
  hexCloudContextRehydrator: {
    getLastContinuityState: () => ({
      activeSurface: 'browser',
      browser: { open: true },
      freshness: { sessionSeconds: 30, lastTurnSeconds: 12 },
      freshnessTiers: { session: 'fresh', browser: 'fresh' }
    })
  },
  hexContextState: { state: { activeSurface: 'browser' } },
  hexMemory: { working: { currentTask: 'open third video' } },
  isVoiceAgiActive: () => false
};

require(path.join(__dirname, '..', 'src', 'js', 'brain-evolution-recorder.js'));

const item = {
  user: 'open third video',
  assistant: 'I opened a new browser instead.',
  language: 'en',
  actions: [{ type: 'web_find_click', args: ['third video'] }],
  brainRoute: {
    mode: 'provider',
    reason: 'needs-model-reasoning',
    hints: {
      confidence: 0.64,
      providerRequired: true,
      serverPacket: true,
      serverPacketFreshness: { fresh: true, reason: 'browser-fresh' },
      actionPlan: { domain: 'browser-action', suggestedSurface: 'browser' },
      server: {
        priorityView: {
          schema: 'hex.desktop-priority-view.v1',
          active: [
            { label: 'Eminem - Lose Yourself', kind: 'browser', purpose: 'browser', score: 0.98, confidence: 0.92, freshnessReason: 'browser-fresh', ageSeconds: 9 }
          ],
          background: [
            { label: 'Visual Studio Code', kind: 'app', purpose: 'inventory', score: 0.48, ageSeconds: 1200 }
          ],
          guidance: 'Prefer active browser references.'
        }
      }
    }
  }
};

const record = window.hexBrainEvolution.buildRecord('fix', item, 'Use the current browser session and click the third video result.');
assert.equal(record.schema, 'hex.evolution-feedback.v2');
assert.equal(record.version, '0.2.1');
assert.equal(record.trainingIntent, 'action-routing-correction');
assert.equal(record.quality.usableForSft, true);
assert.equal(record.quality.usableForPreference, true);
assert.equal(record.quality.usableAsNegative, true);
assert.equal(record.quality.route.localFirst, false);
assert.equal(record.quality.route.providerRequired, true);
assert.equal(record.quality.route.confidenceBand, 'low');
assert.equal(record.quality.route.serverFreshnessState, 'fresh');
assert.equal(record.quality.action.hasActions, true);
assert.equal(record.quality.action.expectedActionTypes[0], 'web_find_click');
assert.equal(record.quality.action.likelyActionFeedback, true);
assert.equal(record.quality.context.browserOpen, true);
assert.equal(record.quality.context.cloudContinuityPresent, true);
assert.equal(record.context.priorityReferences.schema, 'hex.feedback-priority-context.v1');
assert.equal(record.context.priorityReferences.source, 'brain-route');
assert.equal(record.context.priorityReferences.topActive.label, 'Eminem - Lose Yourself');
assert.equal(record.quality.context.priority.known, true);
assert.equal(record.quality.context.priority.freshBrowserReference, true);
assert.equal(record.quality.context.priority.topActiveKind, 'browser');
assert.equal(record.context.schema, 'hex.feedback-context.v1');
assert.equal(record.context.route.actionSurface, 'browser');
assert.equal(record.context.cloudContinuity.freshnessTiers.browser, 'fresh');
assert.equal(record.training.kind, 'preference-correction');

(async () => {
  const result = await window.hexBrainEvolution.record('fix', item, 'Use the current browser session and click the third video result.');
  assert.equal(result.success, true);
  assert.equal(appended[0].type, 'hex_evolution_feedback');
  assert.equal(appended[0].context.priorityReferences.topActive.label, 'Eminem - Lose Yourself');
  assert.equal(appended[1].quality.context.priority.freshBrowserReference, true);
  assert.equal(appended[2].context.priorityReferences.topActive.kind, 'browser');
  assert.equal(appended[1].type, 'hex_training_chat');
  assert.equal(appended[1].trainingIntent, 'action-routing-correction');
  assert.equal(appended[2].type, 'hex_preference_pair');
  assert.equal(appended[2].context.cloudContinuity.browserOpen, true);
  assert.equal(telemetry[0].route, 'action-routing-correction');
  assert.equal(telemetry[0].priority.topActive.label, 'Eminem - Lose Yourself');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(activities[0].trainingIntent, 'action-routing-correction');

  console.log('Brain evolution recorder contract OK:', {
    version: record.version,
    intent: record.trainingIntent,
    jsonlRows: appended.length
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});