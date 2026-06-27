'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'actions-butler.js'), 'utf8');

async function createContext(memoryContent) {
  const state = { opened: [], openApps: [], messages: [], logs: [], outcomes: [], findExeCalls: 0 };
  const context = {
    console,
    window: {
      hexActionHelpers: {
        noteDesktopOutcome: (...args) => state.outcomes.push(args),
        noteBrowserOutcome: () => {}
      },
      hexMemory: {
        nodes: [{ content: memoryContent, confidence: 0.99 }],
        recordActionOutcome: () => {}
      },
      hexAPI: {
        browser: { open: async () => ({ success: false }) },
        butler: {
          async findExeInFolder(folderPath, appName) {
            state.findExeCalls += 1;
            return path.join(folderPath, appName + '.exe');
          },
          async openFile(filePath) {
            state.opened.push(filePath);
            return { success: true, path: filePath };
          },
          async openApp(appName) {
            state.openApps.push(appName);
            return { success: false, error: 'not found' };
          }
        }
      }
    },
    addLog: (...args) => state.logs.push(args),
    addHexMessage: (msg) => state.messages.push(msg)
  };
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'actions-butler.js' });
  return { context, state };
}

(async () => {
  let setup = await createContext('playlist insight is at C:\\Users\\DanTe\\Music\\Playlists\\Insight.xspf');
  let result = await setup.context.window.hexButlerActionHandler.handle({ type: 'open_app', args: ['insight'] });
  assert.equal(result.handled, true);
  assert.equal(setup.state.opened.length, 0, 'open_app must not open playlist/document memory paths');
  assert.equal(setup.state.findExeCalls, 0, 'playlist path must not be treated as an app folder');
  assert.equal(setup.state.openApps[0], 'insight', 'normal app launcher should still be tried');
  assert.ok(setup.state.logs.some((entry) => String(entry[1] || '').includes('Ignoring non-app memory path')));

  setup = await createContext('app_path:vlc=C:\\Programs\\VLC\\vlc.exe');
  result = await setup.context.window.hexButlerActionHandler.handle({ type: 'open_app', args: ['vlc'] });
  assert.equal(result.handled, true);
  assert.equal(setup.state.opened[0], 'C:\\Programs\\VLC\\vlc.exe');
  assert.equal(setup.state.openApps.length, 0, 'trusted app_path should not fall through to fuzzy launcher');

  console.log('Open app memory guard contract OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});