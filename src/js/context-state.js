'use strict';

window.hexContextState = (() => {
  const MAX_RECENT_MESSAGES = 8;
  const MAX_RECENT_ENTITIES = 16;
  const MAX_RECENT_TOPICS = 10;

  const state = {
    primaryGoal: '',
    lastUserMessage: '',
    lastAssistantMessage: '',
    lastUserWasFollowUp: false,
    lastActionTypes: [],
    lastActionSummary: '',
    lastSystemDataSummary: '',
    activeSurface: 'chat',
    lastTouchedAt: null,
    recentUserMessages: [],
    recentAssistantSummaries: [],
    recentEntities: [],
    activeTopics: [],
    referenceCandidates: [],
    browserSnapshot: { open: false, url: null, title: null },
    browserCandidates: [],
    lastResolvedReference: null
  };

  function uniqueTrimmed(list, max) {
    const seen = new Set();
    const result = [];
    (list || []).forEach((value) => {
      const clean = String(value || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(clean);
    });
    return result.slice(0, max);
  }

  function trimTail(list, max) {
    return Array.isArray(list) ? list.slice(-max) : [];
  }

  function isLikelyFollowUpMessage(text) {
    const raw = (text || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const shortContextualCommand = words.length <= 10 && /^(open|play|click|read|scroll|focus|select|choose|use|try|continue|resume|show|tell|find|pick|press|back|forward|refresh|reload|close)\b/.test(lower);
    const hasReferenceLanguage = /\b(it|that|this|them|those|these|one|ones|first|second|third|fourth|fifth|last|next|previous|same|there|here|result|video|song|page|button|link)\b/.test(lower);

    if (/^(and|also|then|now|again|next|continue|go on|keep going)\b/.test(lower)) return true;
    if (/^(open|play|click|read|scroll|focus|select|choose|use|try)\s+(it|that|this|them|those|these|one|ones|first|second|third|fourth|fifth|last|next|previous)\b/.test(lower)) return true;
    if (/^(open|play|click|read)\s+(the\s+)?(first|second|third|fourth|fifth|last|next)\b/.test(lower)) return true;
    if (/^(go back|back|forward|refresh|reload|scroll down|scroll up|read the page|close it|click it|open it|play it)$/.test(lower)) return true;
    if (words.length <= 6 && /\b(it|that|this|them|those|these|one|ones|first|second|third|fourth|fifth|last|next|previous|same|there)\b/.test(lower)) return true;
    if (shortContextualCommand && hasReferenceLanguage) return true;
    if (shortContextualCommand && words.length <= 4) return true;
    return false;
  }

  function extractSessionEntities(text) {
    const source = String(text || '');
    const entities = [];
    const seen = new Set();

    const pushEntity = (value) => {
      const clean = String(value || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      entities.push(clean);
    };

    (source.match(/https?:\/\/[^\s]+/gi) || []).forEach(pushEntity);
    (source.match(/"([^"]+)"/g) || []).forEach((value) => pushEntity(value.slice(1, -1)));
    (source.match(/\b[A-Z][a-z0-9_-]{2,}\b/g) || []).forEach(pushEntity);

    if (entities.length === 0) {
      const stop = new Set(['open', 'play', 'click', 'read', 'show', 'the', 'this', 'that', 'with', 'from', 'into', 'then', 'also', 'please']);
      source.toLowerCase().split(/[^a-z0-9]+/).forEach((word) => {
        if (word.length >= 4 && !stop.has(word)) pushEntity(word);
      });
    }

    return entities.slice(0, 8);
  }

  function extractTopics(text) {
    const source = String(text || '').trim();
    if (!source) return [];
    const quoted = (source.match(/"([^"]+)"/g) || []).map((value) => value.slice(1, -1));
    const urls = (source.match(/https?:\/\/[^\s]+/gi) || []).map((value) => {
      try {
        return new URL(value).hostname.replace(/^www\./, '');
      } catch (_) {
        return value;
      }
    });
    const keywords = source.toLowerCase().split(/[^a-z0-9а-яё\u10A0-\u10FF]+/i)
      .filter((word) => word.length >= 4)
      .slice(0, 6);
    return uniqueTrimmed([...quoted, ...urls, ...keywords], 8);
  }

  function summarizeActionPlan(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return '';
    return actions.map((action) => {
      const argText = Array.isArray(action.args) && action.args.length > 0
        ? ':' + action.args.join(':')
        : '';
      return action.type + argText;
    }).join(' | ').substring(0, 400);
  }

  function pushReferenceCandidates(text, browserStatus) {
    const topics = extractTopics(text);
    const entities = extractSessionEntities([
      text,
      browserStatus?.title || '',
      browserStatus?.url || ''
    ].join(' '));

    state.referenceCandidates = uniqueTrimmed([
      ...topics,
      ...entities,
      browserStatus?.title || '',
      browserStatus?.url || ''
    ], MAX_RECENT_ENTITIES);
  }

  function syncWorkingMemory(text, browserStatus, followUp, baseGoal) {
    if (!window.hexMemory) return;
    const taskLine = followUp && state.primaryGoal
      ? `${state.primaryGoal} | follow-up: ${text}`
      : text;
    window.hexMemory.updateWorking({
      currentTask: taskLine,
      currentEntities: extractSessionEntities(browserStatus?.open
        ? `${baseGoal} ${text} ${browserStatus.title || ''} ${browserStatus.url || ''}`
        : `${baseGoal} ${text}`)
    });
  }

  function updateForUser(text, browserStatus) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;
    const now = Date.now();
    const duplicateTurn = state.lastUserMessage === normalizedText && state.lastTouchedAt && (now - state.lastTouchedAt) < 1500;
    if (duplicateTurn) {
      state.browserSnapshot = {
        open: !!browserStatus?.open,
        url: browserStatus?.url || null,
        title: browserStatus?.title || null
      };
      if (browserStatus?.open) state.activeSurface = 'browser';
      return;
    }

    const followUp = isLikelyFollowUpMessage(normalizedText) && (!!state.primaryGoal || !!browserStatus?.open || state.referenceCandidates.length > 0 || state.recentEntities.length > 0);
    const baseGoal = followUp && state.primaryGoal ? state.primaryGoal : normalizedText;

    state.lastUserMessage = normalizedText;
    state.lastUserWasFollowUp = followUp;
    state.lastTouchedAt = now;
    state.activeSurface = browserStatus?.open ? 'browser' : 'chat';
    state.browserSnapshot = {
      open: !!browserStatus?.open,
      url: browserStatus?.url || null,
      title: browserStatus?.title || null
    };
    if (!followUp || !state.primaryGoal) state.primaryGoal = normalizedText;

    state.recentUserMessages = trimTail([...state.recentUserMessages, normalizedText], MAX_RECENT_MESSAGES);
    state.recentEntities = uniqueTrimmed([
      ...state.recentEntities,
      ...extractSessionEntities([
        baseGoal,
        normalizedText,
        browserStatus?.title || '',
        browserStatus?.url || ''
      ].join(' '))
    ], MAX_RECENT_ENTITIES);
    state.activeTopics = uniqueTrimmed([
      ...extractTopics(baseGoal),
      ...extractTopics(normalizedText),
      ...state.activeTopics
    ], MAX_RECENT_TOPICS);

    pushReferenceCandidates(normalizedText, browserStatus);
    syncWorkingMemory(normalizedText, browserStatus, followUp, baseGoal);
  }

  function updateForAssistant(text, actions) {
    state.lastAssistantMessage = String(text || '').substring(0, 400);
    state.lastActionTypes = Array.isArray(actions) ? actions.map((action) => action.type) : [];
    state.lastActionSummary = summarizeActionPlan(actions);
    if (state.lastActionTypes.some((type) => type.startsWith('web_') || type.startsWith('browser_'))) {
      state.activeSurface = 'browser';
    }
    state.lastTouchedAt = Date.now();
    state.recentAssistantSummaries = trimTail([
      ...state.recentAssistantSummaries,
      state.lastAssistantMessage
    ], MAX_RECENT_MESSAGES);
  }

  function updateForSystemData(infoResults) {
    state.lastSystemDataSummary = (infoResults || []).join('\n').substring(0, 700);
    state.lastTouchedAt = Date.now();
  }

  function hydrateRemote(remote, browser) {
    if (!remote) return;
    if (remote.primaryGoal && !state.primaryGoal) state.primaryGoal = remote.primaryGoal;
    if (remote.lastUserMessage && !state.lastUserMessage) state.lastUserMessage = remote.lastUserMessage;
    if (remote.lastAssistantMessage && !state.lastAssistantMessage) state.lastAssistantMessage = remote.lastAssistantMessage;
    if (remote.lastActionSummary && !state.lastActionSummary) state.lastActionSummary = remote.lastActionSummary;
    if (remote.lastSystemDataSummary && !state.lastSystemDataSummary) state.lastSystemDataSummary = remote.lastSystemDataSummary;
    if (remote.activeSurface && state.activeSurface === 'chat') state.activeSurface = remote.activeSurface;

    state.recentUserMessages = trimTail([
      ...state.recentUserMessages,
      remote.lastUserMessage || ''
    ], MAX_RECENT_MESSAGES);
    state.recentAssistantSummaries = trimTail([
      ...state.recentAssistantSummaries,
      remote.lastAssistantMessage || ''
    ], MAX_RECENT_MESSAGES);
    state.activeTopics = uniqueTrimmed([
      ...state.activeTopics,
      ...extractTopics(remote.primaryGoal || ''),
      ...extractTopics(remote.lastUserMessage || '')
    ], MAX_RECENT_TOPICS);
    state.recentEntities = uniqueTrimmed([
      ...state.recentEntities,
      ...extractSessionEntities([
        remote.primaryGoal || '',
        remote.lastUserMessage || '',
        remote.lastAssistantMessage || '',
        browser?.title || '',
        browser?.url || ''
      ].join(' '))
    ], MAX_RECENT_ENTITIES);

    if (browser?.open) {
      state.activeSurface = 'browser';
      state.browserSnapshot = {
        open: true,
        url: browser.url || null,
        title: browser.title || null
      };
    }
    pushReferenceCandidates([
      remote.primaryGoal || '',
      remote.lastUserMessage || '',
      remote.lastAssistantMessage || ''
    ].join(' '), browser || state.browserSnapshot);
  }

  async function getBrowserSessionState() {
    try {
      if (!window.hexAPI?.browser?.status) return { open: false, url: null, title: null };
      const status = await window.hexAPI.browser.status();
      return {
        open: !!status?.open,
        url: status?.url || null,
        title: status?.title || null
      };
    } catch (_) {
      return { open: false, url: null, title: null };
    }
  }

  function getSnapshot() {
    return {
      ...state,
      lastActionTypes: [...state.lastActionTypes],
      recentUserMessages: [...state.recentUserMessages],
      recentAssistantSummaries: [...state.recentAssistantSummaries],
      recentEntities: [...state.recentEntities],
      activeTopics: [...state.activeTopics],
      referenceCandidates: [...state.referenceCandidates],
      browserSnapshot: { ...state.browserSnapshot },
      browserCandidates: Array.isArray(state.browserCandidates) ? state.browserCandidates.map((item) => ({ ...item })) : [],
      lastResolvedReference: state.lastResolvedReference ? { ...state.lastResolvedReference } : null
    };
  }

  function normalizeCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : [])
      .map((item, index) => ({
        index: Number.isFinite(item?.index) ? item.index : index + 1,
        label: String(item?.label || item?.text || '').trim(),
        text: String(item?.text || item?.label || '').trim(),
        url: item?.url || null,
        kind: String(item?.kind || 'result').trim(),
        source: String(item?.source || 'browser').trim()
      }))
      .filter((item) => item.label || item.text)
      .slice(0, 16);
  }

  function updateBrowserCandidates(candidates, browserStatus = null) {
    state.browserCandidates = normalizeCandidates(candidates);
    if (browserStatus) {
      state.browserSnapshot = {
        open: !!browserStatus.open,
        url: browserStatus.url || null,
        title: browserStatus.title || null
      };
    }
    state.referenceCandidates = uniqueTrimmed([
      ...state.browserCandidates.map((item) => item.label || item.text),
      ...state.referenceCandidates
    ], MAX_RECENT_ENTITIES);
    state.lastTouchedAt = Date.now();
  }

  function ordinalIndexFromText(text) {
    const lower = String(text || '').toLowerCase();
    const patterns = [
      { re: /\bfirst\b|\b1st\b|\bone\b/, index: 0 },
      { re: /\bsecond\b|\b2nd\b|\btwo\b/, index: 1 },
      { re: /\bthird\b|\b3rd\b|\bthree\b/, index: 2 },
      { re: /\bfourth\b|\b4th\b|\bfour\b/, index: 3 },
      { re: /\bfifth\b|\b5th\b|\bfive\b/, index: 4 },
      { re: /\bsixth\b|\b6th\b|\bsix\b/, index: 5 },
      { re: /\bseventh\b|\b7th\b|\bseven\b/, index: 6 },
      { re: /\beighth\b|\b8th\b|\beight\b/, index: 7 },
      { re: /\bninth\b|\b9th\b|\bnine\b/, index: 8 },
      { re: /\btenth\b|\b10th\b|\bten\b/, index: 9 },
      { re: /\blast\b/, index: -1 }
    ];
    const hit = patterns.find((pattern) => pattern.re.test(lower));
    return hit ? hit.index : null;
  }

  function candidateMatchesQuery(candidate, query) {
    const lower = String(query || '').toLowerCase();
    const hay = `${candidate.label} ${candidate.text} ${candidate.kind} ${candidate.url || ''}`.toLowerCase();
    const categoryHints = ['video', 'result', 'song', 'track', 'link', 'button', 'article', 'page'];
    const requestedKinds = categoryHints.filter((hint) => lower.includes(hint));
    if (requestedKinds.length > 0) {
      return requestedKinds.some((hint) => hay.includes(hint));
    }
    return true;
  }

  function resolveReference(query, surface = 'browser') {
    const lower = String(query || '').trim().toLowerCase();
    if (!lower) return null;
    if (surface !== 'browser') return null;
    const candidates = state.browserCandidates || [];
    if (!candidates.length) return null;

    let pool = candidates.filter((candidate) => candidateMatchesQuery(candidate, lower));
    if (!pool.length) pool = candidates;

    if (/^(it|that|this|that one|this one|same one|same result|same video|open it|click it|play it)$/.test(lower)) {
      const fallback = state.lastResolvedReference
        ? candidates.find((candidate) => candidate.index === state.lastResolvedReference.index)
        : pool[0];
      if (fallback) {
        state.lastResolvedReference = { ...fallback };
        return fallback;
      }
    }

    const ordinalIndex = ordinalIndexFromText(lower);
    if (ordinalIndex !== null) {
      const chosen = ordinalIndex === -1 ? pool[pool.length - 1] : pool[ordinalIndex];
      if (chosen) {
        state.lastResolvedReference = { ...chosen };
        return chosen;
      }
    }

    const exact = pool.find((candidate) => {
      const hay = `${candidate.label} ${candidate.text}`.toLowerCase();
      return hay.includes(lower);
    });
    if (exact) {
      state.lastResolvedReference = { ...exact };
      return exact;
    }

    return null;
  }

  return {
    state,
    isLikelyFollowUpMessage,
    extractSessionEntities,
    summarizeActionPlan,
    updateForUser,
    updateForAssistant,
    updateForSystemData,
    updateBrowserCandidates,
    resolveReference,
    hydrateRemote,
    getBrowserSessionState,
    getSnapshot
  };
})();
