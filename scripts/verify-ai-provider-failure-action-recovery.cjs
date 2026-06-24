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
  _lastUserMsg: '',
  hexTaskBus: { push() {} },
  hexMemory: null,
  hexBrainCore: { survivalReply: () => 'local fallback' },
  hexBrainRouter: {
    async route() {
      return {
        mode: 'provider',
        reason: 'needs-model-reasoning',
        text: null,
        actions: [],
        hints: {
          route: 'provider',
          reason: 'needs-model-reasoning',
          providerRequired: true,
          actionPlan: { domain: 'browser-action', suggestedSurface: 'browser', urgency: 'high' }
        }
      };
    }
  },
  hexBrainActionRecovery: {
    actionsForProviderFailure() {
      return {
        text: 'Provider reasoning is unavailable, but I understood the command. Executing the safe local action through browser.',
        actions: [{ type: 'web_find_click', args: ['third video'], meta: { source: 'brain-action-recovery', recoveredFromProviderFailure: true, reason: 'provider-failure-action-recovery' } }],
        reason: 'provider-failure-action-recovery',
        plan: { domain: 'browser-action', suggestedSurface: 'browser', urgency: 'high' }
      };
    }
  },
  hexBrainTelemetry: { sync() {} },
  hexAPI: {
    getProviderCapabilities: async () => ({ providers: {}, capabilities: null })
  },
  buildHexSystemPrompt: () => 'system prompt'
};

global.config = { llm: { provider: 'llamacpp', model: 'qwen3' } };

loadBrowserScript('src/js/ai.js');

(async () => {
  const ai = window.hexAI;
  ai.config = global.config;
  ai.history = [];
  ai._llamaCpp = async () => { throw new Error('local model unavailable'); };
  ai._ollama = async () => { throw new Error('ollama unavailable'); };

  const result = await ai.chat('open third video', {
    browserSession: { open: true, title: 'YouTube' },
    sessionContext: { activeSurface: 'browser' },
    brainPreflightPlan: { domain: 'browser-action', suggestedSurface: 'browser', urgency: 'high' }
  }, 'en');

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'web_find_click');
  assert.deepEqual(result.actions[0].args, ['third video']);
  assert.equal(result.brainRoute.route, 'action-recovery-provider-failure');
  assert.equal(result.brainRoute.providerRequired, false);
  assert.match(result.text, /Executing the safe local action/i);

  console.log('AI provider-failure action recovery integration OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
