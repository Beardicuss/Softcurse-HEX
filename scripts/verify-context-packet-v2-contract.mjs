import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = path.resolve('cloudflare/hex-server/src/context-packet-v2.js');
const tmpDir = path.join(os.tmpdir(), 'hex-context-packet-contract');
fs.mkdirSync(tmpDir, { recursive: true });
const tmpModule = path.join(tmpDir, 'context-packet-v2.mjs');
fs.writeFileSync(tmpModule, fs.readFileSync(sourcePath, 'utf8'));
const { assembleContextPacketV2, CONTEXT_PACKET_SCHEMA } = await import(pathToFileURL(tmpModule).href + '?t=' + Date.now());

const packet = assembleContextPacketV2({
  query: 'open third video from youtube',
  continuity: {
    profile: { id: 'prof_test', display_name: 'Dante', language: 'en', assistant_mode: 'hex' },
    session: { id: 'sess_test', activeSurface: 'browser', primaryGoal: 'continue YouTube search', updatedAt: '2026-06-24T00:00:00.000Z' },
    browser: { open: true, url: 'https://youtube.com/results?search_query=metallica', title: 'Metallica - YouTube' },
    workingMemory: { currentTask: 'open a video', currentEntities: ['youtube', 'third video'], mood: 'focused' },
    desktopContext: {
      appCandidates: ['Chrome', 'Visual Studio Code'],
      fileCandidates: ['song-list.txt'],
      gameCandidates: ['Cyberpunk 2077'],
      promotedRecent: ['YouTube results'],
      entityMatches: ['third video'],
      inventoryHighlights: ['apps: Chrome, Visual Studio Code'],
      inventoryUpdatedAt: '2026-06-24T00:00:30.000Z'
    },
    recentTurns: [
      { id: 't1', role: 'user', content: 'search youtube metallica', surface: 'browser', created_at: '2026-06-24T00:01:00.000Z' },
      { id: 't2', role: 'assistant', content: 'I opened YouTube results. Which video should I open?', surface: 'browser', created_at: '2026-06-24T00:01:10.000Z' }
    ],
    activityEvents: [
      { kind: 'commitment', status: 'pending', summary: 'Open selected YouTube result', createdAt: '2026-06-24T00:01:20.000Z' }
    ],
    topicLedger: { active: { label: 'YouTube search', status: 'active', at: '2026-06-24T00:01:00.000Z' } }
  },
  retrieval: {
    query: 'open third video from youtube',
    surface: 'browser',
    intent: 'action',
    browserOpen: true,
    focusKinds: ['browser', 'video', 'result'],
    desktopReferenceCount: 2,
    browserReferenceCount: 2
  },
  relevantMemories: [
    { id: 'm1', kind: 'browser_context', content: 'User is browsing YouTube results for Metallica.', confidence: 0.9, retrievalReason: 'matched: youtube, video | browser surface' }
  ],
  relevantTurns: [
    { id: 't1', role: 'user', content: 'search youtube metallica', surface: 'browser', created_at: '2026-06-24T00:01:00.000Z', retrievalReason: 'matched: youtube | surface browser' }
  ],
  references: {
    query: 'open third video from youtube',
    requestedSurface: 'browser',
    desktopFocusOrder: ['recent', 'apps'],
    priority: [{ index: 1, kind: 'browser', label: 'Metallica - YouTube', value: 'Metallica - YouTube', confidence: 0.91, retrievalReason: 'browser continuity' }],
    desktop: [{ index: 1, kind: 'recent', label: 'YouTube results', value: 'YouTube results' }],
    browser: ['Metallica - YouTube', 'https://youtube.com/results?search_query=metallica'],
    desktopByCategory: {
      apps: [{ index: 1, kind: 'app', label: 'Chrome' }],
      recent: [{ index: 1, kind: 'recent', label: 'YouTube results' }]
    }
  },
  unresolvedTasks: [{ kind: 'commitment', text: 'Open selected YouTube result' }],
  actionTimeline: [
    { kind: 'action-result', status: 'success', actionType: 'web_search', text: 'Completed web_search (metallica youtube)', surface: 'browser', at: '2026-06-24T00:01:08.000Z' },
    { kind: 'assistant-step', status: 'pending', text: 'Opened YouTube results', surface: 'browser', at: '2026-06-24T00:01:10.000Z' }
  ],
  summary: { activeSurface: 'browser', browserOpen: true }
});

assert.equal(packet.schema, CONTEXT_PACKET_SCHEMA);
assert.equal(packet.retrieval.schema, 'hex.retrieval-summary.v1');
assert.equal(packet.browser.open, true);
assert.equal(packet.continuityState.schema, 'hex.continuity-state.v1');
assert.equal(packet.continuityState.activeSurface, 'browser');
assert.equal(packet.continuityState.browser.open, true);
assert.equal(packet.continuityState.hasDesktopInventory, true);
assert.equal(packet.continuityState.lastActionStatus, 'pending');
assert.equal(typeof packet.continuityState.freshness.sessionSeconds, 'number');
assert.equal(typeof packet.continuityState.freshness.inventorySeconds, 'number');
assert.equal(packet.activeGoal.text, 'Open selected YouTube result');
assert.equal(packet.relevantMemories[0].retrievalReason.includes('youtube'), true);
assert.equal(packet.relevantTurns[0].retrievalReason.includes('browser'), true);
assert.equal(packet.retrieval.reasons.memories.length, 1);
assert.equal(packet.retrieval.reasons.turns.length, 1);
assert.equal(packet.retrieval.selectedCounts.memories, 1);
assert.equal(packet.retrieval.selectedCounts.turns, 1);
assert.equal(packet.retrieval.selectedCounts.actionTimeline, 2);
assert.equal(packet.retrieval.selectedCounts.priorityReferences, 1);
assert.equal(packet.references.priority[0].confidence, 0.91);
assert.equal(packet.references.priority[0].retrievalReason, 'browser continuity');
assert.equal(packet.retrieval.actionStatusCounts.success, 1);
assert.equal(packet.retrieval.actionStatusCounts.pending, 1);
assert.equal(packet.retrieval.reasons.actions.length, 2);
assert.equal(packet.retrieval.reasons.actions[0].actionType, 'web_search');
assert.equal(packet.retrieval.categoryCounts.apps, 1);
assert.equal(packet.retrieval.categoryCounts.recent, 1);
assert.ok(packet.budgets.used.memories > 0);
assert.ok(packet.budgets.used.turns > 0);
assert.equal(JSON.stringify(packet).includes('undefined'), false);

console.log('Context packet V2 contract OK:', {
  schema: packet.schema,
  retrievalSchema: packet.retrieval.schema,
  continuitySchema: packet.continuityState.schema,
  memoryReasons: packet.retrieval.reasons.memories.length,
  turnReasons: packet.retrieval.reasons.turns.length,
  actionReasons: packet.retrieval.reasons.actions.length,
  desktopCategories: Object.keys(packet.retrieval.categoryCounts).length
});