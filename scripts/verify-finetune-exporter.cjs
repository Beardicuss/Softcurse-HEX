'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registerBrainIPC = require(path.join(__dirname, '..', 'src', 'main', 'ipc-brain.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-finetune-export-'));
const finetunePath = path.join(tmp, 'hex-finetune.jsonl');
const handlers = new Map();

const quality = {
  label: 'corrected',
  usableForSft: true,
  usableForPreference: true,
  usableAsNegative: true,
  route: {
    routeKnown: true,
    mode: 'provider',
    reason: 'needs-model-reasoning',
    confidence: 0.91,
    confidenceBand: 'high',
    localFirst: false,
    providerRequired: true,
    serverPacket: true,
    serverFreshnessState: 'fresh'
  },
  action: {
    expectedActionCount: 1,
    expectedActionTypes: ['web_find_click'],
    hasActions: true,
    routedActionDomain: 'browser',
    routedActionSurface: 'browser',
    likelyActionFeedback: true
  },
  context: {
    language: 'en',
    voiceMode: true,
    activeSurface: 'browser',
    browserOpen: true,
    hasCurrentTask: true,
    cloudContinuityPresent: true,
    cloudFreshnessKnown: true,
    serverPacketStale: false,
    serverPacketFresh: true
  }
};
const rows = [
  {
    type: 'hex_evolution_feedback',
    signal: 'good',
    trainingIntent: 'dialogue-style',
    language: 'en',
    assistant: 'I am with you, Dante.'
  },
  {
    type: 'hex_training_chat',
    sourceFeedbackId: 'fb_1',
    signal: 'good',
    trainingIntent: 'dialogue-style',
    language: 'en',
    context: { route: { mode: 'dialogue' } },
    quality,
    messages: [
      { role: 'user', content: 'hello hex' },
      { role: 'assistant', content: 'I am with you, Dante.' }
    ]
  },
  {
    type: 'hex_training_chat',
    sourceFeedbackId: 'fb_1_duplicate',
    signal: 'good',
    trainingIntent: 'dialogue-style',
    language: 'en',
    messages: [
      { role: 'user', content: 'hello hex' },
      { role: 'assistant', content: 'I am with you, Dante.' }
    ]
  },
  {
    type: 'hex_preference_pair',
    sourceFeedbackId: 'fb_2',
    trainingIntent: 'action-routing-correction',
    language: 'en',
    context: { route: { actionSurface: 'browser' } },
    quality,
    prompt: 'open third video',
    chosen: 'I will use the current browser results and open the third video.',
    rejected: 'Opening a new browser window.'
  },
  {
    type: 'hex_preference_pair',
    sourceFeedbackId: 'fb_2_duplicate',
    trainingIntent: 'action-routing-correction',
    language: 'en',
    prompt: 'open third video',
    chosen: 'I will use the current browser results and open the third video.',
    rejected: 'Opening a new browser window.'
  },
  'not-json'
];

fs.writeFileSync(
  finetunePath,
  rows.map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n',
  'utf8'
);

registerBrainIPC({
  ipcMain: {
    handle: (channel, handler) => handlers.set(channel, handler)
  },
  app: {
    getPath: (name) => {
      assert.equal(name, 'userData');
      return tmp;
    }
  }
});

const result = handlers.get('finetune:export-clean')();
assert.equal(result.success, true);
assert.equal(result.schema, 'hex.clean-dataset-manifest.v1');
assert.equal(result.rawPath, finetunePath);
assert.equal(result.counts.rawRows, 5);
assert.equal(result.counts.sft, 1);
assert.equal(result.counts.preferences, 1);
assert.equal(result.intents['dialogue-style'], 1);
assert.equal(result.intents['action-routing-correction'], 1);
assert.equal(result.languages.en, 2);

const sftLines = fs.readFileSync(result.sftPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const prefLines = fs.readFileSync(result.preferencePath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

assert.equal(sftLines.length, 1);
assert.deepEqual(sftLines[0].messages[0], { role: 'user', content: 'hello hex' });
assert.equal(sftLines[0].metadata.trainingIntent, 'dialogue-style');
assert.equal(sftLines[0].metadata.quality.route.confidenceBand, 'high');
assert.equal(sftLines[0].metadata.quality.action.expectedActionTypes[0], 'web_find_click');
assert.equal(prefLines.length, 1);
assert.equal(prefLines[0].prompt, 'open third video');
assert.equal(prefLines[0].metadata.context.route.actionSurface, 'browser');
assert.equal(prefLines[0].metadata.quality.usableForPreference, true);
assert.equal(prefLines[0].metadata.quality.context.browserOpen, true);
assert.equal(manifest.counts.preferences, 1);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Fine-tune clean dataset exporter contract OK:', result.counts);
