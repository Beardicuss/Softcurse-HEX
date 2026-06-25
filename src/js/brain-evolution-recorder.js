'use strict';

window.hexBrainEvolution = (function () {
  const VERSION = '0.2.0';
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
        usableAsNegative: normalizedSignal === 'wrong' || normalizedSignal === 'fix'
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
      sources: record.tags
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