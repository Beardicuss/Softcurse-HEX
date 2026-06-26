'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'brain-action-recovery.js'), 'utf8');
const sandbox = {
  window: {
    hexReferenceResolver: {
      isDesktopReferenceCommand(text) { return /second app|that game|third file/i.test(text || ''); },
      resolveMixedReference(text) {
        if (/second app/i.test(text || '')) return { kind: 'app', label: 'Visual Studio Code', source: 'desktop-memory', surface: 'desktop' };
        if (/that game/i.test(text || '')) return { kind: 'game', label: 'Cyberpunk 2077', source: 'desktop-memory', surface: 'desktop' };
        if (/third file/i.test(text || '')) return { kind: 'file', label: 'notes.txt', path: 'C:/Users/DanTe/notes.txt', source: 'desktop-memory', surface: 'desktop' };
        return null;
      },
      resolveDesktopReference() { return null; }
    },
    hexBrainActionPlanner: {
      classify(text, state) {
        const browserOpen = !!state?.browserSession?.open;
        if (browserOpen && /third video|click|play|open/i.test(text)) {
          return { domain: 'browser-action', suggestedSurface: 'browser', urgency: 'high', providerNeeded: false };
        }
        if (/open|launch|run|search|play|watch/i.test(text)) {
          return { domain: 'desktop-action', suggestedSurface: 'desktop', urgency: 'high', providerNeeded: false };
        }
        return { domain: 'dialogue', suggestedSurface: 'chat', urgency: 'normal', providerNeeded: false };
      }
    }
  }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'brain-action-recovery.js' });

const siteSearch = sandbox.window.hexBrainActionRecovery.actionsForProviderFailure({
  userMsg: 'open youtube and search for eminem',
  lang: 'en',
  systemState: {}
});
assert.equal(siteSearch.reason, 'provider-failure-action-recovery');
assert.equal(siteSearch.actions[0].meta.recoveredFromProviderFailure, true);
assert.equal(siteSearch.actions[0].meta.source, 'brain-action-recovery');
assert.equal(siteSearch.actions[0].type, 'web_search');
assert.deepEqual([...siteSearch.actions[0].args], ['https://youtube.com', 'eminem']);
assert.match(siteSearch.text, /Executing the safe local action/i);

const directSiteSearch = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'open youtube and search for eminem',
  lang: 'en',
  systemState: {}
});
assert.equal(directSiteSearch.reason, 'direct-browser-action');
assert.equal(directSiteSearch.actions[0].type, 'web_search');
assert.equal(directSiteSearch.actions[0].meta.recoveredFromProviderFailure, false);
assert.equal(directSiteSearch.actions[0].meta.reason, 'direct-browser-action');
assert.deepEqual([...directSiteSearch.actions[0].args], ['https://youtube.com', 'eminem']);
assert.match(directSiteSearch.text, /Opening the browser and searching for eminem/i);
const directPlay = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'play lose yourself on youtube',
  lang: 'en',
  systemState: {}
});
assert.equal(directPlay.actions[0].type, 'web_search');
assert.deepEqual([...directPlay.actions[0].args], ['https://youtube.com', 'lose yourself']);

const directGoogle = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'search weather tbilisi on google',
  lang: 'en',
  systemState: {}
});
assert.equal(directGoogle.actions[0].type, 'web_search');
assert.deepEqual([...directGoogle.actions[0].args], ['https://google.com', 'weather tbilisi']);

const directBack = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'go back',
  lang: 'en',
  systemState: { browserSession: { open: true } }
});
assert.equal(directBack.actions[0].type, 'web_back');
assert.match(directBack.text, /Going back/i);

const noBackWithoutBrowser = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'go back',
  lang: 'en',
  systemState: {}
});
assert.equal(noBackWithoutBrowser, null);
const browserFollowUp = sandbox.window.hexBrainActionRecovery.actionsForProviderFailure({
  userMsg: 'open third video',
  lang: 'en',
  systemState: { browserSession: { open: true, title: 'YouTube' } }
});
assert.equal(browserFollowUp.actions[0].type, 'web_find_click');
assert.equal(browserFollowUp.actions[0].meta.surface, 'browser');
assert.deepEqual([...browserFollowUp.actions[0].args], ['third video']);


const priorityThatOne = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'that one',
  lang: 'en',
  systemState: {
    cloudContext: {
      desktopPriorityView: {
        schema: 'hex.desktop-priority-view.v1',
        active: [{ kind: 'browser', purpose: 'browser', label: 'Eminem - Lose Yourself', contextFresh: true }],
        background: []
      }
    }
  }
});
assert.equal(priorityThatOne.actions[0].type, 'web_find_click');
assert.deepEqual([...priorityThatOne.actions[0].args], ['Eminem - Lose Yourself']);
assert.equal(priorityThatOne.actions[0].meta.resolvedSource, 'cloud-priority-view');

const priorityContinue = sandbox.window.hexBrainActionRecovery.actionsForObviousBrowserCommand({
  userMsg: 'continue',
  lang: 'en',
  systemState: {
    cloudContext: {
      desktopPriorityView: {
        schema: 'hex.desktop-priority-view.v1',
        active: [{ kind: 'browser', purpose: 'browser', label: 'Eminem - Lose Yourself', contextFresh: true }],
        background: []
      }
    }
  }
});
assert.equal(priorityContinue.actions[0].type, 'web_read');
const folderOpen = sandbox.window.hexBrainActionRecovery.actionsForProviderFailure({
  userMsg: 'open downloads folder',
  lang: 'en',
  systemState: {}
});
assert.equal(folderOpen.actions[0].type, 'open_folder');
assert.deepEqual([...folderOpen.actions[0].args], ['downloads']);


const priorityDesktopApp = sandbox.window.hexBrainActionRecovery.actionsForObviousLocalCommand({
  userMsg: 'open that one',
  lang: 'en',
  systemState: {
    cloudContext: {
      desktopPriorityView: {
        schema: 'hex.desktop-priority-view.v1',
        active: [{ kind: 'app', purpose: 'inventory', label: 'Visual Studio Code', contextFresh: true }],
        background: []
      }
    }
  }
});
assert.equal(priorityDesktopApp.actions[0].type, 'open_app');
assert.deepEqual([...priorityDesktopApp.actions[0].args], ['Visual Studio Code']);
assert.equal(priorityDesktopApp.actions[0].meta.resolvedSource, 'cloud-priority-view');

const priorityDesktopFile = sandbox.window.hexBrainActionRecovery.actionsForObviousLocalCommand({
  userMsg: 'open same file',
  lang: 'en',
  systemState: {
    cloudContext: {
      desktopPriorityView: {
        schema: 'hex.desktop-priority-view.v1',
        active: [{ kind: 'file', purpose: 'inventory', label: 'notes.txt', path: 'C:/Users/DanTe/notes.txt', contextFresh: true }],
        background: []
      }
    }
  }
});
assert.equal(priorityDesktopFile.actions[0].type, 'open_file');
assert.deepEqual([...priorityDesktopFile.actions[0].args], ['C:/Users/DanTe/notes.txt']);
const unsafe = sandbox.window.hexBrainActionRecovery.actionsForProviderFailure({
  userMsg: 'delete downloads folder',
  lang: 'en',
  systemState: {}
});
assert.equal(unsafe, null, 'destructive commands must not auto-recover');

console.log('Brain action provider-failure recovery contract OK:', {
  siteSearch: siteSearch.actions[0].type,
  browserFollowUp: browserFollowUp.actions[0].type,
  unsafeBlocked: unsafe === null
});





