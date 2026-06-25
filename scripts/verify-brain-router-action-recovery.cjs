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
  const directForward = await window.hexBrainRouter.route({
    userMsg: 'go forward',
    lang: 'en',
    systemState: { browserSession: { open: true, title: 'YouTube' } }
  });

  assert.equal(directForward.mode, 'direct-browser-action');
  assert.equal(directForward.actions[0].type, 'web_forward');
  assert.equal(directForward.hints.providerRequired, false);

  const directCloseBrowser = await window.hexBrainRouter.route({
    userMsg: 'close browser',
    lang: 'en',
    systemState: { browserSession: { open: true, title: 'YouTube' } }
  });

  assert.equal(directCloseBrowser.mode, 'direct-browser-action');
  assert.equal(directCloseBrowser.actions[0].type, 'web_close');
  assert.equal(directCloseBrowser.hints.providerRequired, false);

  const directSettings = await window.hexBrainRouter.route({
    userMsg: 'open settings',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directSettings.mode, 'direct-local-action');
  assert.equal(directSettings.actions[0].type, 'open_settings');
  assert.equal(directSettings.hints.providerRequired, false);

  const directHideInterface = await window.hexBrainRouter.route({
    userMsg: 'hide interface',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directHideInterface.mode, 'direct-local-action');
  assert.equal(directHideInterface.actions[0].type, 'close_voice_surface');
  assert.equal(directHideInterface.hints.providerRequired, false);
  const directVolume = await window.hexBrainRouter.route({
    userMsg: 'set volume to 25',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directVolume.mode, 'direct-local-action');
  assert.equal(directVolume.actions[0].type, 'set_volume');
  assert.deepEqual(directVolume.actions[0].args, ['25']);
  assert.equal(directVolume.hints.providerRequired, false);

  const directClipboard = await window.hexBrainRouter.route({
    userMsg: 'read clipboard',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directClipboard.mode, 'direct-local-action');
  assert.equal(directClipboard.actions[0].type, 'get_clipboard');
  assert.equal(directClipboard.hints.providerRequired, false);
  const directProcesses = await window.hexBrainRouter.route({
    userMsg: 'show running processes',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directProcesses.mode, 'direct-local-action');
  assert.equal(directProcesses.actions[0].type, 'list_processes');
  assert.equal(directProcesses.hints.providerRequired, false);
  assert.match(directProcesses.text, /running processes/i);

  const directGames = await window.hexBrainRouter.route({
    userMsg: 'list my games',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directGames.mode, 'direct-local-action');
  assert.equal(directGames.actions[0].type, 'list_games');
  assert.equal(directGames.hints.providerRequired, false);
  assert.match(directGames.text, /installed games/i);

  const harmless = await window.hexBrainRouter.route({
    userMsg: 'what page is open',
    lang: 'en',
    systemState
  });

  assert.equal(harmless.mode, 'browser-answer');
  assert.equal(harmless.reason, 'server-browser-state-fresh');

  const lastTurnPacket = {
    schema: 'hex.context-packet.v2',
    continuityState: {
      schema: 'hex.continuity-state.v1',
      activeSurface: 'chat',
      hasDesktopInventory: true,
      freshness: { sessionSeconds: 40, lastTurnSeconds: 8, inventorySeconds: 100, lastActionSeconds: 60 }
    },
    relevantTurns: [
      { role: 'user', content: 'open youtube and search eminem' },
      { role: 'assistant', content: 'Opening the browser and searching for eminem.' }
    ]
  };

  const lastTurn = await window.hexBrainRouter.route({
    userMsg: 'what was my last message?',
    lang: 'en',
    systemState: { cloudContext: lastTurnPacket }
  });

  assert.equal(lastTurn.mode, 'last-turn-answer');
  assert.equal(lastTurn.reason, 'server-last-turn-fresh');
  assert.equal(lastTurn.hints.providerRequired, false);
  assert.match(lastTurn.text, /open youtube and search eminem/i);
  const stalePacket = {
    schema: 'hex.context-packet.v2',
    continuityState: {
      schema: 'hex.continuity-state.v1',
      activeSurface: 'browser',
      browser: { open: true, title: 'Old YouTube', url: 'https://youtube.com' },
      hasDesktopInventory: true,
      freshness: { sessionSeconds: 7200, lastTurnSeconds: 7200, inventorySeconds: 90000, lastActionSeconds: 7200 }
    },
    browser: { open: true, title: 'Old YouTube', url: 'https://youtube.com' },
    relevantMemories: [{ kind: 'preference', content: 'User prefers YouTube follow-ups.' }]
  };

  const staleBrowser = await window.hexBrainRouter.route({
    userMsg: 'what page is open',
    lang: 'en',
    systemState: { cloudContext: stalePacket }
  });

  assert.equal(staleBrowser.mode, 'provider');
  assert.equal(staleBrowser.reason, 'stale-server-packet-background');
  assert.equal(staleBrowser.hints.serverPacketFreshness.stale, true);
  assert.equal(staleBrowser.hints.recommendedNext, 'reason-with-server-background-memory');

  const staleLastTurn = await window.hexBrainRouter.route({
    userMsg: 'what was my last message?',
    lang: 'en',
    systemState: { cloudContext: stalePacket }
  });

  assert.equal(staleLastTurn.mode, 'provider');
  assert.equal(staleLastTurn.reason, 'stale-server-packet-background');
  const staleMemory = await window.hexBrainRouter.route({
    userMsg: 'what do you remember about me?',
    lang: 'en',
    systemState: { cloudContext: stalePacket }
  });

  assert.equal(staleMemory.mode, 'memory-answer');
  assert.equal(staleMemory.reason, 'server-memory');

  console.log('Brain router action recovery contract OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});




