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
const ariseMatch = voice._matchWakePhrase('Arise open settings');
assert.equal(ariseMatch.phrase, 'arise');
assert.equal(ariseMatch.command, 'open settings');
const wakeMatch = voice._matchWakePhrase('wake up what time is it');
assert.equal(wakeMatch.phrase, 'wake up');
assert.equal(wakeMatch.command, 'what time is it');
const punctuatedWakeOnly = voice._matchWakePhrase('Wake up.');
assert.equal(punctuatedWakeOnly.phrase, 'wake up');
assert.equal(punctuatedWakeOnly.command, '');
assert.equal(voice._extractWakeCommand('Wake up.'), null, 'punctuated wake phrase must not dispatch "up" as a command');
const directWakeTime = voice._extractWakeCommand('Wake up what time is it');
assert.equal(directWakeTime.phrase, 'wake up');
assert.equal(directWakeTime.command, 'what time is it');

const routed = [];
let wokePhrase = null;
let awakeStarted = 0;
let rested = false;
voice.onWakeWord = (phrase) => { wokePhrase = phrase; };
voice.onAwakeStart = () => { awakeStarted += 1; };
voice.onRest = () => { rested = true; };
voice.onTranscript = (text, isFinal) => routed.push({ text, isFinal, source: 'fallback' });
context.window.dispatchVoiceCommand = (text, source) => routed.push({ text, isFinal: true, source });
voice._routeTranscript('Wake up.');
assert.equal(wokePhrase, 'wake up');
assert.equal(routed.length, 0, 'wake-only phrase must not dispatch a partial command');
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
assert.ok(awakeStarted >= 3, 'wake commands should hold awake state');
voice._routeTranscript('what day is it');
assert.equal(routed[3].text, 'what day is it');
assert.equal(routed[3].source, 'awake-follow-up');
voice._routeTranscript('take a break');
assert.equal(rested, true, 'rest command should close awake state');
assert.equal(voice._awakeUntil, 0);
let timedOut = false;
voice.onWakeTimeout = () => { timedOut = true; };
voice._armWakeCommandWindow('cardinal');
assert.ok(voice._wakeArmedUntil > 0);
voice._clearWakeCommandWindow();
assert.equal(voice._wakeArmedUntil, 0);
assert.equal(timedOut, false);

console.log('Voice wake routing contract OK');
