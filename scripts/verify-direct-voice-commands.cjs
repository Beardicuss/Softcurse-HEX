'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'commands.js'), 'utf8');
const state = { messages: [], spoken: [], actions: [], settingsOpened: 0, settingsClosed: 0, chatOpened: 0, voiceClosed: 0 };

const context = {
  console,
  setTimeout,
  clearTimeout,
  window: {
    _hexConfig: { userName: 'Dante' },
    hexVoice: { speak: (msg) => state.spoken.push(msg) },
    openSettingsSurface: () => { state.settingsOpened += 1; },
    closeSettingsSurface: () => { state.settingsClosed += 1; },
    openChatSurface: () => { state.chatOpened += 1; },
    closeVoiceSurface: () => { state.voiceClosed += 1; },
    hexContextState: { getBrowserSessionState: () => ({ open: false }) },
    hexReferenceResolver: {},
  },
  addHexMessage: (msg) => state.messages.push(msg),
  addLog: () => {},
  handleAIAction: async (action) => { state.actions.push(action); },
  updateSessionContextForAssistant: () => {},
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'commands.js' });

const run = async () => {
  assert.equal(typeof context.tryDirectCommand, 'function', 'tryDirectCommand must be global');

  let result = await context.tryDirectCommand('Open Settings.');
  assert.equal(result.handled, true, 'open settings with STT punctuation should be handled');
  assert.equal(state.settingsOpened, 1, 'settings surface should open');

  result = await context.tryDirectCommand('what time is it?');
  assert.equal(result.handled, true, 'time question should be local');
  assert.match(state.messages.at(-1), /^It is /, 'time response should be spoken locally');

  result = await context.tryDirectCommand('Cardinal?');
  assert.equal(result.handled, false, 'bare wake word remains wake-only, not a direct command');

  result = await context.tryDirectCommand('who am I?');
  assert.equal(result.handled, true, 'identity question should be local');
  assert.equal(state.messages.at(-1), 'You are Dante.');

  result = await context.tryDirectCommand('who are you?');
  assert.equal(result.handled, true, 'assistant identity question should be local');
  assert.match(state.messages.at(-1), /H\.E\.X\./);

  result = await context.tryDirectCommand('close settings.');
  assert.equal(result.handled, true, 'close settings should stay local');
  assert.equal(state.settingsClosed, 1, 'settings surface should close');

  result = await context.tryDirectCommand('Open YouTube.');
  assert.equal(result.handled, true, 'open youtube with punctuation should be handled');
  assert.equal(state.actions.at(-1).type, 'open_url');
  assert.equal(state.actions.at(-1).args[0], 'https://youtube.com');

  context.window.hexContextState.getBrowserSessionState = () => null;
  context.window.hexReferenceResolver.isDesktopReferenceCommand = () => true;
  context.window.hexReferenceResolver.resolveMixedReference = () => null;
  context.window.hexReferenceResolver.resolveDesktopReference = () => null;
  result = await context.tryDirectCommand('open third file');
  assert.equal(typeof result.handled, 'boolean', 'null browser session should not crash reference routing');
  result = await context.tryDirectCommand('Turn of voice mode.');
  assert.equal(result.handled, true, 'common STT turn-off typo should be handled');
  assert.equal(state.voiceClosed, 1, 'voice surface should close');

  console.log('Direct voice command contract OK');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
