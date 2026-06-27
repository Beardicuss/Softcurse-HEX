'use strict';
// ── brain-action-recovery.js ────────────────────────────────────────────────
// Converts obvious high-confidence action intents into safe local/browser actions
// when provider reasoning fails. It never executes actions directly.

(function () {
  const VERSION = '1.0.0';

  function clean(value) { return String(value || '').trim(); }
  function lower(value) { return clean(value).toLowerCase(); }

  const SITE_MAP = {
    youtube: 'https://youtube.com', yt: 'https://youtube.com',
    google: 'https://google.com', github: 'https://github.com',
    gmail: 'https://mail.google.com', reddit: 'https://reddit.com',
    facebook: 'https://facebook.com', instagram: 'https://instagram.com',
    x: 'https://x.com', twitter: 'https://x.com', tiktok: 'https://tiktok.com'
  };

  function isUnsafe(text) {
    return /\b(delete|remove|wipe|format|shutdown|restart|kill|terminate|uninstall|erase|destroy)\b/i.test(clean(text));
  }

  function directActionText(lang, actionPlan, actions) {
    const first = Array.isArray(actions) ? actions[0] : null;
    const type = String(first?.type || 'action');
    const surface = actionPlan?.suggestedSurface || (type.startsWith('web_') ? 'browser' : 'system');
    if (type === 'web_search') {
      const query = clean(first?.args?.[1] || first?.args?.[0] || '');
      if (lang === 'ru') return 'Открываю браузер и ищу: ' + query + '.';
      if (lang === 'ka') return 'ბრაუზერს ვხსნი და ვეძებ: ' + query + '.';
      return 'Opening the browser and searching for ' + query + '.';
    }
    if (type === 'open_url') {
      if (lang === 'ru') return 'Открываю сайт.';
      if (lang === 'ka') return 'საიტს ვხსნი.';
      return 'Opening the site.';
    }
    if (type === 'web_find_click') {
      const target = clean(first?.args?.[0] || 'that');
      if (lang === 'ru') return 'Работаю в текущем браузере: ' + target + '.';
      if (lang === 'ka') return 'მიმდინარე ბრაუზერში ვასრულებ: ' + target + '.';
      return 'Using the current browser session for ' + target + '.';
    }
    if (type === 'web_back') {
      if (lang === 'ru') return 'Возвращаюсь на предыдущую страницу.';
      if (lang === 'ka') return 'წინა გვერდზე ვბრუნდები.';
      return 'Going back in the current browser session.';
    }
    if (type === 'web_forward') {
      if (lang === 'ru') return 'Перехожу вперед в текущем браузере.';
      if (lang === 'ka') return 'მიმდინარე ბრაუზერში წინ გადავდივარ.';
      return 'Going forward in the current browser session.';
    }
    if (type === 'web_close') {
      if (lang === 'ru') return 'Закрываю текущую браузерную сессию.';
      if (lang === 'ka') return 'მიმდინარე ბრაუზერის სესიას ვხურავ.';
      return 'Closing the current browser session.';
    }
    if (type === 'web_refresh') {
      if (lang === 'ru') return 'Обновляю текущую страницу.';
      if (lang === 'ka') return 'მიმდინარე გვერდს ვაახლებ.';
      return 'Refreshing the current browser page.';
    }
    if (type === 'web_read') {
      if (lang === 'ru') return 'Читаю текущую страницу.';
      if (lang === 'ka') return 'მიმდინარე გვერდს ვკითხულობ.';
      return 'Reading the current browser page.';
    }
    if (type === 'open_settings') {
      if (lang === 'ru') return 'Открываю настройки H.E.X.';
      if (lang === 'ka') return 'H.E.X.-ის პარამეტრებს ვხსნი.';
      return 'Opening HEX settings.';
    }
    if (type === 'open_chat_surface') {
      if (lang === 'ru') return 'Показываю основной интерфейс.';
      if (lang === 'ka') return 'მთავარ ინტერფეისს ვაჩვენებ.';
      return 'Showing the main interface.';
    }
    if (type === 'open_voice_surface') {
      if (lang === 'ru') return 'Открываю голосовой режим.';
      if (lang === 'ka') return 'ხმოვან რეჟიმს ვხსნი.';
      return 'Opening voice mode.';
    }
    if (type === 'close_voice_surface') {
      if (lang === 'ru') return 'Выключаю голосовой режим.';
      if (lang === 'ka') return 'ხმოვან რეჟიმს ვთიშავ.';
      return 'Turning voice mode off.';
    }
    if (type === 'open_folder') {
      const folder = clean(first?.args?.[0] || 'folder');
      if (lang === 'ru') return 'Открываю папку: ' + folder + '.';
      if (lang === 'ka') return 'საქაღალდეს ვხსნი: ' + folder + '.';
      return 'Opening the ' + folder + ' folder.';
    }
    if (type === 'screenshot') {
      if (lang === 'ru') return 'Делаю снимок экрана.';
      if (lang === 'ka') return 'ეკრანის სურათს ვიღებ.';
      return 'Taking a screenshot.';
    }
    if (type === 'sys_info') {
      if (lang === 'ru') return 'Проверяю информацию о системе.';
      if (lang === 'ka') return 'სისტემის ინფორმაციას ვამოწმებ.';
      return 'Checking system information.';
    }
    if (type === 'disk_usage') {
      if (lang === 'ru') return 'Проверяю место на диске.';
      if (lang === 'ka') return 'დისკის გამოყენებას ვამოწმებ.';
      return 'Checking disk usage.';
    }
    if (type === 'battery') {
      if (lang === 'ru') return 'Проверяю батарею.';
      if (lang === 'ka') return 'ბატარეას ვამოწმებ.';
      return 'Checking battery status.';
    }
    if (type === 'get_ip') {
      if (lang === 'ru') return 'Проверяю IP-адреса.';
      if (lang === 'ka') return 'IP მისამართებს ვამოწმებ.';
      return 'Checking IP addresses.';
    }
    if (type === 'system_health') {
      if (lang === 'ru') return 'Проверяю состояние системы.';
      if (lang === 'ka') return 'სისტემის ჯანმრთელობას ვამოწმებ.';
      return 'Checking system health.';
    }
    if (type === 'list_processes') {
      if (lang === 'ru') return 'Показываю текущие процессы.';
      if (lang === 'ka') return 'მიმდინარე პროცესებს ვაჩვენებ.';
      return 'Showing running processes.';
    }
    if (type === 'list_games') {
      if (lang === 'ru') return 'Сканирую установленные игры.';
      if (lang === 'ka') return 'დაყენებულ თამაშებს ვამოწმებ.';
      return 'Scanning installed games.';
    }
    if (type === 'list_software') {
      if (lang === 'ru') return 'Показываю установленные приложения.';
      if (lang === 'ka') return 'დაყენებულ აპლიკაციებს ვაჩვენებ.';
      return 'Showing installed apps.';
    }
    if (type === 'get_clipboard') {
      if (lang === 'ru') return 'Читаю буфер обмена.';
      if (lang === 'ka') return 'ბუფერს ვკითხულობ.';
      return 'Reading the clipboard.';
    }
    if (type === 'set_volume') {
      const level = clean(first?.args?.[0] || '50');
      if (lang === 'ru') return 'Ставлю громкость на ' + level + '%.';
      if (lang === 'ka') return 'ხმას ვაყენებ ' + level + '%-ზე.';
      return 'Setting volume to ' + level + '%.';
    }
    if (type === 'mute') {
      if (lang === 'ru') return 'Выключаю звук.';
      if (lang === 'ka') return 'ხმას ვთიშავ.';
      return 'Muting audio.';
    }
    if (type === 'unmute') {
      if (lang === 'ru') return 'Включаю звук.';
      if (lang === 'ka') return 'ხმას ვრთავ.';
      return 'Unmuting audio.';
    }
    if (type === 'lock_screen') {
      if (lang === 'ru') return 'Блокирую экран.';
      if (lang === 'ka') return 'ეკრანს ვკეტავ.';
      return 'Locking the screen.';
    }
    if (type === 'open_app') {
      const target = clean(first?.args?.[0] || 'app');
      if (lang === 'ru') return 'Открываю приложение: ' + target + '.';
      if (lang === 'ka') return 'აპლიკაციას ვხსნი: ' + target + '.';
      return 'Opening ' + target + '.';
    }
    if (type === 'launch_game') {
      const target = clean(first?.args?.[0] || 'game');
      if (lang === 'ru') return 'Запускаю игру: ' + target + '.';
      if (lang === 'ka') return 'თამაშს ვუშვებ: ' + target + '.';
      return 'Launching ' + target + '.';
    }
    if (type === 'open_file') {
      const target = clean(first?.meta?.resolvedLabel || first?.args?.[0] || 'file');
      if (lang === 'ru') return 'Открываю файл: ' + target + '.';
      if (lang === 'ka') return 'ფაილს ვხსნი: ' + target + '.';
      return 'Opening ' + target + '.';
    }
    if (lang === 'ru') return 'Выполняю безопасное локальное действие через ' + surface + '.';
    if (lang === 'ka') return 'უსაფრთხო ლოკალურ მოქმედებას ვასრულებ: ' + surface + '.';
    return 'Executing the safe local action through ' + surface + '.';
  }

  function actionText(lang, actionPlan, actions) {
    const surface = actionPlan?.suggestedSurface || 'system';
    if (lang === 'ru') return 'Провайдер недоступен, но я понял команду. Выполняю безопасное локальное действие через ' + surface + '.';
    if (lang === 'ka') return 'პროვაიდერი მიუწვდომელია, მაგრამ ბრძანება გავიგე. უსაფრთხო ლოკალურ მოქმედებას ვასრულებ: ' + surface + '.';
    return 'Provider reasoning is unavailable, but I understood the command. Executing the safe local action through ' + surface + '.';
  }

  function parseSiteSearch(text) {
    const raw = clean(text);
    const match = raw.match(/^(?:open|go\s+to|visit|browse\s+to)\s+([a-z0-9 ._-]+?)\s+(?:and\s+)?(?:search|find|look\s+for)\s+(?:for\s+)?(.+)$/i);
    if (!match) return null;
    const site = lower(match[1]).replace(/^the\s+/, '');
    const query = clean(match[2]).replace(/^the\s+/i, '');
    const url = SITE_MAP[site];
    return url && query ? { type: 'web_search', args: [url, query] } : null;
  }

  function normalizeSiteName(value) {
    return lower(value).replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
  }

  function parseSearchOnSite(text) {
    const raw = clean(text);
    let match = raw.match(/^(?:search|find|look\s+for)\s+(.+?)\s+(?:on|in)\s+([a-z0-9 ._-]+)$/i);
    if (match) {
      const query = clean(match[1]).replace(/^the\s+/i, '');
      const url = SITE_MAP[normalizeSiteName(match[2])];
      return url && query ? { type: 'web_search', args: [url, query] } : null;
    }

    match = raw.match(/^([a-z0-9 ._-]+?)\s+(?:search|find|look\s+for)\s+(.+)$/i);
    if (match) {
      const url = SITE_MAP[normalizeSiteName(match[1])];
      const query = clean(match[2]).replace(/^the\s+/i, '');
      return url && query ? { type: 'web_search', args: [url, query] } : null;
    }
    return null;
  }

  function parsePlayOnSite(text) {
    const raw = clean(text);
    const match = raw.match(/^(?:play|watch|stream)\s+(.+?)\s+(?:on|in)\s+(youtube|yt|tiktok)$/i);
    if (!match) return null;
    const query = clean(match[1]).replace(/^the\s+/i, '');
    const url = SITE_MAP[normalizeSiteName(match[2])];
    return url && query ? { type: 'web_search', args: [url, query] } : null;
  }

  function parseBrowserControl(text, systemState = {}) {
    const raw = lower(text);
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open;
    if (!browserOpen) return null;
    if (/^(?:go\s+)?back(?:\s+(?:page|tab))?$/.test(raw)) return { type: 'web_back', args: [] };
    if (/^(?:go\s+)?forward(?:\s+(?:page|tab))?$/.test(raw)) return { type: 'web_forward', args: [] };
    if (/^(?:close|exit|hide)(?:\s+(?:the\s+)?)?(?:browser|browser\s+session|web\s+session)$/.test(raw)) return { type: 'web_close', args: [] };
    if (/^(?:refresh|reload)(?:\s+(?:page|tab|browser))?$/.test(raw)) return { type: 'web_refresh', args: [] };
    if (/^(?:read|summarize|scan)(?:\s+(?:this|current|the))?(?:\s+(?:page|tab|site|website))?$/.test(raw)) return { type: 'web_read', args: [] };
    return null;
  }

  function parseOpenSite(text) {
    const raw = clean(text);
    const match = raw.match(/^(?:open|go\s+to|visit|browse\s+to)\s+(.+)$/i);
    if (!match) return null;
    const target = lower(match[1]).replace(/^the\s+/, '');
    if (SITE_MAP[target]) return { type: 'open_url', args: [SITE_MAP[target]] };
    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(match[1]) || /^[a-z0-9-]+\.(com|org|net|io|dev|app|co|tv|gg|ai|me)\b/i.test(match[1])) {
      const url = /^https?:\/\//i.test(match[1]) ? match[1] : 'https://' + match[1].replace(/^www\./i, '');
      return { type: 'open_url', args: [url] };
    }
    return null;
  }


  function packetHealth(systemState = {}) {
    const packet = systemState?.cloudContext || null;
    return packet?.contextPacketHealth || window.hexBrainRouterPacketHealth?.(packet) || window.hexCloudContextRehydrator?.getPacketHealth?.(packet) || null;
  }

  function cloudPriorityUsable(systemState = {}, purpose = 'session') {
    const health = packetHealth(systemState);
    if (!health) return true;
    const level = String(health.level || '').toLowerCase();
    if (!level || level === 'ready') return true;
    if (level === 'partial') {
      const issues = Array.isArray(health.issues) ? health.issues.map((item) => String(item || '').toLowerCase()) : [];
      if (purpose === 'browser' && issues.some((item) => item.includes('browser'))) return false;
      if (purpose === 'inventory' && issues.some((item) => item.includes('inventory'))) return false;
      return !issues.some((item) => item.includes('all-context-stale'));
    }
    return !/^(stale|degraded|invalid)$/.test(level);
  }

  function getPriorityView(systemState = {}) {
    return systemState?.cloudContext?.desktopPriorityView || window.hexCloudContextRehydrator?.getPriorityView?.(systemState?.cloudContext) || null;
  }

  function activeBrowserPriority(systemState = {}) {
    if (!cloudPriorityUsable(systemState, 'browser')) return null;
    const view = getPriorityView(systemState);
    return (view?.active || []).find((item) => String(item?.purpose || item?.kind || '').toLowerCase() === 'browser') || null;
  }
  function liveContext(systemState = {}) {
    return systemState.localLiveContext || window.hexContextState?.getLiveContextFreshness?.() || null;
  }

  function browserTargetFrom(value = null, fallbackSource = 'local-live-context') {
    if (!value || typeof value !== 'object') return null;
    const surface = String(value.surface || value.source || value.kind || '').toLowerCase();
    if (!/(browser|web|video|result|link)/.test(surface)) return null;
    const label = clean(value.label || value.text || value.value || value.title || value.url || '');
    if (!label) return null;
    return {
      label,
      source: value.source || fallbackSource,
      surface: value.surface || value.kind || 'browser',
      fresh: value.fresh === true,
      index: Number.isFinite(Number(value.index)) ? Number(value.index) : null
    };
  }

  function bestLiveBrowserTarget(systemState = {}) {
    const live = liveContext(systemState);
    const browser = live?.browser || null;
    if (browser?.open !== true) return null;
    const best = browserTargetFrom(live?.bestTarget || browser?.bestTarget, 'local-live-best-target');
    if (best && (best.fresh || browser.candidatesFresh === true)) return best;
    const last = browserTargetFrom(live?.lastResolvedReference, 'local-live-context');
    if (last) return last;
    return best || null;
  }

  function hasFreshBrowserLiveTarget(systemState = {}) {
    const live = liveContext(systemState);
    const browser = live?.browser || null;
    if (bestLiveBrowserTarget(systemState)) return true;
    if (browser?.open === true && browser.candidatesFresh === true && Number(browser.candidateCount || 0) > 0) return true;
    return false;
  }

  function liveBrowserReference(systemState = {}) {
    return bestLiveBrowserTarget(systemState);
  }

  function isReferentialBrowserText(text = '') {
    const raw = lower(text);
    return /^(?:that|this|it|that one|this one|same one)$/.test(raw)
      || /^(?:open|click|play|select|choose)\s+(?:that|this|it|that one|this one|same one)$/.test(raw)
      || /^(?:open|click|play|select|choose)\s+(?:the\s+)?(?:same|current|selected)\s+(?:video|result|link|item)$/.test(raw);
  }

  function missingLiveTargetText(lang, reason, systemState = {}) {
    const l = String(lang || 'en').toLowerCase();
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open || !!liveContext(systemState)?.browser?.open;
    if (l.startsWith('ru')) {
      return browserOpen
        ? 'Я понял, что это ссылка на текущий браузер, но у меня нет свежей цели для "это". Обнови страницу, скажи название результата, или дай команду вроде "open third video" после поиска.'
        : 'Я понял ссылку, но активной браузерной сессии сейчас не вижу. Открой страницу или скажи, что искать.';
    }
    if (l.startsWith('ka')) {
      return browserOpen
        ? 'ვხვდები, რომ მიმდინარე ბრაუზერს გულისხმობ, მაგრამ "ეს"-ისთვის ახალი სამიზნე არ მაქვს. განაახლე გვერდი, მითხარი შედეგის სახელი, ან ძებნის შემდეგ თქვი "open third video".'
        : 'მივხვდი მინიშნებას, მაგრამ აქტიურ ბრაუზერის სესიას ახლა ვერ ვხედავ. გახსენი გვერდი ან მითხარი რას მოვძებნო.';
    }
    return browserOpen
      ? 'I know this refers to the current browser, but I do not have a fresh target for "that one". Refresh/read the page, name the result, or say something like "open third video" after a search.'
      : 'I understand the reference, but I do not see an active browser session right now. Open a page or tell me what to search for.';
  }

  function explainMissingBrowserTarget({ userMsg = '', systemState = {}, lang = 'en' } = {}) {
    const text = clean(userMsg);
    if (!isReferentialBrowserText(text)) return null;
    const active = activeBrowserPriority(systemState);
    const local = window.resolveSessionReference?.(text, 'browser') || null;
    if (active || local || hasFreshBrowserLiveTarget(systemState)) return null;
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open || !!liveContext(systemState)?.browser?.open;
    return {
      reason: browserOpen ? 'no-fresh-browser-target' : 'no-active-browser-session',
      text: missingLiveTargetText(lang, browserOpen ? 'no-fresh-browser-target' : 'no-active-browser-session', systemState),
      actions: [],
      localLiveContext: liveContext(systemState),
      browserOpen
    };
  }


  function activeDesktopPriority(systemState = {}) {
    if (!cloudPriorityUsable(systemState, 'inventory')) return null;
    const view = getPriorityView(systemState);
    return (view?.active || []).find((item) => {
      const kind = String(item?.kind || '').toLowerCase();
      const purpose = String(item?.purpose || '').toLowerCase();
      if (purpose === 'browser' || kind === 'browser') return false;
      return ['app', 'game', 'file', 'folder'].includes(kind);
    }) || null;
  }

  function actionForDesktopTarget(item = {}, source = 'desktop-memory') {
    const kind = String(item?.kind || '').toLowerCase();
    const label = clean(item?.label || item?.value || item?.path || '');
    const path = clean(item?.path || item?.value || label);
    if (!label && !path) return null;
    const meta = {
      resolvedLabel: label || path,
      resolvedKind: kind || 'item',
      resolvedSource: item?.source || source,
      resolvedPath: item?.path || null,
      priorityPurpose: item?.purpose || item?.surface || 'inventory'
    };
    if (kind === 'game') return { type: 'launch_game', args: [label || path], meta };
    if (kind === 'app') return { type: 'open_app', args: [label || path], meta };
    if (kind === 'folder') return { type: 'open_folder', args: [path || label], meta };
    if (kind === 'file') return { type: 'open_file', args: [path || label], meta };
    if (kind === 'window') return { type: 'window', args: ['focus', label || path], meta };
    return null;
  }

  function actionForPriorityDesktopTarget(item = {}) {
    return actionForDesktopTarget({ ...item, source: 'cloud-priority-view' }, 'cloud-priority-view');
  }

  function bestLiveDesktopTarget(systemState = {}) {
    const live = liveContext(systemState);
    const best = live?.desktopBestTarget || live?.bestDesktopTarget || null;
    if (best && best.fresh === true && String(best.surface || '').toLowerCase() !== 'browser') return best;
    const top = live?.bestTarget || null;
    if (top && top.fresh === true && String(top.surface || '').toLowerCase() === 'desktop') return top;
    return null;
  }

  function parsePriorityDesktopFollowUp(text, systemState = {}) {
    const raw = clean(text);
    const active = activeDesktopPriority(systemState);
    const liveTarget = bestLiveDesktopTarget(systemState);
    if (!active && !liveTarget) return null;
    const targetOnly = /^(?:that|this|it|that one|this one|same one)$/i.test(raw);
    const actionMatch = raw.match(/^(?:open|launch|run|play|show|select|choose|focus)\s+(?:that|this|it|that one|this one|same one)$/i)
      || raw.match(/^(?:open|launch|run|play|show|focus)\s+(?:the\s+)?(?:same|current|selected)\s+(?:app|game|file|folder|window|item)$/i);
    if (!targetOnly && !actionMatch) return null;
    return active ? actionForPriorityDesktopTarget(active) : actionForDesktopTarget(liveTarget, liveTarget.source || 'local-live-best-target');
  }
  function parsePriorityBrowserFollowUp(text, systemState = {}) {
    const raw = clean(text);
    const lowered = lower(raw);
    const active = activeBrowserPriority(systemState);
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open || !!active;
    if (!browserOpen) return null;
    if (/^(?:continue|go on|resume)(?:\s+(?:there|that|it|the page))?$/.test(lowered)) return { type: 'web_read', args: [] };
    const targetOnly = /^(?:that|this|it|that one|this one|same one)$/i.test(raw);
    const actionMatch = raw.match(/^(?:open|click|play|select|choose)\s+(?:that|this|it|that one|this one|same one)$/i);
    if (!targetOnly && !actionMatch) return null;
    if (active) {
      const label = clean(active.label || active.value || active.path || 'that');
      return { type: 'web_find_click', args: [label], meta: { resolvedLabel: label, resolvedSource: 'cloud-priority-view', priorityPurpose: active.purpose || 'browser' } };
    }
    const liveRef = liveBrowserReference(systemState);
    if (liveRef) {
      return { type: 'web_find_click', args: [liveRef.label], meta: { resolvedLabel: liveRef.label, resolvedSource: liveRef.source, priorityPurpose: liveRef.surface || 'browser' } };
    }
    const local = window.resolveSessionReference?.(raw, 'browser') || null;
    if (!local) return null;
    const label = clean(local.label || local.text || local.value || local.path || 'that');
    return { type: 'web_find_click', args: [label], meta: { resolvedLabel: label, resolvedSource: local.source || 'live-browser-candidates', priorityPurpose: 'browser' } };
  }
  function parseBrowserFollowUp(text, systemState = {}) {
    const raw = clean(text);
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open;
    if (!browserOpen) return null;
    const match = raw.match(/^(?:open|click|play|select|choose|read)\s+(.+)$/i);
    if (!match) return null;
    const target = clean(match[1]);
    if (!target) return null;
    if (/\bread\b/i.test(raw)) return { type: 'web_read', args: [] };
    return { type: 'web_find_click', args: [target] };
  }

  function parseLocalUtilityAction(text) {
    const raw = lower(text);
    if (/^(?:take\s+(?:a\s+)?)?(?:screenshot|screen\s+shot)$/.test(raw) || /^capture\s+(?:the\s+)?(?:screen|desktop)$/.test(raw)) {
      return { type: 'screenshot', args: [] };
    }
    if (/^(?:system\s+info|sys\s*info|pc\s+info|computer\s+info|show\s+system\s+info)$/.test(raw) || /^(?:what|which)\s+(?:cpu|processor|ram|os)\b/.test(raw)) {
      return { type: 'sys_info', args: [] };
    }
    if (/^(?:disk\s+(?:usage|space)|storage\s+(?:usage|space)|check\s+disk(?:\s+space)?)$/.test(raw)) {
      return { type: 'disk_usage', args: [] };
    }
    if (/^(?:battery|battery\s+status|check\s+battery)$/.test(raw)) {
      return { type: 'battery', args: [] };
    }
    if (/^(?:my\s+ip|ip|ip\s+address|what(?:'s|\s+is)\s+my\s+ip|get\s+ip)$/.test(raw)) {
      return { type: 'get_ip', args: [] };
    }
    if (/^(?:system\s+health|pc\s+health|health\s+check|check\s+system\s+health)$/.test(raw)) {
      return { type: 'system_health', args: [] };
    }
    if (/^(?:open|show|bring\s+up)\s+(?:hex\s+)?settings$/.test(raw) || raw === 'settings') {
      return { type: 'open_settings', args: [] };
    }
    if (/^(?:open|show|return\s+to|bring\s+back)\s+(?:the\s+)?(?:chat|main\s+chat|normal\s+interface|default\s+interface)$/.test(raw) || /^(?:show|open)\s+(?:the\s+)?interface$/.test(raw)) {
      return { type: 'open_chat_surface', args: [] };
    }
    if (/^(?:open|show|return\s+to|bring\s+back|enter|activate)\s+(?:the\s+)?(?:voice\s+mode|agi\s+mode|hologram|ghost\s+deck)$/.test(raw) || raw === 'ghost deck') {
      return { type: 'open_voice_surface', args: [] };
    }
    if (/^(?:close|exit|disable|turn\s+off|switch\s+off|shut\s+down|stop|deactivate)\s+(?:the\s+)?(?:voice\s+mode|voice\s+surface|agi\s+mode|hologram|ghost\s+deck|command\s+deck)$/.test(raw) || /^(?:voice\s+mode|voice\s+surface|agi\s+mode|hologram|ghost\s+deck|command\s+deck)\s+(?:off|offline|down)$/.test(raw) || /^(?:return\s+to\s+cockpit|back\s+to\s+cockpit|normal\s+interface)$/.test(raw) || /^(?:hide|close)\s+(?:the\s+)?interface$/.test(raw)) {
      return { type: 'close_voice_surface', args: [] };
    }
    if (/^(?:show|get|read)\s+(?:the\s+)?clipboard$/.test(raw) || raw === 'what is in clipboard') {
      return { type: 'get_clipboard', args: [] };
    }
    const volumeMatch = raw.match(/^(?:set\s+(?:the\s+)?volume\s+(?:to\s+)?|volume\s+)(\d{1,3})%?$/);
    if (volumeMatch) {
      const level = Math.max(0, Math.min(100, parseInt(volumeMatch[1], 10) || 50));
      return { type: 'set_volume', args: [String(level)] };
    }
    if (raw === 'mute' || /^mute\s+(?:audio|sound|volume)$/.test(raw)) return { type: 'mute', args: [] };
    if (raw === 'unmute' || /^unmute\s+(?:audio|sound|volume)$/.test(raw)) return { type: 'unmute', args: [] };
    if (/^lock\s+(?:the\s+)?(?:screen|pc|computer|workstation)$/.test(raw) || raw === 'lock') {
      return { type: 'lock_screen', args: [] };
    }
    if (/^(?:show|list|scan|what(?:'s|\s+is))\s+(?:running\s+)?(?:processes|tasks)(?:\s+running)?$/.test(raw) || raw === 'what is running') {
      return { type: 'list_processes', args: [] };
    }
    if (/^(?:list|show|scan)\s+(?:my\s+)?(?:games|game\s+library)$/.test(raw)) {
      return { type: 'list_games', args: [] };
    }
    if (/^(?:list|show|scan)\s+(?:my\s+)?(?:apps|applications|programs|software)$/.test(raw)) {
      return { type: 'list_software', args: [] };
    }
    return null;
  }

  function preferredDesktopKind(text) {
    const raw = lower(text);
    if (/\b(game|steam|epic)\b/.test(raw)) return 'game';
    if (/\b(app|program|software)\b/.test(raw)) return 'app';
    if (/\b(folder|directory|location)\b/.test(raw)) return 'folder';
    if (/\b(file|document|image|video|song|track|photo|pdf)\b/.test(raw)) return 'file';
    return null;
  }

  function actionForResolvedDesktopTarget(resolved) {
    if (!resolved || resolved.surface === 'browser' || resolved.source === 'browser') return null;
    const kind = String(resolved.kind || '').toLowerCase();
    const label = clean(resolved.label || resolved.value || resolved.path || '');
    const path = clean(resolved.path || resolved.value || label);
    if (!label && !path) return null;
    const meta = {
      resolvedLabel: label || path,
      resolvedKind: kind || 'item',
      resolvedSource: resolved.source || 'desktop-memory',
      resolvedPath: resolved.path || null
    };
    if (kind === 'game') return { type: 'launch_game', args: [label || path], meta };
    if (kind === 'app') return { type: 'open_app', args: [label || path], meta };
    if (kind === 'folder') return { type: 'open_folder', args: [path || label], meta };
    if (kind === 'file') return { type: 'open_file', args: [path || label], meta };
    if (kind === 'window') return { type: 'window', args: ['focus', label || path], meta };
    return null;
  }

  function parseResolvedDesktopAction(text, systemState = {}) {
    const raw = clean(text);
    if (!window.hexReferenceResolver?.isDesktopReferenceCommand?.(raw)) return null;
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open;
    const resolved = window.hexReferenceResolver?.resolveMixedReference?.(raw, browserOpen)
      || window.hexReferenceResolver?.resolveDesktopReference?.(raw, preferredDesktopKind(raw));
    return actionForResolvedDesktopTarget(resolved);
  }
  function parseDesktopAction(text) {
    const raw = clean(text);
    let match = raw.match(/^(?:open|play|launch|start)\s+(?:my\s+)?(?:music\s+)?playlist\s+["'“”]?(.+?)["'“”]?$/i);
    if (match) return { type: 'open_playlist', args: [clean(match[1]).replace(/\b(?:playlist|file)$/i, '').trim()] };
    match = raw.match(/^(?:launch|play|start|run)\s+(.+)$/i);
    if (match) return { type: 'launch_game', args: [clean(match[1])] };
    match = raw.match(/^(?:open|run|launch)\s+(?:app|program|software)\s+(.+)$/i);
    if (match) return { type: 'open_app', args: [clean(match[1])] };
    match = raw.match(/^(?:open|show|reveal|locate)\s+(?:file|document)\s+(.+)$/i);
    if (match) return { type: 'open_file', args: [clean(match[1])] };
    match = raw.match(/^(?:open|show|go\s+to)\s+(desktop|documents|downloads|pictures|music|videos)(?:\s+folder)?$/i);
    if (match) return { type: 'open_folder', args: [lower(match[1])] };
    return null;
  }

  function withRecoveryMeta(action, plan) {
    if (!action) return null;
    return {
      ...action,
      meta: {
        ...(action.meta || {}),
        source: 'brain-action-recovery',
        reason: 'provider-failure-action-recovery',
        recoveredFromProviderFailure: true,
        domain: plan?.domain || null,
        surface: plan?.suggestedSurface || null
      }
    };
  }

  function collectSafeActions({ userMsg = '', systemState = {}, actionPlan = null } = {}) {
    const text = clean(userMsg);
    const plan = actionPlan || systemState?.brainPreflightPlan || window.hexBrainActionPlanner?.classify?.(text, systemState) || null;
    if (!text || isUnsafe(text)) return null;
    const browserControl = parseBrowserControl(text, systemState);
    const priorityBrowserFollowUp = parsePriorityBrowserFollowUp(text, systemState);
    const priorityDesktopFollowUp = parsePriorityDesktopFollowUp(text, systemState);
    const domain = String(plan?.domain || '').toLowerCase();
    const urgency = String(plan?.urgency || '').toLowerCase();
    const isAction = !!browserControl || !!priorityBrowserFollowUp || !!priorityDesktopFollowUp || domain.includes('action') || domain.includes('follow-up') || urgency === 'high';
    if (!isAction) return null;

    const candidates = [
      parseSiteSearch(text),
      parseSearchOnSite(text),
      parsePlayOnSite(text),
      browserControl,
      priorityBrowserFollowUp,
      parseBrowserFollowUp(text, systemState),
      parseOpenSite(text),
      parseLocalUtilityAction(text),
      priorityDesktopFollowUp,
      parseResolvedDesktopAction(text, systemState),
      parseDesktopAction(text)
    ].filter(Boolean).map((action) => withRecoveryMeta(action, plan));
    if (!candidates.length) return null;
    return { candidates, plan };
  }

  function actionsForProviderFailure({ userMsg = '', systemState = {}, lang = 'en', actionPlan = null } = {}) {
    const collected = collectSafeActions({ userMsg, systemState, actionPlan });
    if (!collected) return null;
    const { candidates, plan } = collected;

    return {
      text: actionText(lang, plan, candidates),
      actions: candidates.slice(0, 2),
      reason: 'provider-failure-action-recovery',
      plan
    };
  }

  function actionsForObviousBrowserCommand({ userMsg = '', systemState = {}, lang = 'en', actionPlan = null } = {}) {
    const collected = collectSafeActions({ userMsg, systemState, actionPlan });
    if (!collected) return null;
    const { candidates, plan } = collected;
    const browserActions = candidates.filter((action) => action.type === 'web_search' || action.type === 'web_find_click' || action.type === 'web_read' || action.type === 'web_back' || action.type === 'web_forward' || action.type === 'web_refresh' || action.type === 'web_close' || action.type === 'open_url');
    if (!browserActions.length) return null;
    const directActions = browserActions.map((action) => ({
      ...action,
      meta: {
        ...(action.meta || {}),
        reason: 'direct-browser-action',
        recoveredFromProviderFailure: false
      }
    }));
    return {
      text: directActionText(lang, plan, directActions),
      actions: directActions.slice(0, 2),
      reason: 'direct-browser-action',
      plan
    };
  }

  function actionsForObviousLocalCommand({ userMsg = '', systemState = {}, lang = 'en', actionPlan = null } = {}) {
    const collected = collectSafeActions({ userMsg, systemState, actionPlan });
    if (!collected) return null;
    const { candidates, plan } = collected;
    const safeLocalTypes = new Set(['open_folder', 'screenshot', 'sys_info', 'disk_usage', 'battery', 'get_ip', 'system_health', 'open_settings', 'open_chat_surface', 'open_voice_surface', 'close_voice_surface', 'list_processes', 'list_games', 'list_software', 'get_clipboard', 'set_volume', 'mute', 'unmute', 'lock_screen', 'open_app', 'launch_game', 'open_file', 'open_playlist', 'window']);
    const localActions = candidates.filter((action) => safeLocalTypes.has(action.type));
    if (!localActions.length) return null;
    const directActions = localActions.map((action) => ({
      ...action,
      meta: {
        ...(action.meta || {}),
        reason: 'direct-local-action',
        recoveredFromProviderFailure: false
      }
    }));
    return {
      text: directActionText(lang, plan, directActions),
      actions: directActions.slice(0, 2),
      reason: 'direct-local-action',
      plan
    };
  }
  window.hexBrainActionRecovery = {
    version: VERSION,
    actionsForProviderFailure,
    actionsForObviousBrowserCommand,
    explainMissingBrowserTarget,
    actionsForObviousLocalCommand
  };
})();
