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
    return /^(hi|hello|hey|yo|sup|hex|cardinal|привет|здравствуй|хекс|кардинал|გამარჯობა|ჰექს|კარდინალ)\b/i.test(clean(text));
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

  function isCorrection(text) {
    return /\b(no|wrong|actually|i mean|not that|correction|don't call|do not call|нет|не так|на самом деле|исправ|не называй|არა|არასწორ|სინამდვილეში)\b/i.test(clean(text));
  }

  function extractRememberFact(text) {
    const raw = clean(text);
    const patterns = [
      /(?:remember that|remember|save that)\s+(.+)/i,
      /(?:запомни(?: что)?|сохрани(?: что)?)\s+(.+)/i,
      /(?:დაიმახსოვრე(?: რომ)?|შეინახე(?: რომ)?)\s+(.+)/i
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

  function inferConfidence(route, packet, memoryCount) {
    if (route === 'provider' || route === 'server-context-provider') return packet ? 0.72 : 0.45;
    if (route === 'memory-answer') return memoryCount > 0 ? 0.9 : 0.62;
    if (route === 'continuity-answer') return packet?.activeGoal || packet?.topics?.active ? 0.88 : 0.68;
    if (route === 'profile-answer') return packet?.profile ? 0.9 : 0.64;
    if (route === 'browser-answer') return packet?.browser ? 0.86 : 0.55;
    if (route === 'inventory-answer') return packet?.desktopContext ? 0.84 : 0.55;
    if (route === 'status-answer' || route === 'local-reflex') return 0.82;
    return 0.5;
  }

  function providerRequired(route) {
    return route === 'provider' || route === 'server-context-provider';
  }

  function recommendedNext(route, packet) {
    if (providerRequired(route)) return packet ? 'reason-with-server-context' : 'try-provider-or-local-fallback';
    if (route === 'memory-answer') return 'answer-from-memory-only';
    if (route === 'continuity-answer') return 'continue-current-task-from-server-state';
    if (route === 'browser-answer') return 'use-browser-session-state';
    if (route === 'inventory-answer') return 'use-desktop-inventory-state';
    if (route === 'profile-answer') return 'use-profile-identity-state';
    return 'local-response-no-provider';
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

    if (isContinuityQuestion(userMsg) && cloudPacket) {
      return {
        mode: 'continuity-answer',
        reason: 'server-continuity',
        text: window.hexBrainResponseComposer?.continuityReply?.(lang, cloudPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('continuity-answer', systemState, 'server-continuity', { actionPlan, userMsg })
      };
    }

    if (isBrowserQuestion(userMsg) && cloudPacket?.browser) {
      return {
        mode: 'browser-answer',
        reason: 'server-browser-state',
        text: window.hexBrainResponseComposer?.browserReply?.(lang, cloudPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('browser-answer', systemState, 'server-browser-state', { actionPlan, userMsg })
      };
    }

    if (isInventoryQuestion(userMsg) && cloudPacket?.desktopContext) {
      return {
        mode: 'inventory-answer',
        reason: 'server-desktop-context',
        text: window.hexBrainResponseComposer?.inventoryReply?.(lang, cloudPacket) || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('inventory-answer', systemState, 'server-desktop-context', { actionPlan, userMsg })
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
      return {
        mode: 'local-reflex',
        reason: isGreeting(userMsg) ? 'greeting' : 'thanks',
        text: window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || '',
        actions: [],
        hints: buildRouteHints('local-reflex', systemState, isGreeting(userMsg) ? 'greeting' : 'thanks', { actionPlan, userMsg })
      };
    }

    const routeMode = cloudPacket ? 'server-context-provider' : 'provider';
    return {
      mode: routeMode,
      reason: cloudPacket ? 'server-packet-attached' : 'needs-model-reasoning',
      text: null,
      actions: [],
      hints: buildRouteHints(routeMode, systemState, cloudPacket ? 'server-packet-attached' : 'needs-model-reasoning', { actionPlan, userMsg })
    };
  }

  window.hexBrainRouter = {
    version: ROUTE_VERSION,
    route,
    extractCloudMemories,
    localProviderHealth
  };
})();

