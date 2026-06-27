'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'actions-files.js'), 'utf8');
const state = { opened: [], logs: [], outcomes: [] };

const context = {
  console,
  window: {
    hexActionHelpers: {
      noteDesktopOutcome: (...args) => state.outcomes.push(args)
    },
    hexAPI: {
      butler: {
        async openFile(filePath) {
          state.opened.push(filePath);
          return { success: true, path: filePath };
        }
      }
    },
    hexMemory: {
      nodes: [{ content: 'file_alias:project brief=C:\\Users\\DanTe\\Documents\\Project Brief.docx' }],
      recordActionOutcome: () => {}
    }
  },
  addLog: (...args) => state.logs.push(args),
  addHexMessage: () => {}
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'actions-files.js' });

(async () => {
  const result = await context.window.hexFileActionHandler.handle({ type: 'open_file', args: ['project brief'] });
  assert.equal(result.handled, true);
  assert.equal(state.opened[0], 'C:\\Users\\DanTe\\Documents\\Project Brief.docx');
  assert.equal(state.outcomes[0][0].meta.source, 'file-alias-memory');
  assert.equal(state.outcomes[0][0].meta.exact, true);
  assert.ok(state.logs.some((entry) => String(entry[1] || '').includes('Opening learned file alias')));

  console.log('File alias action contract OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
