'use strict';

window.hexReferenceResolver = (() => {
  function ordinalIndex(text) {
    const lower = String(text || '').toLowerCase();
    const map = [
      { re: /\bfirst\b|\b1st\b/, index: 0 },
      { re: /\bsecond\b|\b2nd\b/, index: 1 },
      { re: /\bthird\b|\b3rd\b/, index: 2 },
      { re: /\bfourth\b|\b4th\b/, index: 3 },
      { re: /\bfifth\b|\b5th\b/, index: 4 },
      { re: /\bsixth\b|\b6th\b/, index: 5 },
      { re: /\bseventh\b|\b7th\b/, index: 6 },
      { re: /\beighth\b|\b8th\b/, index: 7 },
      { re: /\bninth\b|\b9th\b/, index: 8 },
      { re: /\btenth\b|\b10th\b/, index: 9 },
      { re: /\blast\b/, index: -1 }
    ];
    const hit = map.find((item) => item.re.test(lower));
    return hit ? hit.index : null;
  }

  function detectKind(text) {
    const lower = String(text || '').toLowerCase();
    if (/\b(folder|directory|location)\b/.test(lower)) return 'folder';
    if (/\b(file|document|image|video|song|track|photo|pdf)\b/.test(lower)) return 'file';
    if (/\b(game|steam|epic)\b/.test(lower)) return 'game';
    if (/\b(process|task|service|pid)\b/.test(lower)) return 'process';
    if (/\b(window|tab)\b/.test(lower)) return 'window';
    if (/\b(app|program|software)\b/.test(lower)) return 'app';
    if (/\bbrowser\b/.test(lower)) return null;
    return null;
  }

  function detectSurfaceBias(text) {
    const lower = String(text || '').toLowerCase();
    const browserScore = [
      /\b(browser|page|site|website|tab|url|link|button|video|result|search|youtube|google)\b/,
      /\b(click|scroll|read|back|forward|refresh|reload|open third video|open first result)\b/
    ].reduce((score, re) => score + (re.test(lower) ? 1 : 0), 0);
    const desktopScore = [
      /\b(app|program|software|file|folder|directory|document|game|process|task|window|desktop|downloads|documents)\b/,
      /\b(open|launch|run|show|reveal|locate|focus|kill|terminate)\b/
    ].reduce((score, re) => score + (re.test(lower) ? 1 : 0), 0);

    if (browserScore > desktopScore) return 'browser';
    if (desktopScore > browserScore) return 'desktop';
    return 'mixed';
  }

  function hasPronounReference(text) {
    return /\b(it|that|this|them|those|these|one|ones|same|previous|last|next)\b/.test(String(text || '').toLowerCase());
  }

  function getInventoryPool(kind) {
    const inventory = window.hexPcInventory?.getSnapshot?.() || {};
    const keyMap = {
      app: 'apps',
      file: 'files',
      folder: 'folders',
      game: 'games',
      window: 'windows',
      process: 'processes'
    };
    const bucket = keyMap[kind] || kind;
    return Array.isArray(inventory[bucket]) ? inventory[bucket] : [];
  }

  function getKnownLocationPool() {
    const inventory = window.hexPcInventory?.getSnapshot?.() || {};
    return Array.isArray(inventory.knownLocations) ? inventory.knownLocations : [];
  }

  function getCloudCategoryPool(kind) {
    const packet = window.hexCloudSync?._contextPacketCache?.packet || null;
    const refs = packet?.references || {};
    const byCategory = refs?.desktopByCategory || {};
    const keyMap = {
      app: 'apps',
      file: 'files',
      folder: 'folders',
      game: 'games',
      window: 'windows',
      process: 'processes'
    };
    const bucket = keyMap[kind] || kind;
    return (Array.isArray(byCategory[bucket]) ? byCategory[bucket] : [])
      .map((value, index) => {
        const label = String(value?.label || value?.value || value?.path || value || '').trim();
        if (!label) return null;
        return {
          index: Number.isFinite(value?.index) ? value.index : index + 1,
          kind: value?.kind || kind,
          label,
          path: value?.path || null,
          value: value?.value || value?.path || label,
          meta: {
            ...(value?.meta || {}),
            source: 'cloud-category',
            rehydrated: true,
            category: bucket
          }
        };
      })
      .filter(Boolean);
  }

  function getLastReference() {
    const last = window.hexContextState?.state?.lastResolvedReference || null;
    if (!last || last.source === 'browser' || last.surface === 'browser') return null;
    return last;
  }

  function scoreMatch(queryLower, item, kind) {
    const label = String(item?.label || '').toLowerCase();
    const path = String(item?.path || '').toLowerCase();
    const value = String(item?.value || '').toLowerCase();
    const processName = String(item?.meta?.processName || '').toLowerCase();
    const alias = String(item?.meta?.alias || '').toLowerCase();
    const haystack = [label, path, value, processName, alias].filter(Boolean).join(' ');
    let score = 0;
    if (label === queryLower || alias === queryLower) score += 5;
    if (label.startsWith(queryLower) || alias.startsWith(queryLower)) score += 3;
    if (haystack.includes(queryLower)) score += 2;
    if (kind && item?.kind === kind) score += 1;
    score += Math.min(Number(item?.meta?.focusRank || item?.meta?.refreshRank || item?.meta?.priority || 0) / 10, 1.5);
    score += Math.min(Number(item?.meta?.score || item?.score || 0) / 100, 1.5);
    if (item?.meta?.source === 'cloud-category') score += 0.75;
    return score;
  }

  function chooseFromPool(query, pool, kind) {
    if (!pool.length) return null;
    const ordinal = ordinalIndex(query);
    if (ordinal !== null) {
      const hit = ordinal === -1 ? pool[pool.length - 1] : pool[ordinal] || null;
      return hit ? { ...hit, kind: hit.kind || kind } : null;
    }

    const lower = query.toLowerCase();
    if (/^(it|that|this|that one|this one|same|same one|previous|last one|next one|them|those|these)$/.test(lower)) {
      return { ...(pool[0] || null), kind: pool[0]?.kind || kind };
    }

    const ranked = pool
      .map((item) => ({ item, score: scoreMatch(lower, item, kind) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const matched = ranked[0]?.item || null;
    return matched ? { ...matched, kind: matched.kind || kind } : null;
  }

  function resolveDesktopReference(text, preferredKind = null) {
    const query = String(text || '').trim();
    if (!query) return null;

    let kind = preferredKind || detectKind(query);
    let pool = kind ? (window.hexCandidateStore?.get(kind) || []) : [];
    const lastReference = getLastReference();

    if (!pool.length && lastReference && hasPronounReference(query)) {
      if (!kind || lastReference.kind === kind) {
        return { ...lastReference, surface: 'desktop', source: 'desktop-memory' };
      }
    }

    if (!pool.length && hasPronounReference(query)) {
      const recent = window.hexCandidateStore?.get('recent') || [];
      if (recent.length) {
        kind = recent[0].kind || kind || 'file';
        pool = kind ? (window.hexCandidateStore?.get(kind) || []) : [];
        if (!pool.length) pool = recent;
      }
    }

    if (!pool.length && kind) {
      pool = getInventoryPool(kind);
    }

    if (!pool.length && kind === 'folder') {
      pool = getKnownLocationPool();
    }

    if (!pool.length && kind) {
      pool = getCloudCategoryPool(kind);
    }

    if (!pool.length && kind) {
      pool = window.hexPcEntityMemory?.search?.(query, [kind], 10) || [];
    }

    if (!pool.length) {
      kind = kind || (lastReference?.kind || 'file');
      pool = (window.hexCandidateStore?.get(kind) || []).concat(getInventoryPool(kind));
      if (!pool.length && kind === 'folder') pool = getKnownLocationPool();
      if (!pool.length) pool = pool.concat(getCloudCategoryPool(kind));
      if (!pool.length) pool = window.hexPcEntityMemory?.search?.(query, [kind], 10) || [];
    }

    const chosen = chooseFromPool(query, pool, kind);
    return chosen ? { ...chosen, surface: 'desktop', source: chosen.source || 'desktop-memory' } : null;
  }

  function resolveMixedReference(text, browserOpen = false) {
    const query = String(text || '').trim();
    if (!query) return null;

    const surfaceBias = detectSurfaceBias(query);
    const browserCandidate = browserOpen ? window.resolveSessionReference?.(query, 'browser') || null : null;
    const desktopCandidate = resolveDesktopReference(query, null);

    if (surfaceBias === 'browser' && browserCandidate) return browserCandidate;
    if (surfaceBias === 'desktop' && desktopCandidate) return desktopCandidate;
    if (surfaceBias === 'browser') return browserCandidate || desktopCandidate;
    if (surfaceBias === 'desktop') return desktopCandidate || browserCandidate;

    if (browserCandidate && !desktopCandidate) return browserCandidate;
    if (desktopCandidate && !browserCandidate) return desktopCandidate;

    const lower = query.toLowerCase();
    if (browserCandidate && desktopCandidate) {
      if (/\b(video|result|link|button|page|site|search)\b/.test(lower)) return browserCandidate;
      if (/\b(file|folder|app|game|window|process|program|directory)\b/.test(lower)) return desktopCandidate;
      const browserOrdinal = ordinalIndex(query);
      if (browserOrdinal !== null) return browserCandidate;
      return desktopCandidate;
    }

    return browserCandidate || desktopCandidate || null;
  }


  function isBrowserReferenceCommand(text, browserOpen = false) {
    if (!browserOpen) return false;
    const lower = String(text || '').trim().toLowerCase();
    if (/^(open|click|play|select|press|read|show|scroll|go|back|forward|refresh|reload)\s+/.test(lower) &&
      /\b(first|second|third|fourth|fifth|last|it|that|this|them|those|these|one|ones|same|next|previous|video|result|link|button|page|tab)\b/.test(lower)) {
      return true;
    }
    if (/^(open it|click it|play it|select it|press it|read it|show it|open that|click that|play that|select that)$/.test(lower)) {
      return true;
    }
    return false;
  }

  function isReferenceCommand(text, browserOpen = false) {
    return isDesktopReferenceCommand(text) || isBrowserReferenceCommand(text, browserOpen);
  }
  function isDesktopReferenceCommand(text) {
    const lower = String(text || '').trim().toLowerCase();
    if (/^(open|launch|play|start|show|reveal|locate|close|focus|switch|select|kill|terminate|end|run|use)\s+/.test(lower) &&
      /\b(first|second|third|fourth|fifth|last|it|that|this|them|those|these|one|ones|same|next|previous|folder|file|app|game|window|process|directory)\b/.test(lower)) {
      return true;
    }
    if (/^(show it|open it|run it|launch it|play it|close it|focus it|reveal it|locate it|show that|open that|focus that|close that)$/.test(lower)) {
      return true;
    }
    return false;
  }

  return {
    resolveDesktopReference,
    resolveMixedReference,
    isDesktopReferenceCommand,
    isReferenceCommand,
    detectSurfaceBias
  };
})();


