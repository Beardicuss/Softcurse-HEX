'use strict';

window.hexBrainEvolution = (function () {
  const VERSION = '0.2.1';
  const SYSTEM_PROMPT = [
    'You are HEX, a local-first desktop companion and butler.',
    'Prefer continuity, user intent, and safe action execution.',
    'Adapt to the user feedback captured in this training sample.'
  ].join(' ');

  function cleanText(value, limit = 8000) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function makeId() {
    return 'exp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeLang(value) {
    const lang = String(value || window._hexConfig?.language || document.documentElement?.lang || 'en').toLowerCase();
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('ka')) return 'ka';
    return 'en';
  }

  function routeSummary(route = null) {
    if (!route || typeof route !== 'object') return null;
    return {
      mode: cleanText(route.mode || route.route, 80),
      reason: cleanText(route.reason, 160),
      confidence: Number.isFinite(Number(route.confidence || route.hints?.confidence)) ? Number(route.confidence || route.hints?.confidence) : null,
      providerRequired: route.providerRequired ?? route.hints?.providerRequired ?? null,
      serverPacket: route.serverPacket ?? route.hints?.serverPacket ?? null,
      serverFreshness: route.serverPacketFreshness || route.hints?.serverPacketFreshness || null,
      actionDomain: cleanText(route.actionPlan?.domain || route.hints?.actionPlan?.domain, 80),
      actionSurface: cleanText(route.actionPlan?.suggestedSurface || route.hints?.actionPlan?.suggestedSurface, 80)
    };
  }

  function compactPriorityItem(item = {}) {
    return {
      label: cleanText(item.label || item.value || item.title, 120),
      kind: cleanText(item.kind || item.type, 40),
      purpose: cleanText(item.purpose || item.surface || item.contextPurpose, 60),
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
      freshnessReason: cleanText(item.freshnessReason || item.retrievalReason || item.reason, 120),
      ageSeconds: Number.isFinite(Number(item.ageSeconds)) ? Number(item.ageSeconds) : null
    };
  }

  function priorityFromTelemetry(item = {}) {
    const recent = window.hexBrainTelemetry?.recent?.(12) || [];
    const user = cleanText(item.user, 220).toLowerCase();
    const route = cleanText(item.brainRoute?.route || item.brainRoute?.mode || item.brainRoute?.hints?.route, 80).toLowerCase();
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const event = recent[i];
      if (!event?.priority) continue;
      const sameUser = !user || cleanText(event.user, 220).toLowerCase() === user;
      const sameRoute = !route || cleanText(event.route, 80).toLowerCase() === route;
      if (!sameUser && !sameRoute) continue;
      return {
        source: 'brain-telemetry',
        active: event.priority.topActive ? [event.priority.topActive] : [],
        background: event.priority.topBackground ? [event.priority.topBackground] : [],
        activeCount: Number(event.priority.activeCount || 0),
        backgroundCount: Number(event.priority.backgroundCount || 0),
        guidance: event.priority.guidance || ''
      };
    }
    return null;
  }

  function prioritySnapshot(item = {}) {
    const route = item.brainRoute || null;
    const view = route?.server?.priorityView || route?.hints?.server?.priorityView || route?.priorityView || null;
    const fallback = view ? null : priorityFromTelemetry(item);
    const priority = view || fallback;
    if (!priority) return null;
    const active = Array.isArray(priority.active) ? priority.active.slice(0, 8).map(compactPriorityItem) : [];
    const background = Array.isArray(priority.background) ? priority.background.slice(0, 8).map(compactPriorityItem) : [];
    const activeCount = Number(priority.activeCount ?? active.length) || active.length;
    const backgroundCount = Number(priority.backgroundCount ?? background.length) || background.length;
    return {
      schema: 'hex.feedback-priority-context.v1',
      source: view ? 'brain-route' : (fallback?.source || 'unknown'),
      activeCount,
      backgroundCount,
      active,
      background,
      topActive: active[0] || null,
      topBackground: background[0] || null,
      guidance: cleanText(priority.guidance, 240) || null
    };
  }
  function inferTags(signal, item, correction) {
    const text = [item?.user, item?.assistant, correction].filter(Boolean).join(' ').toLowerCase();
    const tags = ['feedback', signal];
    if (/open|launch|start|run|file|folder|process|window|browser|youtube|google|search/.test(text)) tags.push('action-routing');
    if (/remember|memory|forget|profile|name|language|style/.test(text)) tags.push('memory');
    if (/wrong|not|instead|should|fix|correct/.test(text)) tags.push('correction');
    if (/russian|рус|georgian|ქართული|ka|ru/.test(text)) tags.push('localization');
    return Array.from(new Set(tags));
  }

  function inferTrainingIntent(signal, item, correction) {
    const text = [item?.user, item?.assistant, correction].filter(Boolean).join(' ').toLowerCase();
    if (signal === 'good') return 'positive-imitation';
    if (/open|launch|click|browser|youtube|search|file|folder|window|process|action/.test(text)) return 'action-routing-correction';
    if (/remember|memory|profile|name|language|style|persona/.test(text)) return 'memory-persona-correction';
    if (/russian|рус|georgian|ქართული|translate|language/.test(text)) return 'localization-correction';
    return signal === 'fix' ? 'answer-correction' : 'negative-preference';
  }

  function buildContextSnapshot(item = {}) {
    const route = routeSummary(item.brainRoute);
    const priority = prioritySnapshot(item);
    const cloudState = window.hexCloudContextRehydrator?.getLastContinuityState?.() || null;
    return {
      schema: 'hex.feedback-context.v1',
      language: normalizeLang(item.language),
      assistantMode: cleanText(item.assistantMode || window.currentMode || window._hexConfig?.mode || 'hex', 40),
      route,
      cloudContinuity: cloudState ? {
        activeSurface: cloudState.activeSurface || null,
        browserOpen: cloudState.browser?.open === true,
        freshness: cloudState.freshness || null,
        freshnessTiers: cloudState.freshnessTiers || null
      } : null,
      priorityReferences: priority,
      localSession: {
        activeSurface: cleanText(window.hexContextState?.state?.activeSurface || window.sessionContext?.activeSurface || '', 40) || null,
        currentTask: cleanText(window.hexMemory?.working?.currentTask || window.hexBrainCore?.currentTask || '', 180) || null
      },
      system: {
        provider: cleanText(window._hexSelectedProvider || window._hexConfig?.ai?.provider || '', 80) || null,
        voiceMode: !!window.isVoiceAgiActive?.()
      }
    };
  }

  function confidenceBand(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unknown';
    if (n >= 0.85) return 'high';
    if (n >= 0.65) return 'medium';
    return 'low';
  }

  function freshnessState(value) {
    if (!value || typeof value !== 'object') return 'unknown';
    if (value.stale === true) return 'stale';
    if (value.fresh === true) return 'fresh';
    return value.reason ? cleanText(value.reason, 80) : 'unknown';
  }

  function actionSummary(item = {}, route = null) {
    const actions = Array.isArray(item.actions) ? item.actions : [];
    const routeAction = route?.actionDomain || null;
    const actionTypes = actions
      .map((action) => cleanText(action?.type, 80))
      .filter(Boolean)
      .slice(0, 12);
    return {
      expectedActionCount: actions.length,
      expectedActionTypes: actionTypes,
      hasActions: actions.length > 0,
      routedActionDomain: routeAction,
      routedActionSurface: route?.actionSurface || null,
      likelyActionFeedback: actions.length > 0 || /action|browser|desktop|follow-up/.test(String(routeAction || '').toLowerCase())
    };
  }

  function routeQuality(route = null) {
    if (!route) {
      return {
        routeKnown: false,
        confidenceBand: 'unknown',
        localFirst: false,
        providerRequired: null,
        serverFreshnessState: 'unknown'
      };
    }
    const mode = cleanText(route.mode, 80);
    const providerRequired = route.providerRequired === true;
    return {
      routeKnown: true,
      mode,
      reason: route.reason || null,
      confidence: route.confidence,
      confidenceBand: confidenceBand(route.confidence),
      localFirst: providerRequired === false,
      providerRequired,
      serverPacket: route.serverPacket === true,
      serverFreshnessState: freshnessState(route.serverFreshness)
    };
  }

  function priorityQuality(priority = null) {
    if (!priority) {
      return {
        known: false,
        source: null,
        activeCount: 0,
        backgroundCount: 0,
        topActiveKind: null,
        topActivePurpose: null,
        freshBrowserReference: false,
        freshActionReference: false,
        onlyBackgroundReferences: false
      };
    }
    const active = Array.isArray(priority.active) ? priority.active : [];
    const hasPurpose = (value) => active.some((item) => String(item?.purpose || item?.kind || '').toLowerCase().includes(value));
    return {
      known: true,
      source: priority.source || null,
      activeCount: priority.activeCount || active.length,
      backgroundCount: priority.backgroundCount || (priority.background || []).length,
      topActiveKind: priority.topActive?.kind || null,
      topActivePurpose: priority.topActive?.purpose || null,
      freshBrowserReference: hasPurpose('browser'),
      freshActionReference: hasPurpose('action'),
      onlyBackgroundReferences: !active.length && (priority.backgroundCount || 0) > 0
    };
  }

  function contextQuality(context = {}) {
    const freshness = context.cloudContinuity?.freshness || null;
    const route = context.route || null;
    return {
      language: context.language || 'en',
      voiceMode: context.system?.voiceMode === true,
      activeSurface: context.cloudContinuity?.activeSurface || context.localSession?.activeSurface || null,
      browserOpen: context.cloudContinuity?.browserOpen === true,
      hasCurrentTask: !!context.localSession?.currentTask,
      cloudContinuityPresent: !!context.cloudContinuity,
      cloudFreshnessKnown: !!freshness,
      serverPacketStale: route?.serverFreshness?.stale === true,
      serverPacketFresh: route?.serverFreshness?.fresh === true,
      priority: priorityQuality(context.priorityReferences)
    };
  }
  function buildPreferencePair(signal, item, correction) {
    const user = cleanText(item?.user, 4000);
    const assistant = cleanText(item?.assistant, 8000);
    const fixed = cleanText(correction, 8000);

    if (signal === 'good') {
      return {
        kind: 'sft-positive',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user || 'User asked HEX for help.' },
          { role: 'assistant', content: assistant || 'Acknowledged.' }
        ]
      };
    }

    if (signal === 'fix' && fixed) {
      return {
        kind: 'preference-correction',
        prompt: user,
        rejected: assistant,
        chosen: fixed,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user || 'User corrected HEX.' },
          { role: 'assistant', content: fixed }
        ]
      };
    }

    return {
      kind: 'negative-signal',
      prompt: user,
      rejected: assistant,
      note: fixed || 'User marked this response as wrong.'
    };
  }

  function buildRecord(signal, item = {}, correction = '') {
    const normalizedSignal = ['good', 'wrong', 'fix'].includes(signal) ? signal : 'wrong';
    const pair = buildPreferencePair(normalizedSignal, item, correction);
    const trainingIntent = inferTrainingIntent(normalizedSignal, item, correction);
    const context = buildContextSnapshot(item);
    return {
      id: makeId(),
      type: 'hex_evolution_feedback',
      schema: 'hex.evolution-feedback.v2',
      version: VERSION,
      signal: normalizedSignal,
      trainingIntent,
      language: context.language,
      createdAt: new Date().toISOString(),
      source: 'chat-feedback',
      user: cleanText(item.user, 4000),
      assistant: cleanText(item.assistant, 8000),
      correction: cleanText(correction, 8000),
      route: item.brainRoute || null,
      routeSummary: context.route,
      context,
      quality: {
        label: normalizedSignal === 'good' ? 'accepted' : (normalizedSignal === 'fix' ? 'corrected' : 'rejected'),
        usableForSft: normalizedSignal === 'good' || (normalizedSignal === 'fix' && !!cleanText(correction, 8000)),
        usableForPreference: normalizedSignal === 'fix' && !!cleanText(correction, 8000),
        usableAsNegative: normalizedSignal === 'wrong' || normalizedSignal === 'fix',
        route: routeQuality(context.route),
        action: actionSummary(item, context.route),
        context: contextQuality(context)
      },
      tags: inferTags(normalizedSignal, item, correction),
      training: pair
    };
  }

  async function record(signal, item = {}, correction = '') {
    const record = buildRecord(signal, item, correction);
    const lines = [JSON.stringify(record)];

    if (record.training?.messages) {
      lines.push(JSON.stringify({
        type: 'hex_training_chat',
        sourceFeedbackId: record.id,
        signal: record.signal,
        trainingIntent: record.trainingIntent,
        language: record.language,
        context: record.context,
        quality: record.quality,
        messages: record.training.messages
      }));
    }

    if (record.training?.kind === 'preference-correction') {
      lines.push(JSON.stringify({
        type: 'hex_preference_pair',
        sourceFeedbackId: record.id,
        trainingIntent: record.trainingIntent,
        language: record.language,
        context: record.context,
        quality: record.quality,
        prompt: record.training.prompt,
        chosen: record.training.chosen,
        rejected: record.training.rejected
      }));
    }

    const result = await window.hexAPI?.appendFinetune?.(lines);
    if (!result?.success) return { success: false, error: result?.error || 'Could not append evolution data.' };

    window.hexBrainTelemetry?.record?.({
      phase: 'feedback',
      route: record.trainingIntent || record.training.kind,
      reason: record.signal,
      confidence: record.signal === 'good' ? 0.9 : 0.75,
      user: record.user,
      sources: record.tags,
      priority: record.context?.priorityReferences || null
    });

    window.hexCloudSync?.runDetached?.('record feedback evolution', () => window.hexCloudSync.recordActivity({
      kind: 'brain-feedback',
      summary: `${record.signal}: ${record.training.kind}`,
      route: record.trainingIntent || record.training.kind,
      trainingIntent: record.trainingIntent,
      signal: record.signal,
      tags: record.tags,
      user: record.user.slice(0, 600),
      assistant: record.assistant.slice(0, 600),
      correction: record.correction.slice(0, 600)
    }));

    return { success: true, path: result.path || null, record };
  }

  return { version: VERSION, buildRecord, record, inferTrainingIntent };
})();