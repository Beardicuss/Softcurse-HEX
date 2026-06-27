'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'actions-files.js'), 'utf8');
const state = { opened: [], logs: [], messages: [], outcomes: [], searches: 0 };

const context = {
  console,
  window: {
    hexActionHelpers: {
      noteDesktopOutcome: (...args) => state.outcomes.push(args)
    },
    hexAPI: {
      butler: {
        async findFiles(query, category) {
          state.searches += 1;
          assert.equal(query, 'insight');
          assert.equal(category, 'music');
          return {
            success: true,
            files: [
              { name: 'Chronicles of the Fallen World.xspf', path: 'C:\\Users\\DanTe\\Music\\Playlists\\Chronicles of the Fallen World.xspf' },
              { name: 'Insight.xspf', path: 'C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf' }
            ]
          };
        },
        async openFile(filePath) {
          state.opened.push(filePath);
          return { success: true, path: filePath };
        }
      }
    },
    hexMemory: { nodes: [] }
  },
  addLog: (...args) => state.logs.push(args),
  addHexMessage: (msg) => state.messages.push(msg)
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'actions-files.js' });

(async () => {
  assert.equal(typeof context.window.hexFileActionHandler?.handle, 'function');
  const result = await context.window.hexFileActionHandler.handle({ type: 'open_playlist', args: ['insight'] });
  assert.equal(result.handled, true);
  assert.equal(state.opened[0], 'C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
  assert.match(state.messages.at(-1), /Opening playlist/i);
  assert.equal(state.outcomes[0][0].meta.exact, true);
  assert.equal(state.searches, 1);

  state.opened.length = 0;
  state.messages.length = 0;
  state.outcomes.length = 0;
  state.searches = 0;
  context.window.hexMemory.nodes = [{ content: 'playlist_alias:insight=C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf' }];
  const learnedResult = await context.window.hexFileActionHandler.handle({ type: 'open_playlist', args: ['insight'] });
  assert.equal(learnedResult.handled, true);
  assert.equal(state.opened[0], 'C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
  assert.equal(state.searches, 0, 'learned playlist alias should bypass file search');
  assert.equal(state.outcomes[0][0].meta.source, 'playlist-alias-memory');

  console.log('Playlist action contract OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});