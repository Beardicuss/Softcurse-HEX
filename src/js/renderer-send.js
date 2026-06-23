'use strict';

window.sendHexMessage = async function sendHexMessage() {
  const config = window._hexConfig || {};
  if (config?.onboarding?.completed === false) {
    window.hexOnboarding?.open?.();
    showToast('◆ PROFILE REQUIRED', 'Complete first-run registration before chatting.', 'warn', 3000);
    return;
  }
  const ta = document.getElementById('chat-input');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = '';
  ta.style.height = '36px';

  addUserMessage(text);
  if (window.nsTrackCommand) window.nsTrackCommand();
  if (window.hexSleep) window.hexSleep.resetIdle();
  addLog('VOICE', `User: ${text}`);
  window.hexAudio.play('action', 0.6);

  let stage = 'preflight';
  let resolvedReference = null;

  try {
    stage = 'browser session preflight';
    const preflightBrowserState = await window.getBrowserSessionState();
    window.updateSessionContextForUser(text, preflightBrowserState);
    const shouldResolveReference = window.hexReferenceResolver?.isReferenceCommand?.(text, !!preflightBrowserState?.open) === true;
    resolvedReference = shouldResolveReference ? (window.hexReferenceResolver?.resolveMixedReference?.(text, !!preflightBrowserState?.open) || null) : null;
    if (resolvedReference) {
      addLog('CONTEXT', 'Resolved follow-up target: #' + resolvedReference.index + ' ' + (resolvedReference.label || resolvedReference.text || ''));
    }

    stage = 'reminder parse';
    const ri = window.reminders.parseReminderIntent(text);
    if (ri.found) {
      await window.reminders.set(ri.label, ri.delayMs);
      const minLeft = Math.round(ri.delayMs / 60000);
      const msg = window.i18n.t('reminder_set', { label: ri.label, min: minLeft });
      addHexMessage(msg);
      addLog('HEX', `Reminder set: "${ri.label}" in ${minLeft} min`);
      window.hexVoice.speak(msg);
      return;
    }

    stage = 'direct command';
    const directResult = await tryDirectCommand(text);
    if (directResult.handled) return;

    const preflightPlan = window.hexBrainActionPlanner?.classify?.(text, {
      browserSession: preflightBrowserState,
      sessionContext: {
        resolvedReference,
        lastResolvedReference: window.hexContextState?.state?.lastResolvedReference || null,
        activeSurface: window.hexSessionContext?.activeSurface || 'chat'
      },
      desktopContext: window.hexPcAwareness?.getSnapshot?.() || null
    }) || null;
    window.hexPcAwarenessRefresh?.noteQueryIntent?.(text);
    const refreshPlan = window.hexPcAwarenessRefresh?.planRefreshForTurn?.(preflightPlan, {
      text,
      surface: preflightPlan?.suggestedSurface || 'chat'
    }) || {};
    if (preflightPlan) {
      window.hexBrainTelemetry?.record?.({
        phase: 'preflight',
        user: text,
        actionDomain: preflightPlan.domain,
        actionSurface: preflightPlan.suggestedSurface,
        actionUrgency: preflightPlan.urgency,
        providerRequired: preflightPlan.providerNeeded,
        reason: (preflightPlan.reasons || []).join(', '),
        details: { browserOpen: preflightPlan.browserOpen, hasResolvedReference: preflightPlan.hasResolvedReference }
      });
    }
    if (refreshPlan.pulseDesktop) {
      window.hexPcAwarenessLoop?.pulse?.('desktop', { followUp: true, inventoryBoost: !!refreshPlan.inventoryBoost });
    }
    if (refreshPlan.refreshWindows) {
      window.hexPcAwareness?.refreshWindows?.(preflightPlan?.urgency === 'high').catch?.(() => {});
    }
    if (refreshPlan.refreshProcesses) {
      window.hexPcAwareness?.refreshProcesses?.(preflightPlan?.urgency === 'high').catch?.(() => {});
    }

    stage = 'context build';
    let systemState = await window.buildAIContextState(text, { config, sysStats: window.sysStats, skipUserUpdate: true, resolvedReference });
    if (preflightPlan) systemState.brainPreflightPlan = preflightPlan;
    const cloudContext = await window.hexCloudSync?.getContextPacket?.(text, systemState).catch(() => null);
    if (cloudContext) systemState.cloudContext = cloudContext;

    window.hexCloudSync?.runDetached?.('push live user snapshot', () => window.hexCloudSync.pushLiveSessionSnapshot(systemState, { force: true }));
    window.hexCloudSync?.runDetached?.('push user turn', () => window.hexCloudSync.pushTurn('user', text, systemState, {
      kind: 'chat',
      followUp: systemState.sessionContext?.lastUserWasFollowUp === true
    }));

    showTyping();
    window.hexTaskBus?.push('Sending message to AI...');
    window.hexAudio.play('processing', 0.5);

    stage = 'vision capture';
    let visionData = null;
    const browserFollowUp = systemState.browserSession?.open && systemState.sessionContext?.lastUserWasFollowUp;
    if (browserFollowUp && window.hexAPI?.browser?.screenshot) {
      addLog('VISION', 'Capturing active browser session for follow-up reasoning...');
      window.hexTaskBus?.push('Capturing browser session...');
      const snap = await window.hexAPI.browser.screenshot().catch(() => null);
      if (snap?.success && snap.image) {
        visionData = snap.image;
        window._webVisionData = snap.image;
        window._webVisionMeta = {
          url: snap.url || systemState.browserSession.url || null,
          title: snap.title || systemState.browserSession.title || null,
          capturedAt: Date.now(),
          source: 'follow-up'
        };
      }
    }
    if (!visionData && browserFollowUp && window._webVisionData) {
      visionData = window._webVisionData;
    }
    if (!visionData && window.visionEnabled && window.hexAPI && window.hexAPI.captureScreenBase64) {
      addLog('SYS', 'Capturing visual sensor data...');
      window.hexTaskBus?.push('Capturing screen...');
      visionData = await window.hexAPI.captureScreenBase64();
    }

    stage = 'ai chat';
    const result = await window.hexAI.chat(text, systemState, config.language || 'en', visionData);
    hideTyping();
    window.hexAudio.stop('processing');
    const hexText = result.text || '…';
    window.updateSessionContextForAssistant(hexText, result.actions || []);
    addHexMessage(hexText, { feedback: { user: text, brainRoute: result.brainRoute || null } });
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

    stage = 'post reply context';
    let postReplyState = await window.buildAIContextState(text, { config, sysStats: window.sysStats, skipUserUpdate: true, resolvedReference });
    if (cloudContext) postReplyState.cloudContext = cloudContext;
    window.hexMemory?.promoteLiveSession?.(postReplyState);
    window.hexCloudSync?.runDetached?.('push live assistant snapshot', () => window.hexCloudSync.pushLiveSessionSnapshot(postReplyState, { force: true }));
    window.hexCloudSync?.runDetached?.('push assistant turn', () => window.hexCloudSync.pushTurn('assistant', hexText, postReplyState, {
      kind: 'chat-response',
      actionTypes: (result.actions || []).map((action) => action.type)
    }));

    if (config.voice?.enabled !== false) speakWithConfig(hexText);

    const infoResults = [];
    const SEQUENTIAL_ACTIONS = new Set([
      'shutdown', 'restart', 'logoff', 'lock_screen',
      'web_navigate', 'web_search', 'web_click', 'web_find_click', 'web_type',
      'web_back', 'web_forward', 'web_refresh', 'web_read', 'web_close', 'web_look'
    ]);
    const actions = result.actions || [];
    const parallelBatch = [];
    const sequentialQueue = [];
    for (const action of actions) {
      if (SEQUENTIAL_ACTIONS.has(action.type)) sequentialQueue.push(action);
      else parallelBatch.push(action);
    }

    const ActionResult = class {
      constructor({ success, action, data, durationMs }) {
        this.success = success;
        this.action = action;
        this.data = data;
        this.durationMs = durationMs;
      }
    };
    const recordActionOutcome = (action, result) => {
      const success = result?.success !== false;
      const summary = (success ? 'Completed ' : 'Failed ') + action.type;
      window.hexCloudSync?.runDetached?.('record action outcome', () => window.hexCloudSync.recordActivity({
        kind: 'action-result',
        status: success ? 'success' : 'failure',
        actionType: action.type,
        surface: window.hexSessionContext?.activeSurface || 'chat',
        summary,
        details: {
          durationMs: result?.durationMs || null
        }
      }));
    };

    const executeTrackedAction = async (action) => {
      const start = Date.now();
      let result;
      try {
        const rawResult = await handleAIAction(action);
        result = new ActionResult({
          success: rawResult ? rawResult.success !== false : true,
          action: action.type,
          data: rawResult?.data ?? rawResult,
          durationMs: Date.now() - start
        });
      } catch (error) {
        result = new ActionResult({
          success: false,
          action: action.type,
          data: error?.message || String(error),
          durationMs: Date.now() - start
        });
      }
      recordActionOutcome(action, result);
      return result;
    };
    stage = 'action execution';
    if (parallelBatch.length > 0) {
      const batchStart = Date.now();
      const promises = parallelBatch.map(async (action) => {
        window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
        const actionResult = await executeTrackedAction(action);
        if (actionResult && actionResult.data && typeof actionResult.data === 'string') {
          infoResults.push('[' + action.type.toUpperCase() + ' RESULT]: ' + actionResult.data);
        }
        return actionResult;
      });
      await Promise.allSettled(promises);
      const elapsed = Date.now() - batchStart;
      if (parallelBatch.length > 1) addLog('HEX', `${parallelBatch.length} actions executed in parallel (${elapsed}ms)`);
    }

    for (const action of sequentialQueue) {
      window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
      const actionResult = await handleAIAction(action);
      if (actionResult && actionResult.data) {
        infoResults.push('[' + action.type.toUpperCase() + ' RESULT]: ' + actionResult.data);
      }
    }

    if (infoResults.length > 0) {
      stage = 'system data follow-up';
      window.updateSessionContextForSystemData(infoResults);
      window.hexPcAwarenessLoop?.pulse?.('desktop', { inventoryBoost: true });
      let systemDataState = await window.buildAIContextState(text, { config, sysStats: window.sysStats, skipUserUpdate: true, resolvedReference });
      const systemDataCloudContext = await window.hexCloudSync?.getContextPacket?.(text, systemDataState).catch(() => null);
      if (systemDataCloudContext) systemDataState.cloudContext = systemDataCloudContext;
      await window.hexCloudSync?.pushLiveSessionSnapshot?.(systemDataState, { force: true });
      showTyping();
      window.hexTaskBus?.push('Processing system data with AI...');
      try {
        const followUp = await window.hexAI.chat(
          'SYSTEM DATA (just retrieved from this PC — use this to answer the user):\n' + infoResults.join('\n'),
          systemDataState,
          config.language || 'en',
          window._webVisionData || null,
          800,
          { persistUser: false, persistAssistant: true, extractFacts: false }
        );
        hideTyping();
        const followText = followUp.text || '';
        if (followText && followText !== '…') {
          window.updateSessionContextForAssistant(followText, followUp.actions || []);
          addHexMessage(followText, { feedback: { user: text, brainRoute: followUp.brainRoute || null } });
          if (config.voice?.enabled !== false) speakWithConfig(followText);
        }
      } catch (_) {
        hideTyping();
      }
    }
  } catch (e) {
    hideTyping();
    window.hexAudio.stop('processing');
    const errMsg = `Neural link disrupted during ${stage}: ${e?.message || String(e)}`;
    addHexMessage(errMsg);
    addLog('ERROR', errMsg);
    console.error('sendHexMessage failed at stage:', stage, e);
  }
};

window.handleInputKey = function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    window.sendHexMessage();
  }
};

window.sendMessage = window.sendHexMessage;

window.ensureChatInputBinding = function ensureChatInputBinding() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.querySelector('.chat-send-btn');
  if (input && !input.dataset.hexBound) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.sendHexMessage();
      }
    });
    input.dataset.hexBound = 'true';
  }
  if (sendBtn && !sendBtn.dataset.hexBound) {
    sendBtn.addEventListener('click', () => window.sendHexMessage());
    sendBtn.dataset.hexBound = 'true';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.ensureChatInputBinding(), { once: true });
} else {
  window.ensureChatInputBinding();
}

