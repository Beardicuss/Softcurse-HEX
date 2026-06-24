'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}

global.window = {
  _hexConfig: { language: 'en' },
  hexTaskBus: { push() {} },
  hexMemory: null,
  hexBrainRouter: {
    async route({ userMsg }) {
      if (/screenshot/i.test(userMsg || '')) {
        return {
          mode: 'direct-local-action',
          reason: 'direct-local-action',
          text: 'Taking a screenshot.',
          actions: [{ type: 'screenshot', args: [], meta: { source: 'brain-action-recovery', reason: 'direct-local-action', recoveredFromProviderFailure: false } }],
          hints: { route: 'direct-local-action', reason: 'direct-local-action', providerRequired: false }
        };
      }
      if (/youtube/i.test(userMsg || '')) {
        return {
          mode: 'direct-browser-action',
          reason: 'direct-browser-action',
          text: 'Opening the browser and searching for eminem.',
          actions: [{ type: 'web_search', args: ['https://youtube.com', 'eminem'], meta: { source: 'brain-action-recovery', reason: 'direct-browser-action', recoveredFromProviderFailure: false } }],
          hints: { route: 'direct-browser-action', reason: 'direct-browser-action', providerRequired: false }
        };
      }
      return {
        mode: 'action-recovery-local',
        reason: 'recent-action-failure',
        text: 'I will refresh the current page context first.',
        actions: [{ type: 'web_read', args: [] }],
        hints: { route: 'local-reflex', reason: 'recent-action-failure', providerRequired: false }
      };
    }
  },
  hexBrainTelemetry: { sync() {} }
};

global.config = { llm: { provider: 'llamacpp', model: 'qwen3' } };

loadBrowserScript('src/js/ai.js');

(async () => {
  const ai = window.hexAI;
  ai.config = global.config;
  ai.history = [];

  let providerCalled = false;
  ai._llamaCpp = async () => { providerCalled = true; throw new Error('provider should not be called'); };

  const result = await ai.chat('open third video', { sessionContext: { activeSurface: 'browser' } }, 'en');
  assert.equal(result.text, 'I will refresh the current page context first.');
  assert.deepEqual(result.actions, [{ type: 'web_read', args: [] }]);
  assert.equal(result.brainRoute.reason, 'recent-action-failure');

  console.log('AI routed actions contract OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});


