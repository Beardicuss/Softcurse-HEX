'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

global.window = {
  buildHexPromptContext() {
    return {
      personalityPrompt: 'You are HEX.',
      localizedUnitName: 'HEX',
      localizedUserName: 'Dante',
      langName: 'English',
      now: new Date('2026-06-24T12:00:00.000Z'),
      memoryCtx: '',
      conversationDigest: ''
    };
  }
};

require(path.join(__dirname, '..', 'src', 'js', 'ai-prompt-compact.js'));
require(path.join(__dirname, '..', 'src', 'js', 'ai-prompt-sections.js'));

const state = {
  cpu: 10,
  ram: 20,
  disk: 30,
  platform: 'Windows',
  aiProvider: 'llamacpp',
  ttsEngine: 'local',
  browserSession: { open: true, title: 'YouTube', url: 'https://youtube.com' },
  sessionContext: { activeSurface: 'browser', lastUserMessage: 'open third video', lastRecoveredAction: { type: 'web_find_click', summary: 'Opened third video from YouTube results', success: true } },
  workingMemory: {},
  desktopContext: {},
  brainRoute: {},
  cloudContext: {
    retrieval: {
      selectedCounts: {
        memories: 1,
        turns: 2,
        desktopReferences: 3,
        browserReferences: 4,
        actionTimeline: 5
      },
      actionStatusCounts: {
        success: 2,
        failure: 1,
        pending: 2
      },
      routingGuidance: {
        schema: 'hex.routing-guidance.v1',
        activeSurfaces: ['session'],
        backgroundOnlySurfaces: ['browser'],
        missingSurfaces: [],
        clarificationTriggers: ['stale-browser-reference'],
        recoveryPolicy: 'prefer-live-local-context-before-provider-or-clarification',
        browserFollowUpPolicy: 'require-fresh-live-browser-target-before-clicking'
      },
      reasons: {
        memories: [{ kind: 'browser_context', reason: 'matched youtube' }],
        turns: [{ role: 'user', reason: 'surface browser' }],
        actions: [{ kind: 'action-result', status: 'failure', actionType: 'web_find_click', reason: 'failure | web_find_click | browser' }]
      }
    },
    actionTimeline: [
      { kind: 'action-result', status: 'failure', actionType: 'web_find_click', text: 'Failed web_find_click third video' }
    ],
    relevantMemories: [],
    relevantTurns: [],
    unresolvedTasks: [],
    dialogue: {},
    references: {}
  }
};

const compact = window.buildHexCompactSystemPrompt(state, 'en', 'open third video');
assert.match(compact, /Cloud retrieval: memories 1, turns 2, desktop refs 3, browser refs 4, actions 5/);
assert.match(compact, /Cloud action outcomes: success 2, failure 1, pending 2/);
assert.match(compact, /Cloud routing guidance: policy prefer-live-local-context-before-provider-or-clarification \| browser require-fresh-live-browser-target-before-clicking \| clarify stale-browser-reference/);
assert.match(compact, /Recent actions: action-result: Failed web_find_click third video/);
assert.match(compact, /Last recovered action: web_find_click succeeded: Opened third video from YouTube results/);

const systemBlock = window.buildHexSystemStateBlock(state, { now: new Date('2026-06-24T12:00:00.000Z') });
assert.match(systemBlock, /Cloud action outcomes: success 2, failure 1, pending 2/);
assert.match(systemBlock, /Cloud routing guidance: policy prefer-live-local-context-before-provider-or-clarification \| browser require-fresh-live-browser-target-before-clicking \| clarify stale-browser-reference/);
assert.match(systemBlock, /Action timeline: action-result: Failed web_find_click third video/);

const continuityBlock = window.buildHexContinuityBlock(state, 'open third video');
assert.match(continuityBlock, /Cloud action outcomes : success 2, failure 1, pending 2/);
assert.match(continuityBlock, /Cloud routing guidance: policy prefer-live-local-context-before-provider-or-clarification \| browser require-fresh-live-browser-target-before-clicking \| clarify stale-browser-reference/);
assert.match(continuityBlock, /Last recovered action: web_find_click succeeded: Opened third video from YouTube results/);

const degradedState = JSON.parse(JSON.stringify(state));
degradedState.cloudContext.retrieval.contextUse = null;
const degradedCompact = window.buildHexCompactSystemPrompt(degradedState, 'en', 'voice mode off');
const degradedSystemBlock = window.buildHexSystemStateBlock(degradedState, { now: new Date('2026-06-24T12:00:00.000Z') });
const degradedContinuityBlock = window.buildHexContinuityBlock(degradedState, 'show my playlists');
assert.match(degradedCompact, /Cloud context use: active none \| background none \| missing none/);
assert.match(degradedSystemBlock, /Cloud context use: active none \| background none \| missing none/);
assert.match(degradedContinuityBlock, /Cloud context use    : active none \| background none \| missing none/);
console.log('Prompt action outcome contract OK');
