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
    let match = raw.match(/^(?:launch|play|start|run)\s+(.+)$/i);
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
    const domain = String(plan?.domain || '').toLowerCase();
    const urgency = String(plan?.urgency || '').toLowerCase();
    const isAction = !!browserControl || domain.includes('action') || domain.includes('follow-up') || urgency === 'high';
    if (!isAction) return null;

    const candidates = [
      parseSiteSearch(text),
      parseSearchOnSite(text),
      parsePlayOnSite(text),
      browserControl,
      parseBrowserFollowUp(text, systemState),
      parseOpenSite(text),
      parseLocalUtilityAction(text),
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
    const browserActions = candidates.filter((action) => action.type === 'web_search' || action.type === 'web_find_click' || action.type === 'web_read' || action.type === 'web_back' || action.type === 'web_refresh' || action.type === 'open_url');
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
    const safeLocalTypes = new Set(['open_folder', 'screenshot', 'sys_info', 'disk_usage', 'battery', 'get_ip', 'system_health', 'open_app', 'launch_game', 'open_file']);
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
    actionsForObviousLocalCommand
  };
})();










