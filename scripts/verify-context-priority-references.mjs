import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = path.resolve('cloudflare/hex-server/src/retrieval-priority.js');
const tmpDir = path.join(os.tmpdir(), 'hex-retrieval-priority-contract');
fs.mkdirSync(tmpDir, { recursive: true });
const tmpModule = path.join(tmpDir, 'retrieval-priority.mjs');
fs.writeFileSync(tmpModule, fs.readFileSync(sourcePath, 'utf8'));
const { buildPriorityReferences } = await import(pathToFileURL(tmpModule).href + '?t=' + Date.now());

const priority = buildPriorityReferences({
  query: 'open third youtube video',
  focusOrder: ['recent', 'apps', 'files'],
  desktopHits: [
    { index: 1, kind: 'recent', label: 'YouTube results', value: 'YouTube results' },
    { index: 2, kind: 'app', label: 'Chrome', value: 'Chrome' }
  ],
  browserHits: ['Metallica - YouTube', 'https://youtube.com/results?search_query=metallica'],
  desktopByCategory: {
    recent: [{ index: 1, kind: 'recent', label: 'YouTube results', value: 'YouTube results duplicate' }],
    apps: [{ index: 1, kind: 'app', label: 'Chrome', value: 'Chrome' }],
    files: [{ index: 1, kind: 'file', label: 'song-list.txt', value: 'song-list.txt' }]
  },
  limit: 6
});

assert.ok(priority.length >= 4, 'priority references should include desktop and browser context');
assert.equal(priority[0].index, 1, 'priority references must be reindexed after ranking');
assert.ok(priority[0].confidence >= priority.at(-1).confidence, 'priority references should be confidence-ranked');
assert.equal(priority.some((item) => item.kind === 'browser'), true, 'browser continuity should be promoted');
assert.equal(priority.some((item) => item.retrievalReason.includes('desktop focus')), true, 'desktop focus reason should be preserved');
assert.equal(priority.filter((item) => item.label === 'Chrome').length, 1, 'duplicates should be collapsed');
assert.equal(JSON.stringify(priority).includes('undefined'), false, 'packet must not serialize undefined values');

console.log('Context priority references contract OK:', {
  items: priority.length,
  top: priority[0].label,
  browserPromoted: priority.some((item) => item.kind === 'browser')
});