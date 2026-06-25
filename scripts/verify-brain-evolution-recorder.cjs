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
  hexBrainTelemetry: { record: (item) => telemetry.push(item) },
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
  brainRoute: {
    mode: 'provider',
    reason: 'needs-model-reasoning',
    hints: {
      confidence: 0.64,
      providerRequired: true,
      serverPacket: true,
      serverPacketFreshness: { fresh: true, reason: 'browser-fresh' },
      actionPlan: { domain: 'browser-action', suggestedSurface: 'browser' }
    }
  }
};

const record = window.hexBrainEvolution.buildRecord('fix', item, 'Use the current browser session and click the third video result.');
assert.equal(record.schema, 'hex.evolution-feedback.v2');
assert.equal(record.version, '0.2.0');
assert.equal(record.trainingIntent, 'action-routing-correction');
assert.equal(record.quality.usableForSft, true);
assert.equal(record.quality.usableForPreference, true);
assert.equal(record.quality.usableAsNegative, true);
assert.equal(record.context.schema, 'hex.feedback-context.v1');
assert.equal(record.context.route.actionSurface, 'browser');
assert.equal(record.context.cloudContinuity.freshnessTiers.browser, 'fresh');
assert.equal(record.training.kind, 'preference-correction');

(async () => {
  const result = await window.hexBrainEvolution.record('fix', item, 'Use the current browser session and click the third video result.');
  assert.equal(result.success, true);
  assert.equal(appended[0].type, 'hex_evolution_feedback');
  assert.equal(appended[1].type, 'hex_training_chat');
  assert.equal(appended[1].trainingIntent, 'action-routing-correction');
  assert.equal(appended[2].type, 'hex_preference_pair');
  assert.equal(appended[2].context.cloudContinuity.browserOpen, true);
  assert.equal(telemetry[0].route, 'action-routing-correction');
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