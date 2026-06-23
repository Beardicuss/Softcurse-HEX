'use strict';
// ── brain-response-composer.js ───────────────────────────────────────────────
// Local/server reply wording for Brain Router. Keeps routing decisions separate
// from multilingual response composition.

(function () {
  function normalizeLang(lang) {
    const value = String(lang || window._hexConfig?.language || document.documentElement.lang || 'en').toLowerCase();
    if (value.startsWith('ru')) return 'ru';
    if (value.startsWith('ka')) return 'ka';
    return 'en';
  }

  function clean(text) {
    return String(text || '').trim();
  }

  function memoryReply(lang, cloudFacts, localFacts) {
    const l = normalizeLang(lang);
    const facts = [...(cloudFacts || []), localFacts].filter(Boolean).slice(0, 8);
    if (!facts.length) {
      if (l === 'ru') return 'Память подключена, но по этому запросу я не нашёл точных фактов. Скажи, что запомнить, и я сохраню.';
      if (l === 'ka') return 'მეხსიერება ჩართულია, მაგრამ ამ კითხვაზე ზუსტ ფაქტებს ჯერ ვერ ვპოულობ. მითხარი რა დავიმახსოვრო და შევინახავ.';
      return 'Memory is online, but I do not see exact facts for that yet. Tell me what to remember and I will store it.';
    }
    const lead = l === 'ru' ? 'Вот что я помню:' : l === 'ka' ? 'აი რა მახსოვს:' : 'Here is what I remember:';
    return lead + '\n' + facts.map((item) => '- ' + item).join('\n');
  }

  function profileReply(lang, packet, localFacts, cloudFacts = []) {
    const l = normalizeLang(lang);
    const profile = packet?.profile || {};
    const name = clean(profile.displayName) || (l === 'ru' ? 'Данте' : l === 'ka' ? 'დანტე' : 'Dante');
    const language = clean(profile.language) || l;
    const mode = clean(profile.assistantMode) || 'HEX';
    const facts = (cloudFacts || []).concat(localFacts ? [localFacts] : []).slice(0, 4);
    if (l === 'ru') {
      return 'Ты ' + name + '. Профиль сервера активен: язык ' + language + ', режим ассистента ' + mode + '.' + (facts.length ? '\n\nСвязанные факты:\n' + facts.map((item) => '- ' + item).join('\n') : '');
    }
    if (l === 'ka') {
      return 'შენ ხარ ' + name + '. სერვერის პროფილი აქტიურია: ენა ' + language + ', ასისტენტის რეჟიმი ' + mode + '.' + (facts.length ? '\n\nდაკავშირებული ფაქტები:\n' + facts.map((item) => '- ' + item).join('\n') : '');
    }
    return 'You are ' + name + '. Server profile is active: language ' + language + ', assistant mode ' + mode + '.' + (facts.length ? '\n\nRelated facts:\n' + facts.map((item) => '- ' + item).join('\n') : '');
  }

  function continuityReply(lang, packet) {
    const l = normalizeLang(lang);
    const lines = [];
    const push = (label, value) => { if (clean(value)) lines.push(label + ': ' + clean(value)); };
    push('Goal', packet?.activeGoal?.text || packet?.session?.primaryGoal || packet?.workingMemory?.currentTask);
    push('Active topic', packet?.topics?.active?.label);
    push('Last action', packet?.session?.lastActionSummary);
    push('Pending task', (Array.isArray(packet?.unresolvedTasks) ? packet.unresolvedTasks : [])[0]?.text);
    push('Pending follow-up', packet?.dialogue?.pendingFollowUp);
    const recent = (Array.isArray(packet?.relevantTurns) ? packet.relevantTurns : [])
      .slice(-3)
      .map((turn) => (turn.role || 'turn') + ': ' + clean(turn.content))
      .filter((item) => !item.endsWith(': '));
    if (recent.length) lines.push('Recent turns:\n' + recent.map((item) => '- ' + item).join('\n'));
    if (!lines.length) {
      if (l === 'ru') return 'Серверная непрерывность подключена, но активной задачи сейчас нет. Скажи, с чего продолжить, и я закреплю это как текущий фокус.';
      if (l === 'ka') return 'სერვერის უწყვეტობა ჩართულია, მაგრამ აქტიური ამოცანა ახლა არ ჩანს. მითხარი საიდან გავაგრძელოთ და ფოკუსად დავაყენებ.';
      return 'Server continuity is connected, but I do not see an active task right now. Tell me where to continue and I will lock it as the current focus.';
    }
    const head = l === 'ru' ? 'Продолжаем отсюда:' : l === 'ka' ? 'აქედან ვაგრძელებთ:' : 'We continue from here:';
    return head + '\n' + lines.map((item) => '- ' + item).join('\n');
  }

  function browserReply(lang, packet) {
    const l = normalizeLang(lang);
    const browser = packet?.browser || {};
    if (!browser.open) {
      if (l === 'ru') return 'По серверному состоянию браузер сейчас не активен.';
      if (l === 'ka') return 'სერვერის მდგომარეობით ბრაუზერი ახლა აქტიური არ არის.';
      return 'According to server state, the browser is not active right now.';
    }
    const title = clean(browser.title) || (l === 'ru' ? 'без названия' : l === 'ka' ? 'უსათაურო' : 'untitled');
    const url = clean(browser.url) || '-';
    if (l === 'ru') return 'Браузер активен: ' + title + '\n' + url;
    if (l === 'ka') return 'ბრაუზერი აქტიურია: ' + title + '\n' + url;
    return 'Browser is active: ' + title + '\n' + url;
  }

  function inventoryReply(lang, packet) {
    const l = normalizeLang(lang);
    const ctx = packet?.desktopContext || {};
    const groups = [
      ['Apps', ctx.appCandidates],
      ['Games', ctx.gameCandidates],
      ['Files', ctx.fileCandidates],
      ['Folders', ctx.folderCandidates],
      ['Windows', ctx.windowCandidates],
      ['Processes', ctx.processCandidates],
      ['Recent', ctx.promotedRecent],
      ['Highlights', ctx.inventoryHighlights]
    ];
    const lines = [];
    if (clean(ctx.inventorySummary)) lines.push('Summary: ' + clean(ctx.inventorySummary));
    for (const [label, items] of groups) {
      const list = (Array.isArray(items) ? items : []).slice(0, 5).filter(Boolean);
      if (list.length) lines.push(label + ': ' + list.join(', '));
    }
    if (!lines.length) {
      if (l === 'ru') return 'Инвентарь ПК пока пустой или ещё индексируется. Я могу обновить обзор приложений, файлов, окон и процессов.';
      if (l === 'ka') return 'PC ინვენტარი ჯერ ცარიელია ან ინდექსაცია მიმდინარეობს. შემიძლია განვაახლო აპების, ფაილების, ფანჯრების და პროცესების ხედვა.';
      return 'PC inventory is empty or still indexing. I can refresh apps, files, windows, and processes.';
    }
    const head = l === 'ru' ? 'Вот что сейчас видно по ПК:' : l === 'ka' ? 'აი რა ჩანს ახლა კომპიუტერზე:' : 'Here is what I can see about this PC right now:';
    return head + '\n' + lines.map((item) => '- ' + item).join('\n');
  }


  function isDiagnosticsRequest(text) {
    return /debug|diagnostic|telemetry|context packet|memory dump|brain route|show context|покажи контекст|диагност|კონტექსტი|დიაგნოსტ/i.test(text || '');
  }

  function isRawMemoryContext(text) {
    return /\[(SESSION CONTEXT|CONTINUITY MEMORY|KNOWN FACTS ABOUT USER|ACTIVE BROWSER SESSION|SYSTEM STATE)\]/i.test(text || '');
  }

  function summarizeLocalMemory(query) {
    const recall = clean(window.hexBrainCore?.memoryRecall?.(query));
    if (recall && !isRawMemoryContext(recall)) return recall.split('\n').filter(Boolean).slice(0, 3).join('\n');
    try {
      const summary = clean(window.hexMemory?.summary || '');
      return isRawMemoryContext(summary) ? '' : summary.slice(0, 280);
    } catch (_) {
      return '';
    }
  }

  function companionReply(lang, userMsg, systemState = {}) {
    const l = normalizeLang(lang);
    const msg = clean(userMsg);
    const lower = msg.toLowerCase();
    const wantsDiagnostics = isDiagnosticsRequest(msg);
    const asksFeeling = /how are you|are you okay|what'?s up|what up|sup|как ты|ты как|как дела|что нового|როგორ ხარ|კარგად ხარ|რა ხდება/i.test(msg);
    const asksHelp = /what can you do|help me|can you help|что ты можешь|помоги|რა შეგიძლია|დამეხმარ/i.test(msg);

    let base;
    if (asksFeeling) {
      base = l === 'ru'
        ? 'Я здесь, Данте. Локальный мозг включён, контекст держу. Готов слушать или действовать.'
        : l === 'ka'
          ? 'აქ ვარ, დანტე. ლოკალური ბირთვი ჩართულია, კონტექსტს ვიჭერ. მზად ვარ მოვუსმინო ან ვიმოქმედო.'
          : 'I am here, Dante. Local brain is awake, context is staying with us, and I am ready to listen or act.';
    } else if (asksHelp) {
      base = l === 'ru'
        ? 'Да. Я могу вести диалог, помнить важные факты, работать с файлами, приложениями, браузером и простыми командами ПК.'
        : l === 'ka'
          ? 'დიახ. შემიძლია დიალოგი, მნიშვნელოვანი ფაქტების დამახსოვრება, ფაილებთან, აპებთან, ბრაუზერთან და მარტივ ПК ბრძანებებთან მუშაობა.'
          : 'Yes. I can keep dialogue context, remember important facts, work with files, apps, browser state, and simple PC commands.';
    } else if (/^(ok|okay|alright|good|nice|cool|ясно|хорошо|ладно|კარგი|გასაგებია)$/i.test(lower)) {
      base = l === 'ru' ? 'Принял. Держу контекст.' : l === 'ka' ? 'მივიღე. კონტექსტს ვიჭერ.' : 'Understood. I am keeping the context.';
    } else {
      base = l === 'ru'
        ? 'Понял. Продолжаю с текущего контекста.'
        : l === 'ka'
          ? 'გავიგე. მიმდინარე კონტექსტიდან ვაგრძელებ.'
          : 'Understood. I am continuing from the current context.';
    }

    if (!wantsDiagnostics) return base;

    const memory = summarizeLocalMemory(msg);
    const cloud = systemState?.cloudContext || window.hexCloudSync?._contextPacketCache?.packet || null;
    const topic = clean(cloud?.topics?.active?.label || cloud?.activeGoal?.text || cloud?.session?.primaryGoal || '');
    const browser = cloud?.browser?.open && clean(cloud?.browser?.title) ? clean(cloud.browser.title) : '';
    const suffix = [];
    if (topic) suffix.push(l === 'ru' ? 'Фокус: ' + topic : l === 'ka' ? 'ფოკუსი: ' + topic : 'Focus: ' + topic);
    if (browser) suffix.push(l === 'ru' ? 'Браузер: ' + browser : l === 'ka' ? 'ბრაუზერი: ' + browser : 'Browser: ' + browser);
    if (memory) suffix.push(l === 'ru' ? 'Память: ' + memory : l === 'ka' ? 'მეხსიერება: ' + memory : 'Memory: ' + memory);
    return suffix.length ? base + '\n\n' + suffix.slice(0, 3).join('\n') : base;
  }
  function statusReply(lang, systemState, providerHealth) {
    const l = normalizeLang(lang);
    const serverOnline = systemState?.cloudContext ? 'packet-ready' : (window.hexCloudSync?.isEnabled?.() ? 'enabled' : 'disabled');
    const base = l === 'ru'
      ? 'Brain Router онлайн. Локальный мозг активен, серверная память используется максимально, а API-провайдеры считаются нестабильным внешним слоем.'
      : l === 'ka'
        ? 'Brain Router ონლაინ არის. ლოკალური ბირთვი აქტიურია, სერვერის მეხსიერებას მაქსიმალურად ვიყენებ, API პროვაიდერები კი არასტაბილურ გარე ფენად ითვლება.'
        : 'Brain Router is online. Local core is active, server memory is used as much as possible, and API providers are treated as an unstable external layer.';
    const cloud = l === 'ru' ? '\nСервер: ' + serverOnline : l === 'ka' ? '\nსერვერი: ' + serverOnline : '\nServer: ' + serverOnline;
    return base + cloud + (providerHealth ? '\n\nProvider health:\n' + providerHealth : '');
  }

  window.hexBrainResponseComposer = {
    version: '1.0.0',
    memoryReply,
    profileReply,
    continuityReply,
    browserReply,
    inventoryReply,
    statusReply,
    companionReply
  };
})();

