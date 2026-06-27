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

  const directPlaylist = await window.hexBrainRouter.route({
    userMsg: 'play playlist insight',
    lang: 'en',
    systemState: {}
  });

  assert.equal(directPlaylist.mode, 'direct-local-action');
  assert.equal(directPlaylist.actions[0].type, 'open_playlist');
  assert.deepEqual(directPlaylist.actions[0].args, ['insight']);
  assert.equal(directPlaylist.hints.providerRequired, false);


  const priorityBrowserFollowUp = await window.hexBrainRouter.route({
    userMsg: 'that one',
    lang: 'en',
    systemState: {
      cloudContext: {
        schema: 'hex.context-packet.v2',
        desktopPriorityView: {
          schema: 'hex.desktop-priority-view.v1',
          active: [{ kind: 'browser', purpose: 'browser', label: 'Eminem - Lose Yourself', contextFresh: true }],
          background: []
        }
      }
    }
  });

  assert.equal(priorityBrowserFollowUp.mode, 'direct-browser-action');
  assert.equal(priorityBrowserFollowUp.actions[0].type, 'web_find_click');
  assert.deepEqual(priorityBrowserFollowUp.actions[0].args, ['Eminem - Lose Yourself']);
  assert.equal(priorityBrowserFollowUp.hints.providerRequired, false);

  const priorityDesktopFollowUp = await window.hexBrainRouter.route({
    userMsg: 'open that one',
    lang: 'en',
    systemState: {
      cloudContext: {
        schema: 'hex.context-packet.v2',
        desktopPriorityView: {
          schema: 'hex.desktop-priority-view.v1',
          active: [{ kind: 'file', purpose: 'inventory', label: 'notes.txt', path: 'C:/Users/DanTe/notes.txt', contextFresh: true }],
          background: []
        }
      }
    }
  });

  assert.equal(priorityDesktopFollowUp.mode, 'direct-local-action');
  assert.equal(priorityDesktopFollowUp.actions[0].type, 'open_file');
  assert.deepEqual(priorityDesktopFollowUp.actions[0].args, ['C:/Users/DanTe/notes.txt']);
  assert.equal(priorityDesktopFollowUp.hints.providerRequired, false);
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

  const guidanceBackgroundBrowserPacket = {
    schema: 'hex.context-packet.v2',
    continuityState: {
      schema: 'hex.continuity-state.v1',
      activeSurface: 'browser',
      browser: { open: true, title: 'Fresh but background YouTube', url: 'https://youtube.com' },
      hasDesktopInventory: true,
      freshness: { sessionSeconds: 20, lastTurnSeconds: 8, inventorySeconds: 100, lastActionSeconds: 12 }
    },
    retrieval: {
      schema: 'hex.retrieval-summary.v1',
      routingGuidance: {
        schema: 'hex.routing-guidance.v1',
        activeSurfaces: ['session', 'inventory'],
        backgroundOnlySurfaces: ['browser'],
        missingSurfaces: [],
        clarificationTriggers: ['stale-browser-reference'],
        recoveryPolicy: 'prefer-live-local-context-before-provider-or-clarification',
        browserFollowUpPolicy: 'require-fresh-live-browser-target-before-clicking'
      }
    },
    browser: { open: true, title: 'Fresh but background YouTube', url: 'https://youtube.com' }
  };

  const guidanceBackgroundBrowser = await window.hexBrainRouter.route({
    userMsg: 'what page is open',
    lang: 'en',
    systemState: { cloudContext: guidanceBackgroundBrowserPacket }
  });

  assert.equal(guidanceBackgroundBrowser.mode, 'provider');
  assert.equal(guidanceBackgroundBrowser.reason, 'routing-guidance-background');
  assert.equal(guidanceBackgroundBrowser.hints.recommendedNext, 'follow-routing-guidance-prefer-live-local');
  assert.equal(guidanceBackgroundBrowser.hints.server.routingGuidance.backgroundOnlySurfaces[0], 'browser');

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


  const degradedFailurePacket = {
    schema: 'hex.context-packet.v2',
    contextPacketHealth: {
      schema: 'hex.context-packet-health.v1',
      level: 'degraded',
      ready: false,
      issues: ['server-timeout'],
      references: { active: 0, background: 1, total: 1 }
    },
    continuityState: {
      schema: 'hex.continuity-state.v1',
      activeSurface: 'browser',
      browser: { open: true, title: 'Old YouTube', url: 'https://youtube.com' },
      freshness: { sessionSeconds: 12, lastTurnSeconds: 8, lastActionSeconds: 5 }
    },
    browser: { open: true, title: 'Old YouTube', url: 'https://youtube.com' },
    actionTimeline: [
      { kind: 'action-result', status: 'failure', actionType: 'web_find_click', surface: 'browser', text: 'Old failure', at: '2026-06-24T12:00:00.000Z' }
    ]
  };

  const degradedDirectBrowser = await window.hexBrainRouter.route({
    userMsg: 'open third video',
    lang: 'en',
    systemState: {
      browserSession: { open: true, title: 'Live YouTube' },
      cloudContext: degradedFailurePacket
    }
  });

  assert.equal(degradedDirectBrowser.mode, 'direct-browser-action');
  assert.equal(degradedDirectBrowser.reason, 'direct-browser-action');
  assert.equal(degradedDirectBrowser.actions[0].type, 'web_find_click');
  assert.deepEqual(degradedDirectBrowser.actions[0].args, ['third video']);
  assert.equal(degradedDirectBrowser.hints.serverPacketHealth.level, 'degraded');
  assert.ok(degradedDirectBrowser.hints.confidence < 0.92);

  const stalePriorityOnly = await window.hexBrainRouter.route({
    userMsg: 'that one',
    lang: 'en',
    systemState: {
      cloudContext: {
        schema: 'hex.context-packet.v2',
        contextPacketHealth: {
          schema: 'hex.context-packet-health.v1',
          level: 'stale',
          ready: false,
          issues: ['all-context-stale']
        },
        desktopPriorityView: {
          schema: 'hex.desktop-priority-view.v1',
          active: [{ kind: 'browser', purpose: 'browser', label: 'Old stale video', contextFresh: false }],
          background: []
        }
      }
    }
  });

  assert.equal(stalePriorityOnly.mode, 'context-gap-local');
  assert.equal(stalePriorityOnly.reason, 'no-active-browser-session');
  assert.match(stalePriorityOnly.text, /active browser session/i);

  const missingLiveTarget = await window.hexBrainRouter.route({
    userMsg: 'same one',
    lang: 'en',
    systemState: {
      browserSession: { open: true, title: 'YouTube' },
      localLiveContext: {
        browser: { open: true, title: 'YouTube', candidateCount: 0, candidatesFresh: false },
        candidates: {},
        referenceCandidateCount: 0
      }
    }
  });

  assert.equal(missingLiveTarget.mode, 'context-gap-local');
  assert.equal(missingLiveTarget.reason, 'no-fresh-browser-target');
  assert.equal(missingLiveTarget.hints.providerRequired, false);
  assert.equal(missingLiveTarget.hints.local.liveContext.browser.candidateCount, 0);
  assert.match(missingLiveTarget.text, /fresh target/i);

  const freshLiveTargetRoute = await window.hexBrainRouter.route({
    userMsg: 'same one',
    lang: 'en',
    systemState: {
      browserSession: { open: true, title: 'Live YouTube' },
      localLiveContext: {
        browser: { open: true, title: 'Live YouTube', candidateCount: 2, candidatesFresh: true },
        lastResolvedReference: { label: 'Fresh live video', surface: 'browser', source: 'local-live-browser' }
      }
    }
  });

  assert.equal(freshLiveTargetRoute.mode, 'direct-browser-action');
  assert.equal(freshLiveTargetRoute.reason, 'direct-browser-action');
  assert.equal(freshLiveTargetRoute.actions[0].type, 'web_find_click');
  assert.deepEqual(freshLiveTargetRoute.actions[0].args, ['Fresh live video']);
  assert.equal(freshLiveTargetRoute.hints.providerRequired, false);

  const bestTargetOnlyRoute = await window.hexBrainRouter.route({
    userMsg: 'open that one',
    lang: 'en',
    systemState: {
      browserSession: { open: true, title: 'Live YouTube' },
      localLiveContext: {
        browser: { open: true, title: 'Live YouTube', candidateCount: 2, candidatesFresh: true },
        bestTarget: { label: 'Best fresh browser video', kind: 'video', surface: 'browser', source: 'browser-candidates', fresh: true, index: 1 }
      }
    }
  });

  assert.equal(bestTargetOnlyRoute.mode, 'direct-browser-action');
  assert.equal(bestTargetOnlyRoute.reason, 'direct-browser-action');
  assert.equal(bestTargetOnlyRoute.actions[0].type, 'web_find_click');
  assert.deepEqual(bestTargetOnlyRoute.actions[0].args, ['Best fresh browser video']);
  assert.equal(bestTargetOnlyRoute.actions[0].meta.resolvedSource, 'browser-candidates');
  assert.equal(bestTargetOnlyRoute.hints.providerRequired, false);

  const desktopBestTargetRoute = await window.hexBrainRouter.route({
    userMsg: 'open it',
    lang: 'en',
    systemState: {
      localLiveContext: {
        desktopBestTarget: { label: 'Visual Studio Code', kind: 'app', surface: 'desktop', source: 'app-candidates', fresh: true, index: 1 }
      }
    }
  });

  assert.equal(desktopBestTargetRoute.mode, 'direct-local-action');
  assert.equal(desktopBestTargetRoute.reason, 'direct-local-action');
  assert.equal(desktopBestTargetRoute.actions[0].type, 'open_app');
  assert.deepEqual(desktopBestTargetRoute.actions[0].args, ['Visual Studio Code']);
  assert.equal(desktopBestTargetRoute.actions[0].meta.resolvedSource, 'app-candidates');
  assert.equal(desktopBestTargetRoute.hints.providerRequired, false);

  const windowBestTargetRoute = await window.hexBrainRouter.route({
    userMsg: 'focus that one',
    lang: 'en',
    systemState: {
      localLiveContext: {
        desktopBestTarget: { label: 'Untitled - Notepad', kind: 'window', surface: 'desktop', source: 'window-candidates', fresh: true, index: 1 }
      }
    }
  });

  assert.equal(windowBestTargetRoute.mode, 'direct-local-action');
  assert.equal(windowBestTargetRoute.actions[0].type, 'window');
  assert.deepEqual(windowBestTargetRoute.actions[0].args, ['focus', 'Untitled - Notepad']);
  assert.equal(windowBestTargetRoute.actions[0].meta.resolvedSource, 'window-candidates');
  assert.equal(windowBestTargetRoute.hints.providerRequired, false);

  const degradedProviderRoute = await window.hexBrainRouter.route({
    userMsg: 'explain what we were doing',
    lang: 'en',
    systemState: { cloudContext: degradedFailurePacket }
  });

  assert.equal(degradedProviderRoute.mode, 'provider');
  assert.equal(degradedProviderRoute.reason, 'stale-server-packet-background');
  assert.equal(degradedProviderRoute.hints.recommendedNext, 'prefer-local-or-live-browser-context');

  const nullPriorityRoute = await window.hexBrainRouter.route({
    userMsg: 'open settings',
    lang: 'en',
    systemState: {
      cloudContext: {
        schema: 'hex.context-packet.v2',
        desktopPriorityView: null,
        contextPacketHealth: { level: 'degraded', ready: false, issues: ['priority-null'] },
        retrieval: { contextUse: null }
      }
    }
  });

  assert.equal(nullPriorityRoute.mode, 'direct-local-action');
  assert.equal(nullPriorityRoute.actions[0].type, 'open_settings');
  assert.equal(nullPriorityRoute.hints.server.priorityView, null);
  assert.equal(nullPriorityRoute.hints.providerRequired, false);
  console.log('Brain router action recovery contract OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
