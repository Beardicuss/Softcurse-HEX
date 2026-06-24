'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

let recordedActivity = null;
let detachedLabel = null;
let persisted = false;

global.window = {
  hexSessionContext: { activeSurface: 'browser' },
  hexCloudSync: {
    runDetached(label, task) {
      detachedLabel = label;
      return task();
    },
    recordActivity(activity) {
      recordedActivity = activity;
      return Promise.resolve({ success: true });
    }
  },
  hexContextState: {
    state: {},
    persist() {
      persisted = true;
    }
  }
};

require(path.join(__dirname, '..', 'src', 'js', 'action-outcome-recorder.js'));

assert.ok(window.hexActionOutcomeRecorder, 'recorder should be exposed on window');

const outcome = window.hexActionOutcomeRecorder.record(
  { type: 'web_find_click', args: ['third video'], meta: { source: 'brain-action-recovery', recoveredFromProviderFailure: true, reason: 'provider-failure-action-recovery', domain: 'browser-action' } },
  { success: true, action: 'web_find_click', data: 'Clicked Metallica video', durationMs: 123 },
  { source: 'brain-action-recovery',
    recovery: true,
    recoveryReason: 'provider-failure-action-recovery',
    recoveryDomain: 'browser-action' }
);

assert.equal(outcome.success, true);
assert.match(outcome.summary, /Completed web_find_click/);
assert.match(outcome.summary, /third video/);
assert.match(outcome.summary, /Clicked Metallica video/);
assert.equal(detachedLabel, 'record action outcome');
assert.deepEqual(recordedActivity, {
  kind: 'action-result',
  status: 'success',
  actionType: 'web_find_click',
  surface: 'browser',
  summary: outcome.summary,
  details: {
    durationMs: 123,
    args: ['third video'],
    resultPreview: 'Clicked Metallica video',
    source: 'brain-action-recovery',
    recovery: true,
    recoveryReason: 'provider-failure-action-recovery',
    recoveryDomain: 'browser-action'
  }
});
assert.equal(window.hexContextState.state.lastActionSummary, outcome.summary);
assert.equal(window.hexContextState.state.lastRecoveredAction.type, 'web_find_click');
assert.equal(window.hexContextState.state.lastRecoveredAction.reason, 'provider-failure-action-recovery');
assert.equal(typeof window.hexContextState.state.lastTouchedAt, 'number');
assert.equal(persisted, true);

const failed = window.hexActionOutcomeRecorder.record(
  { type: 'open_file', args: ['missing.docx'] },
  { success: false, data: 'File not found' },
  { surface: 'desktop' }
);

assert.equal(failed.success, false);
assert.match(failed.summary, /Failed open_file/);
assert.match(failed.summary, /File not found/);
assert.equal(recordedActivity.status, 'failure');
assert.equal(recordedActivity.surface, 'desktop');

console.log('Action outcome recorder contract OK');