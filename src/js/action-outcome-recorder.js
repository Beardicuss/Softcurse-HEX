'use strict';

window.hexActionOutcomeRecorder = (() => {
  function summarizeAction(action = {}, result = {}) {
    const type = String(action?.type || result?.action || 'action');
    const args = Array.isArray(action?.args) ? action.args.filter(Boolean).join(' ') : '';
    const success = result?.success !== false;
    const detail = typeof result?.data === 'string'
      ? result.data.slice(0, 180)
      : (result?.data?.message || result?.data?.error || '');
    return [success ? 'Completed' : 'Failed', type, args ? '(' + args.slice(0, 120) + ')' : '', detail ? '- ' + detail : '']
      .filter(Boolean)
      .join(' ')
      .slice(0, 500);
  }

  function record(action = {}, result = {}, options = {}) {
    const success = result?.success !== false;
    const actionType = String(action?.type || result?.action || 'action');
    const summary = summarizeAction(action, result);
    const surface = options.surface || window.hexSessionContext?.activeSurface || 'chat';
    const details = {
      durationMs: Number(result?.durationMs || 0) || null,
      args: Array.isArray(action?.args) ? action.args.slice(0, 6) : [],
      resultPreview: typeof result?.data === 'string' ? result.data.slice(0, 500) : null,
      source: action?.meta?.source || options.source || 'renderer-action',
      recovery: action?.meta?.recoveredFromProviderFailure === true,
      recoveryReason: action?.meta?.reason || null,
      recoveryDomain: action?.meta?.domain || null
    };

    window.hexCloudSync?.runDetached?.('record action outcome', () => window.hexCloudSync.recordActivity({
      kind: 'action-result',
      status: success ? 'success' : 'failure',
      actionType,
      surface,
      summary,
      details
    }));

    if (window.hexContextState?.state) {
      window.hexContextState.state.lastActionSummary = summary;
      if (action?.meta?.recoveredFromProviderFailure === true) {
        window.hexContextState.state.lastRecoveredAction = {
          type: actionType,
          summary,
          success,
          reason: action.meta.reason || 'provider-failure-action-recovery',
          surface,
          at: Date.now()
        };
      }
      window.hexContextState.state.lastTouchedAt = Date.now();
      window.hexContextState.persist?.();
    }

    return { success, summary, details };
  }

  return { record, summarizeAction };
})();