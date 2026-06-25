'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'voice.js'), 'utf8');
const context = {
  console,
  setTimeout,
  clearTimeout,
  window: {
    speechSynthesis: null,
    hexAPI: { voice: { status: async () => ({ available: false }) } },
    addLog: () => {}
  }
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context);

const voice = context.window.hexVoice;
voice.wakeWord = 'cardinal open settings';

const settingsMatch = voice._matchWakePhrase('Cardinal Open Settings');
assert.equal(settingsMatch.phrase, 'cardinal');
assert.equal(settingsMatch.command, 'open settings');
const youtubeMatch = voice._matchWakePhrase('HEX, open youtube and search eminem');
assert.equal(youtubeMatch.phrase, 'hex');
assert.equal(youtubeMatch.command, 'open youtube and search eminem');

const routed = [];
let wokePhrase = null;
voice.onWakeWord = (phrase) => { wokePhrase = phrase; };
voice.onTranscript = (text, isFinal) => routed.push({ text, isFinal, source: 'fallback' });
context.window.dispatchVoiceCommand = (text, source) => routed.push({ text, isFinal: true, source });
voice._routeTranscript('Cardinal Open Settings.');
assert.equal(wokePhrase, 'cardinal');
assert.equal(routed.length, 1);
assert.equal(routed[0].text, 'open settings.');
assert.equal(routed[0].source, 'wake-command');
voice._routeTranscript('Cardinal, what time is it?');
assert.equal(routed[1].text, 'what time is it?');
voice._routeTranscript('Cardinal Open YouTube');
assert.equal(routed[2].text, 'open youtube');
assert.equal(routed[2].source, 'wake-command');
let timedOut = false;
voice.onWakeTimeout = () => { timedOut = true; };
voice._armWakeCommandWindow('cardinal');
assert.ok(voice._wakeArmedUntil > 0);
voice._clearWakeCommandWindow();
assert.equal(voice._wakeArmedUntil, 0);
assert.equal(timedOut, false);

console.log('Voice wake routing contract OK');
