'use strict';
// ── brain-action-planner.js ─────────────────────────────────────────────────
// Lightweight intent planner. It classifies the turn but never executes actions.

(function () {
  const VERSION = '1.0.0';

  function clean(text) { return String(text || '').trim(); }
  function lower(text) { return clean(text).toLowerCase(); }
  function has(pattern, text) { return pattern.test(text); }

  function classify(userMsg, systemState = {}) {
    const raw = clean(userMsg);
    const t = lower(raw);
    const browserOpen = !!systemState?.browserSession?.open || !!systemState?.cloudContext?.browser?.open;
    const hasResolvedRef = !!(systemState?.sessionContext?.resolvedReference || systemState?.sessionContext?.lastResolvedReference);
    const hasDesktopContext = !!systemState?.desktopContext || !!systemState?.cloudContext?.desktopContext;
    const reasons = [];
    let domain = 'dialogue';
    let urgency = 'normal';
    let providerNeeded = false;
    let suggestedSurface = systemState?.sessionContext?.activeSurface || 'chat';

    if (has(/\b(remember that|remember|save that|запомни|сохрани|დაიმახსოვრე|შეინახე)\b/i, raw)) {
      domain = 'memory-write';
      suggestedSurface = 'memory';
      reasons.push('explicit-memory-command');
    } else if (has(/\b(what do you remember|what do you know about me|memory|памят|что знаешь|მეხსიერ|რა გახსოვს)\b/i, raw)) {
      domain = 'memory-read';
      suggestedSurface = 'memory';
      reasons.push('memory-question');
    } else if (browserOpen && has(/\b(open|click|play|select|read|go back|back|forward|refresh|third|second|first|video|result|link|button|page)\b/i, t)) {
      domain = 'browser-action';
      suggestedSurface = 'browser';
      urgency = 'high';
      reasons.push('browser-open-follow-up');
    } else if (has(/\b(open|launch|run|show|reveal|locate|focus|close|kill|list|scan|find|search|file|folder|app|game|window|process|clipboard|screenshot|volume|mute|lock)\b/i, t)) {
      domain = 'desktop-action';
      suggestedSurface = 'desktop';
      urgency = 'high';
      reasons.push(hasDesktopContext ? 'desktop-context-available' : 'desktop-command-pattern');
    } else if (has(/\b(who am i|what'?s my name|profile|кто я|как меня зовут|профиль|ვინ ვარ|რა მქვია|პროფილი)\b/i, raw)) {
      domain = 'profile';
      suggestedSurface = 'memory';
      reasons.push('profile-question');
    } else if (has(/\b(continue|where did we stop|what are we doing|current goal|last task|продолжай|где остановились|что дальше|გააგრძელე|სად გავჩერდით)\b/i, raw)) {
      domain = 'continuity';
      suggestedSurface = systemState?.cloudContext?.browser?.open ? 'browser' : 'chat';
      reasons.push('continuity-question');
    } else if (has(/\b(explain|why|how|what is|tell me|think|plan|recommend|compare|объясни|почему|как|расскажи|что такое|ამიხსენი|რატომ|როგორ)\b/i, raw)) {
      domain = 'reasoning';
      providerNeeded = true;
      reasons.push('general-reasoning');
    } else if (hasResolvedRef || has(/\b(it|that|this|same|first|second|third|last|next|previous|это|то|перв|втор|трет|იგი|ეს|ის|პირველ|მეორე|მესამე)\b/i, raw)) {
      domain = browserOpen ? 'browser-follow-up' : 'desktop-follow-up';
      suggestedSurface = browserOpen ? 'browser' : 'desktop';
      urgency = 'high';
      reasons.push('referential-follow-up');
    }

    if (domain.endsWith('action') || domain.endsWith('follow-up')) providerNeeded = false;
    if (domain === 'reasoning') providerNeeded = true;

    return {
      version: VERSION,
      domain,
      suggestedSurface,
      urgency,
      providerNeeded,
      browserOpen,
      hasResolvedReference: hasResolvedRef,
      hasDesktopContext,
      reasons: reasons.length ? reasons : ['dialogue-default']
    };
  }

  window.hexBrainActionPlanner = { version: VERSION, classify };
})();
