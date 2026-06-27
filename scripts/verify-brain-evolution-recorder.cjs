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
  hexContextState: {
    state: { activeSurface: 'browser' },
    getLiveContextFreshness: () => ({
      browser: { open: true, title: 'Eminem - YouTube', url: 'https://youtube.com', candidateCount: 5, candidatesFresh: true, candidatesAgeMs: 1200, snapshotAgeMs: 900 },
      bestTarget: { label: 'Eminem - Lose Yourself', kind: 'video', surface: 'browser', source: 'live-browser-candidates', fresh: true, ageMs: 1200, index: 1 },
      desktopBestTarget: { label: 'Visual Studio Code', kind: 'app', surface: 'desktop', source: 'app-candidates', fresh: true, ageMs: 3000, index: 1, path: 'C:/Apps/Code.exe' },
      candidates: { app: { count: 3, fresh: true, ageMs: 3000 }, file: { count: 1, fresh: false, ageMs: 900000 } },
      referenceCandidateCount: 6,
      lastResolvedReference: { label: 'Eminem - Lose Yourself', kind: 'video', surface: 'browser', source: 'live-browser-candidates' }
    })
  },
  hexMemory: { working: { currentTask: 'open third video' } },
  isVoiceAgiActive: () => false
};

require(path.join(__dirname, '..', 'src', 'js', 'memory-extraction.js'));
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


const refusalItem = {
  user: 'same one',
  assistant: 'I know this refers to the current browser, but I do not have a fresh target for "that one".',
  language: 'en',
  recovery: {
    schema: 'hex.feedback-recovery-message.v1',
    text: 'I know this refers to the current browser, but I do not have a fresh target for "that one".',
    mode: 'context-gap-local',
    reason: 'no-fresh-browser-target',
    classification: 'stale-reference-refusal',
    refusedToGuess: true,
    actionsSuggested: 0
  },
  brainRoute: {
    mode: 'context-gap-local',
    reason: 'no-fresh-browser-target',
    confidence: 0.78,
    providerRequired: false,
    hints: {
      confidence: 0.78,
      providerRequired: false,
      actionPlan: { domain: 'browser-follow-up', suggestedSurface: 'browser' }
    }
  }
};

const refusalRecord = window.hexBrainEvolution.buildRecord('good', refusalItem, '');
assert.equal(refusalRecord.context.recoveryMessage.reason, 'no-fresh-browser-target');
assert.equal(refusalRecord.quality.recovery.staleReferenceRefusal, true);
assert.equal(refusalRecord.quality.recovery.refusedToGuess, true);
assert.equal(refusalRecord.quality.context.recovery.staleReferenceRefusal, true);
assert.equal(refusalRecord.training.kind, 'sft-positive');
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
assert.equal(record.context.localLiveContext.schema, 'hex.feedback-local-live-context.v1');
assert.equal(record.context.localLiveContext.browser.candidateCount, 5);
assert.equal(record.context.localLiveContext.bestTarget.source, 'live-browser-candidates');
assert.equal(record.context.localLiveContext.desktopBestTarget.label, 'Visual Studio Code');
assert.equal(record.context.localLiveContext.desktopBestTarget.path, 'C:/Apps/Code.exe');
assert.equal(record.context.localLiveContext.lastResolvedReference.source, 'live-browser-candidates');
assert.equal(record.quality.context.priority.known, true);
assert.equal(record.quality.context.priority.freshBrowserReference, true);
assert.equal(record.quality.context.priority.topActiveKind, 'browser');
assert.equal(record.quality.context.localLive.known, true);
assert.equal(record.quality.context.localLive.freshBrowserCandidates, true);
assert.deepEqual(record.quality.context.localLive.freshLocalCandidateKinds, ['app']);
assert.deepEqual(record.quality.context.localLive.staleLocalCandidateKinds, ['file']);
assert.equal(record.quality.context.localLive.desktopBestTargetKind, 'app');
assert.equal(record.quality.context.localLive.desktopBestTargetSource, 'app-candidates');
assert.equal(record.quality.context.localLive.freshDesktopBestTarget, true);
assert.equal(record.context.schema, 'hex.feedback-context.v1');
assert.equal(record.context.route.actionSurface, 'browser');
assert.equal(record.context.cloudContinuity.freshnessTiers.browser, 'fresh');
assert.equal(record.training.kind, 'preference-correction');
const playlistCorrectionRecord = window.hexBrainEvolution.buildRecord(
  'fix',
  {
    user: 'open playlist insight',
    assistant: 'I opened Chronicles of the Fallen World.xspf.',
    language: 'en',
    actions: [{ type: 'open_playlist', args: ['insight'] }],
    brainRoute: { mode: 'direct-local-action', reason: 'direct-local-action', providerRequired: false }
  },
  'this is wrong playlist, i said open insight - "C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf"'
);
assert.equal(playlistCorrectionRecord.actionCorrection.kind, 'playlist_alias');
assert.equal(playlistCorrectionRecord.actionCorrection.alias, 'insight');
assert.equal(playlistCorrectionRecord.actionCorrection.fact, 'playlist_alias:insight=C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
assert.equal(playlistCorrectionRecord.tags.includes('exact-action-correction'), true);

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
  assert.equal(appended[1].quality.context.localLive.freshBrowserCandidates, true);
  assert.equal(appended[1].quality.context.localLive.freshDesktopBestTarget, true);
  assert.equal(appended[2].context.localLiveContext.browser.title, 'Eminem - YouTube');
  assert.equal(appended[2].context.localLiveContext.desktopBestTarget.source, 'app-candidates');
  assert.equal(telemetry[0].route, 'action-routing-correction');
  assert.equal(telemetry[0].priority.topActive.label, 'Eminem - Lose Yourself');
  assert.equal(telemetry[0].localLiveContext.browser.candidateCount, 5);
  assert.equal(telemetry[0].localLiveContext.desktopBestTarget.kind, 'app');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(activities[0].trainingIntent, 'action-routing-correction');

  const refusalResult = await window.hexBrainEvolution.record('good', refusalItem, '');
  assert.equal(refusalResult.success, true);
  assert.equal(appended[3].context.recoveryMessage.classification, 'stale-reference-refusal');
  assert.equal(appended[4].quality.recovery.staleReferenceRefusal, true);

  console.log('Brain evolution recorder contract OK:', {
    version: record.version,
    intent: record.trainingIntent,
    jsonlRows: appended.length
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
