'use strict';
// ── brain-router.js ──────────────────────────────────────────────────────────
// Central message router. It decides whether a turn can be handled by local/server
// memory and reflexes, or should continue to provider reasoning.

(function () {
  const ROUTE_VERSION = '1.0.0';

  function normalizeLang(lang) {
    const value = String(lang || window._hexConfig?.language || document.documentElement.lang || 'en').toLowerCase();
    if (value.startsWith('ru')) return 'ru';
    if (value.startsWith('ka')) return 'ka';
    return 'en';
  }

  function clean(text) {
    return String(text || '').trim();
  }


  function isGreeting(text) {
    return /^(hi|hello|hey|yo|sup|wazzup|wazzap|wassup|whats up|what'?s up|hex|cardinal|привет|здравствуй|хекс|кардинал|გამარჯობა|ჰექს|კარდინალ)\b/i.test(clean(text));
  }

  function isThanks(text) {
    return /\b(thanks|thank you|спасибо|მადლობა)\b/i.test(clean(text));
  }

  function isStatusQuestion(text) {
    return /(status|are you online|are you working|brain status|provider status|api key|статус|онлайн|работаешь|мозг|ключ|სტატუს|ონლაინ|მუშაობ|ტვინი)/i.test(clean(text));
  }

  function isMemoryQuestion(text) {
    return /(what do you remember|what do you know about me|list.*memory|show.*memory|что ты помнишь|что ты знаешь обо мне|памят|что знаешь|რა გახსოვს|ჩემზე რა იცი|მეხსიერ)/i.test(clean(text));
  }


  function isProfileQuestion(text) {
    return /(who am i|what'?s my name|what is my name|my profile|profile info|кто я|как меня зовут|мой профиль|профиль|ვინ ვარ|რა მქვია|ჩემი პროფილი)/i.test(clean(text));
  }

  function isContinuityQuestion(text) {
    const raw = clean(text);
    if (/^(continue|go on|next|продолжай|дальше|გააგრძელე|შემდეგი)$/i.test(raw)) return true;
    return /(what are we doing|where did we stop|what was next|last task|current goal|continue from|что мы делаем|где остановились|что дальше|текущая цель|последняя задача|რას ვაკეთებთ|სად გავჩერდით|შემდეგ რა|მიმდინარე მიზანი)/i.test(raw);
  }

  function isBrowserQuestion(text) {
    return /(what page|which page|browser open|current tab|open tab|where am i browsing|какая страница|что открыто в браузере|текущая вкладка|браузер открыт|რომელი გვერდი|ბრაუზერში რა არის|მიმდინარე ტაბი)/i.test(clean(text));
  }

  function isInventoryQuestion(text) {
    return /(what.*(pc|computer).*(know|see|have)|what apps|what games|what files|what folders|pc inventory|computer inventory|что.*(пк|компьютер).*(видишь|знаешь)|какие приложения|какие игры|какие файлы|инвентар|კომპიუტერზე რას ხედავ|რა აპები|რა თამაშები|რა ფაილები|ინვენტარ)/i.test(clean(text));
  }


  function isSimpleCompanionTurn(text, actionPlan) {
    const raw = clean(text);
    if (!raw || raw.length > 240) return false;
    if (/[{}<>]|```|\b(function|class|SELECT|INSERT|UPDATE|DELETE|import|export)\b/i.test(raw)) return false;
    if (/\b(open|launch|run|search|find|scan|delete|remove|install|download|click|play|close|kill|write|create|edit)\b/i.test(raw)) return false;
    const companionPattern = /\b(how are you|are you okay|what'?s up|what up|wazzup|wazzap|wassup|talk|chat|listen|i feel|i think|i want|i like|i hate|i am|i'm|can you help|what can you do|ok|okay|good|nice|cool|yes|no|maybe|как ты|ты как|поговор|слушай|я хочу|я думаю|мне нравится|помоги|что ты можешь|хорошо|ладно|да|нет|როგორ ხარ|კარგად ხარ|ვისაუბროთ|მისმინე|მინდა|ვფიქრობ|მომწონს|დამეხმარ|რა შეგიძლია|კარგი|დიახ|არა)\b/i;
    if (!companionPattern.test(raw)) return false;
    if (actionPlan && actionPlan.domain && !['dialogue', 'reasoning'].includes(actionPlan.domain)) return false;
    return true;
  }
  function isCorrection(text) {
    return /\b(no|wrong|actually|i mean|not that|correction|don't call|do not call|нет|не так|на самом деле|исправ|не называй|არა|არასწორ|სინამდვილეში)\b/i.test(clean(text));
  }

  function extractRememberFact(text) {
    const raw = clean(text);
    const patterns = [
      /^(?:remember that|remember|save that)\s+(.+)/i,
      /^(?:запомни(?: что)?|сохрани(?: что)?)\s+(.+)/i,
      /^(?:დაიმახსოვრე(?: რომ)?|შეინახე(?: რომ)?)\s+(.+)/i
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  }

  function extractCloudMemories(packet) {
    const values = [];
    const push = (value) => {
      const text = clean(value);
      if (text && !values.some((item) => item.toLowerCase() === text.toLowerCase())) values.push(text);
    };

    (Array.isArray(packet?.relevantMemories) ? packet.relevantMemories : []).forEach((item) => push(item?.content || item?.summary || item));
    (Array.isArray(packet?.summary?.memoryHighlights) ? packet.summary.memoryHighlights : []).forEach(push);
    (Array.isArray(packet?.references?.memories) ? packet.references.memories : []).forEach((item) => push(item?.content || item?.label || item));
    if (packet?.topics?.active?.label) push('Active topic: ' + packet.topics.active.label);
    (Array.isArray(packet?.topics?.paused) ? packet.topics.paused : []).forEach((item) => push('Paused topic: ' + (item?.label || item)));
    (Array.isArray(packet?.topics?.recent) ? packet.topics.recent : []).forEach((item) => push('Recent topic: ' + (item?.label || item)));
    return values.slice(0, 8);
  }

  function extractLocalMemory(query) {
    const ctx = window.hexBrainCore?.memoryRecall?.(query) || '';
    return clean(ctx).slice(0, 1400);
  }

  function localProviderHealth(systemState) {
    const capability = systemState?.providerCapabilities || window._hexLastProviderFailures || null;
    const failures = Array.isArray(window._hexLastProviderFailures) ? window._hexLastProviderFailures : [];
    if (Array.isArray(capability?.providers)) {
      return capability.providers.slice(0, 8).map((item) => `${item.provider || item.label}: ${item.status || 'unknown'} (${item.validKeys || 0} keys)`).join('\n');
    }
    if (failures.length) {
      return failures.slice(0, 8).map((item) => `${item.label || item.provider}: ${item.reason || 'unavailable'}`).join('\n');
    }
    return '';
  }


  function summarizeDesktopPacket(packet) {
    const ctx = packet?.desktopContext || {};
    const count = (items) => Array.isArray(items) ? items.length : 0;
    return {
      apps: count(ctx.appCandidates),
      games: count(ctx.gameCandidates),
      files: count(ctx.fileCandidates),
      folders: count(ctx.folderCandidates),
      windows: count(ctx.windowCandidates),
      processes: count(ctx.processCandidates),
      highlights: count(ctx.inventoryHighlights),
      inventorySummary: clean(ctx.inventorySummary).slice(0, 180)
    };
  }

  function packetFreshness(packet, purpose = 'session') {
    if (!packet) return { fresh: false, stale: false, reason: 'no-packet', ageSeconds: null };
    const state = packet.continuityState || null;
    if (!state?.schema) return { fresh: true, stale: false, reason: 'legacy-packet-no-freshness', ageSeconds: null };
    const freshness = state.freshness || {};
    const ageFor = (keys) => {
      for (const key of keys) {
        const value = Number(freshness[key]);
        if (Number.isFinite(value)) return value;
      }
      return null;
    };
    const rules = {
      browser: { keys: ['lastTurnSeconds', 'sessionSeconds'], max: 15 * 60, requires: () => state.browser?.open === true },
      inventory: { keys: ['inventorySeconds', 'sessionSeconds'], max: 6 * 60 * 60, requires: () => state.hasDesktopInventory === true },
      action: { keys: ['lastActionSeconds', 'lastTurnSeconds', 'sessionSeconds'], max: 20 * 60, requires: () => true },
      session: { keys: ['sessionSeconds', 'lastTurnSeconds'], max: 45 * 60, requires: () => true },
      memory: { keys: ['sessionSeconds', 'lastTurnSeconds'], max: 24 * 60 * 60, requires: () => true },
      profile: { keys: ['sessionSeconds'], max: 30 * 24 * 60 * 60, requires: () => true }
    };
    const rule = rules[purpose] || rules.session;
    const ageSeconds = ageFor(rule.keys);
    if (rule.requires && !rule.requires()) return { fresh: false, stale: true, reason: purpose + '-state-missing', ageSeconds };
    if (ageSeconds == null) return { fresh: true, stale: false, reason: 'freshness-age-missing', ageSeconds };
    const fresh = ageSeconds <= rule.max;
    return { fresh, stale: !fresh, reason: fresh ? purpose + '-fresh' : purpose + '-stale', ageSeconds };
  }

  function cloudForPurpose(packet, purpose) {
    return packetFreshness(packet, purpose).fresh ? packet : null;
  }

  function inferConfidence(route, packet, memoryCount) {
    const freshness = packetFreshness(packet, route === 'browser-answer' ? 'browser' : route === 'inventory-answer' ? 'inventory' : 'session');
    const stalePenalty = freshness.stale ? -0.18 : 0;
    if (route === 'provider' || route === 'server-context-provider') return packet ? Math.max(0.48, 0.72 + stalePenalty) : 0.45;
    if (route === 'memory-answer') return memoryCount > 0 ? 0.9 : 0.62;
    if (route === 'continuity-answer') return (packet?.activeGoal || packet?.topics?.active ? 0.88 : 0.68) + stalePenalty;
    if (route === 'profile-answer') return packet?.profile ? 0.9 : 0.64;
    if (route === 'browser-answer') return packet?.browser ? Math.max(0.55, 0.86 + stalePenalty) : 0.55;
    if (route === 'inventory-answer') return packet?.desktopContext ? Math.max(0.55, 0.84 + stalePenalty) : 0.55;
    if (route === 'status-answer' || route === 'local-reflex') return 0.82;
    return 0.5;
  }

  function providerRequired(route) {
    return route === 'provider' || route === 'server-context-provider';
  }

  function recommendedNext(route, packet) {
    const freshness = packetFreshness(packet, route === 'browser-answer' ? 'browser' : route === 'inventory-answer' ? 'inventory' : 'session');
    if (providerRequired(route)) return packet ? (freshness.stale ? 'reason-with-server-background-memory' : 'reason-with-server-context') : 'try-provider-or-local-fallback';
    if (route === 'memory-answer') return 'answer-from-memory-only';
    if (route === 'continuity-answer') return 'continue-current-task-from-server-state';
    if (route === 'browser-answer') return 'use-browser-session-state';
    if (route === 'inventory-answer') return 'use-desktop-inventory-state';
    if (route === 'profile-answer') return 'use-profile-identity-state';
    return 'local-response-no-provider';
  }

  function actionTypeMatchesDomain(actionType, domain) {
    const action = String(actionType || '').toLowerCase();
    const d = String(domain || '').toLowerCase();
    if (!action || !d) return false;
    if (d.includes('browser')) return action.startsWith('web_') || action.includes('browser');
    if (d.includes('desktop')) return !action.startsWith('web_') || /(file|folder|app|game|process|window|clipboard|screenshot|volume|system)/.test(action);
    return action.includes(d) || d.includes(action);
  }

  function recoveryActionsForFailure(failure, actionPlan) {
    const actionType = String(failure?.actionType || '').toLowerCase();
    const domain = String(actionPlan?.domain || '').toLowerCase();
    const surface = String(failure?.surface || actionPlan?.suggestedSurface || '').toLowerCase();
    if (surface === 'browser' || domain.includes('browser') || actionType.startsWith('web_')) {
      return [{ type: 'web_read', args: [] }];
    }
    return [];
  }
  function recentMatchingFailure(packet, actionPlan) {
    const timeline = Array.isArray(packet?.actionTimeline) ? packet.actionTimeline : [];
    const domain = actionPlan?.domain || '';
    const surface = actionPlan?.suggestedSurface || '';
    return timeline.find((item) => {
      if (String(item?.status || '').toLowerCase() !== 'failure') return false;
      if (surface && item?.surface && String(item.surface).toLowerCase() !== String(surface).toLowerCase()) return false;
      return actionTypeMatchesDomain(item?.actionType || item?.kind, domain);
    }) || null;
  }
  function buildRouteHints(route, systemState, reason = '', extra = {}) {
    const packet = systemState?.cloudContext || window.hexCloudSync?._contextPacketCache?.packet || null;
    const actionPlan = extra.actionPlan || systemState?.brainPreflightPlan || window.hexBrainActionPlanner?.classify?.(extra.userMsg || '', systemState) || null;
    const cloudMemories = extractCloudMemories(packet);
    const memoryCount = cloudMemories.length;
    const confidence = extra.confidence || inferConfidence(route, packet, memoryCount);
    const sources = [];
    if (packet) sources.push('hex-server-context');
    if (memoryCount) sources.push('server-memory');
    if (window.hexMemory) sources.push('local-memory');
    if (packet?.desktopContext) sources.push('desktop-inventory');
    if (packet?.browser?.open) sources.push('browser-session');

    return {
      version: ROUTE_VERSION,
      route,
      reason,
      confidence,
      serverPacket: !!packet,
      serverPacketFreshness: packetFreshness(packet, actionPlan?.suggestedSurface === 'browser' ? 'browser' : actionPlan?.suggestedSurface === 'desktop' ? 'inventory' : 'session'),
      serverMemoryHits: memoryCount,
      localMemoryReady: !!window.hexMemory,
      providerLayer: 'unstable-external',
      providerRequired: providerRequired(route),
      recommendedNext: recommendedNext(route, packet),
      actionPlan,
      sources,
      server: packet ? {
        schema: packet.schema || null,
        generatedAt: packet.generatedAt || null,
        profileId: packet.profile?.id || null,
        displayName: packet.profile?.displayName || null,
        language: packet.profile?.language || null,
        activeGoal: packet.activeGoal?.text || packet.session?.primaryGoal || null,
        activeTopic: packet.topics?.active?.label || null,
        browserOpen: !!packet.browser?.open,
        browserTitle: packet.browser?.title || null,
        continuityState: packet.continuityState || null,
        memoryPreview: cloudMemories.slice(0, 3),
        desktop: summarizeDesktopPacket(packet)
      } : null,
      local: {
        memoryReady: !!window.hexMemory,
        brainCoreReady: !!window.hexBrainCore,
        directCommandParserReady: typeof window.tryDirectCommand === 'function' || typeof tryDirectCommand === 'function'
      }
    };
  }

  async function route(input = {}) {
    const userMsg = clean(input.userMsg);
    const lang = normalizeLang(input.lang);
    const systemState = input.systemState || {};
    const cloudPacket = systemState.cloudContext || window.hexCloudSync?._contextPacketCache?.packet || null;
    const freshSessionPacket = cloudForPurpose(cloudPacket, 'session');
    const freshBrowserPacket = cloudForPurpose(cloudPacket, 'browser');
    const freshInventoryPacket = cloudForPurpose(cloudPacket, 'inventory');
    const freshActionPacket = cloudForPurpose(cloudPacket, 'action');
    const rememberFact = extractRememberFact(userMsg);
    const actionPlan = systemState.brainPreflightPlan || window.hexBrainActionPlanner?.classify?.(userMsg, systemState) || null;
    if (rememberFact) {
      window.hexBrainCore?.saveLocalFact?.(rememberFact);
      window.hexCloudSync?.runDetached?.('sync explicit memory', () => window.hexCloudSync.rememberFact(rememberFact, {
        kind: 'explicit',
        confidence: 0.97,
        tags: ['explicit', 'remember', 'brain-router']
      }));
      return {
        mode: 'local-reflex',
        reason: 'remember-command',
        text: window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || 'Saved to memory.',
        actions: [],
        hints: buildRouteHints('local-reflex', systemState, 'remember-command', { actionPlan, userMsg })
      };
    }

    if (isProfileQuestion(userMsg) && (cloudPacket?.profile || extractLocalMemory(userMsg))) {
      return {
        mode: 'profile-answer',
        reason: cloudPacket?.profile ? 'server-profile' : 'local-profile-memory',
        text: window.hexBrainResponseComposer?.profileReply?.(lang, cloudPacket, extractLocalMemory(userMsg), extractCloudMemories(cloudPacket)) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('profile-answer', systemState, cloudPacket?.profile ? 'server-profile' : 'local-profile-memory', { actionPlan, userMsg })
      };
    }

    if (isProfileQuestion(userMsg)) {
      return {
        mode: 'profile-answer',
        reason: 'local-profile-default',
        text: window.hexBrainResponseComposer?.profileReply?.(lang, cloudPacket, extractLocalMemory(userMsg), extractCloudMemories(cloudPacket)) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('profile-answer', systemState, 'local-profile-default', { actionPlan, userMsg })
      };
    }

    if (isContinuityQuestion(userMsg) && freshSessionPacket) {
      return {
        mode: 'continuity-answer',
        reason: 'server-continuity-fresh',
        text: window.hexBrainResponseComposer?.continuityReply?.(lang, freshSessionPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('continuity-answer', systemState, 'server-continuity-fresh', { actionPlan, userMsg })
      };
    }

    if (isContinuityQuestion(userMsg)) {
      return {
        mode: 'continuity-answer',
        reason: 'local-continuity-memory',
        text: window.hexBrainResponseComposer?.companionReply?.(lang, userMsg, systemState) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('continuity-answer', systemState, 'local-continuity-memory', { actionPlan, userMsg })
      };
    }

    if (isBrowserQuestion(userMsg) && freshBrowserPacket?.browser) {
      return {
        mode: 'browser-answer',
        reason: 'server-browser-state-fresh',
        text: window.hexBrainResponseComposer?.browserReply?.(lang, freshBrowserPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('browser-answer', systemState, 'server-browser-state-fresh', { actionPlan, userMsg })
      };
    }

    if (isInventoryQuestion(userMsg) && freshInventoryPacket?.desktopContext) {
      return {
        mode: 'inventory-answer',
        reason: 'server-desktop-context-fresh',
        text: window.hexBrainResponseComposer?.inventoryReply?.(lang, freshInventoryPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('inventory-answer', systemState, 'server-desktop-context-fresh', { actionPlan, userMsg })
      };
    }
    const failedAction = recentMatchingFailure(freshActionPacket, actionPlan);
    if (failedAction && actionPlan && /action|follow-up/.test(actionPlan.domain || '')) {
      return {
        mode: 'action-recovery-local',
        reason: 'recent-action-failure',
        text: window.hexBrainResponseComposer?.actionRecoveryReply?.(lang, failedAction, actionPlan) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: recoveryActionsForFailure(failedAction, actionPlan),
        hints: buildRouteHints('local-reflex', systemState, 'recent-action-failure', { actionPlan, userMsg, confidence: 0.83 })
      };
    }

    const directBrowserAction = window.hexBrainActionRecovery?.actionsForObviousBrowserCommand?.({ userMsg, systemState, lang, actionPlan });
    if (directBrowserAction?.actions?.length) {
      return {
        mode: 'direct-browser-action',
        reason: directBrowserAction.reason || 'direct-browser-action',
        text: directBrowserAction.text || '',
        actions: directBrowserAction.actions,
        hints: buildRouteHints('direct-browser-action', systemState, directBrowserAction.reason || 'direct-browser-action', { actionPlan: directBrowserAction.plan || actionPlan, userMsg, confidence: 0.92 })
      };
    }    const directLocalAction = window.hexBrainActionRecovery?.actionsForObviousLocalCommand?.({ userMsg, systemState, lang, actionPlan });
    if (directLocalAction?.actions?.length) {
      return {
        mode: 'direct-local-action',
        reason: directLocalAction.reason || 'direct-local-action',
        text: directLocalAction.text || '',
        actions: directLocalAction.actions,
        hints: buildRouteHints('direct-local-action', systemState, directLocalAction.reason || 'direct-local-action', { actionPlan: directLocalAction.plan || actionPlan, userMsg, confidence: 0.9 })
      };
    }
    if (isMemoryQuestion(userMsg)) {
      const cloudFacts = extractCloudMemories(cloudPacket);
      const localFacts = extractLocalMemory(userMsg);
      return {
        mode: 'memory-answer',
        reason: cloudFacts.length ? 'server-memory' : 'local-memory',
        text: window.hexBrainResponseComposer?.memoryReply?.(lang, cloudFacts, localFacts) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('memory-answer', systemState, cloudFacts.length ? 'server-memory' : 'local-memory', { actionPlan, userMsg })
      };
    }

    if (isStatusQuestion(userMsg)) {
      return {
        mode: 'status-answer',
        reason: 'brain-status',
        text: window.hexBrainResponseComposer?.statusReply?.(lang, systemState, localProviderHealth(systemState)) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('status-answer', systemState, 'brain-status', { actionPlan, userMsg })
      };
    }

    if (isCorrection(userMsg) && userMsg.length < 260) {
      window.hexBrainCore?.saveLocalFact?.('User correction: ' + userMsg);
      return {
        mode: 'local-reflex',
        reason: 'correction-capture',
        text: window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || 'Correction noted.',
        actions: [],
        hints: buildRouteHints('local-reflex', systemState, 'correction-capture', { actionPlan, userMsg })
      };
    }

    if ((isGreeting(userMsg) || isThanks(userMsg)) && userMsg.split(/\s+/).length <= 5) {
      const useCompanion = isGreeting(userMsg) && (userMsg.split(/\s+/).length > 2 || /\b(wazzup|wazzap|wassup|what'?s up|what up|cardinal)\b/i.test(userMsg));
      return {
        mode: useCompanion ? 'companion-local' : 'local-reflex',
        reason: isGreeting(userMsg) ? 'greeting' : 'thanks',
        text: useCompanion
          ? (window.hexBrainResponseComposer?.companionReply?.(lang, userMsg, systemState) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '')
          : (window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || ''),
        actions: [],
        hints: buildRouteHints('local-reflex', systemState, isGreeting(userMsg) ? 'greeting' : 'thanks', { actionPlan, userMsg })
      };
    }

    if (isSimpleCompanionTurn(userMsg, actionPlan)) {
      return {
        mode: 'companion-local',
        reason: 'simple-dialogue-local-first',
        text: window.hexBrainResponseComposer?.companionReply?.(lang, userMsg, systemState) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('local-reflex', systemState, 'simple-dialogue-local-first', { actionPlan, userMsg, confidence: 0.78 })
      };
    }
    const routeMode = freshSessionPacket ? 'server-context-provider' : 'provider';
    const routeReason = freshSessionPacket ? 'server-packet-attached' : (cloudPacket ? 'stale-server-packet-background' : 'needs-model-reasoning');
    return {
      mode: routeMode,
      reason: routeReason,
      text: null,
      actions: [],
      hints: buildRouteHints(routeMode, systemState, routeReason, { actionPlan, userMsg })
    };
  }

  window.hexBrainRouter = {
    version: ROUTE_VERSION,
    route,
    extractCloudMemories,
    localProviderHealth,
    packetFreshness
  };
})();

