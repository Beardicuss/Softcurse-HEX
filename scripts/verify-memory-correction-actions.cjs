'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'memory-extraction.js'), 'utf8');
const context = { console, window: {} };
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'memory-extraction.js' });

const extracted = context.window.hexMemoryExtraction.extractActionCorrectionFact(
  'this is wrong playlist, i said open insight - "C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf"'
);
assert.equal(extracted.kind, 'playlist_alias');
assert.equal(extracted.alias, 'insight');
assert.equal(extracted.path, 'C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
assert.equal(extracted.fact, 'playlist_alias:insight=C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');

const fileExtracted = context.window.hexMemoryExtraction.extractActionCorrectionFact(
  'wrong file, i meant project brief - "C:\\Users\\DanTe\\Documents\\Project Brief.docx"'
);
assert.equal(fileExtracted.kind, 'file_alias');
assert.equal(fileExtracted.alias, 'project brief');
assert.equal(fileExtracted.path, 'C:\\Users\\DanTe\\Documents\\Project Brief.docx');
assert.equal(fileExtracted.fact, 'file_alias:project brief=C:\\Users\\DanTe\\Documents\\Project Brief.docx');

const nodes = [];
const logs = [];
const memory = {
  nodes,
  addNode(type, content, confidence, meta) { nodes.push({ type, content, confidence, meta, status: 'active' }); },
  _wordOverlap: () => 0,
  _archiveNode: () => {},
  _log: (msg) => logs.push(msg)
};
context.window.hexMemoryExtraction.learnFromCorrection(memory, 'opened wrong playlist', 'i said open insight - "C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf"');
const aliasNode = nodes.find((node) => node.type === 'playlist_alias');
assert.equal(aliasNode.content, 'playlist_alias:insight=C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
assert.equal(aliasNode.meta.alias, 'insight');
assert.equal(aliasNode.meta.source, 'user_correction');

context.window.hexMemoryExtraction.learnFromCorrection(memory, 'opened wrong file', 'i meant project brief - "C:\\Users\\DanTe\\Documents\\Project Brief.docx"');
const fileAliasNode = nodes.find((node) => node.type === 'file_alias');
assert.equal(fileAliasNode.content, 'file_alias:project brief=C:\\Users\\DanTe\\Documents\\Project Brief.docx');
assert.equal(fileAliasNode.meta.alias, 'project brief');
assert.equal(fileAliasNode.meta.source, 'user_correction');
assert.ok(logs.some((line) => line.includes('Learned action correction')));

console.log('Memory correction action fact contract OK');
