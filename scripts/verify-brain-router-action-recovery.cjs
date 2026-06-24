'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

global.document = { documentElement: { lang: 'en' } };
global.window = {
  _hexConfig: { language: 'en' },
  hexMemory: null,
  hexBrainCore: {
    survivalReply: () => 'local fallback',
    memoryRecall: () => ''
  }
};

require(path.join(__dirname, '..', 'src', 'js', 'candidate-store.js'));
require(path.join(__dirname, '..', 'src', 'js', 'reference-resolver.js'));
require(path.join(__dirname, '..', 'src', 'js', 'brain-action-planner.js'));
require(path.join(__dirname, '..', 'src', 'js', 'brain-action-recovery.js'));
require(path.join(__dirname, '..', 'src', 'js', 'brain-response-composer.js'));
require(path.join(__dirname, '..', 'src', 'js', 'brain-router.js'));

(async () => {
  const systemState = {
    browserSession: { open: true, title: 'Metallica - YouTube', url: 'https://youtube.com/results?search_query=metallica' },
    sessionContext: { activeSurface: 'browser' },
    cloudContext: {
      schema: 'hex.context-packet.v2',
      browser: { open: true, title: 'Metallica - YouTube', url: 'https://youtube.com/results?search_query=metallica' },
      actionTimeline: [
        {
          kind: 'action-result',
          status: 'failure',
          actionType: 'web_find_click',
          surface: 'browser',
          text: 'Failed web_find_click (third video) - element not found',
          at: '2026-06-24T12:00:00.000Z'
        }
      ]
    }
  };

  const routed = await window.hexBrainRouter.route({
    userMsg: 'open third video',
    lang: 'en',
    systemState
  });

  assert.equal(routed.mode, 'action-recovery-local');
  assert.equal(routed.reason, 'recent-action-failure');
  assert.equal(routed.hints.providerRequired, false);
  assert.equal(routed.hints.actionPlan.domain, 'browser-action');
  assert.match(routed.text, /web_find_click/);
  assert.match(routed.text, /not blindly repeat/i);

  const directBrowser = await window.hexBrainRouter.route({
    userMsg: 'open youtube and search for eminem',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directBrowser.mode, 'direct-browser-action');
  assert.equal(directBrowser.reason, 'direct-browser-action');
  assert.equal(directBrowser.hints.providerRequired, false);
  assert.equal(directBrowser.actions[0].type, 'web_search');
  assert.deepEqual(directBrowser.actions[0].args, ['https://youtube.com', 'eminem']);
  assert.match(directBrowser.text, /Opening the browser and searching for eminem/i);

  const directBack = await window.hexBrainRouter.route({
    userMsg: 'go back',
    lang: 'en',
    systemState: { browserSession: { open: true, title: 'YouTube' } }
  });

  assert.equal(directBack.mode, 'direct-browser-action');
  assert.equal(directBack.actions[0].type, 'web_back');
  assert.equal(directBack.hints.providerRequired, false);
  const harmless = await window.hexBrainRouter.route({
    userMsg: 'what page is open',
    lang: 'en',
    systemState
  });

  assert.equal(harmless.mode, 'browser-answer');
  assert.equal(harmless.reason, 'server-browser-state');

  console.log('Brain router action recovery contract OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});




