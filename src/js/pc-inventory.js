'use strict';

window.hexPcInventory = (() => {
  function rankLabel(item) {
    return String(item?.label || item?.value || item?.path || '').trim();
  }

  function mergeBucket(kind, primary, secondary) {
    const seen = new Set();
    return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]
      .map((item, index) => ({
        kind,
        index: Number.isFinite(item?.index) ? item.index : index + 1,
        label: rankLabel(item),
        path: item?.path || null,
        value: item?.value || item?.path || item?.label || null,
        meta: item?.meta || {}
      }))
      .filter((item) => {
        if (!item.label) return false;
        const key = [kind, item.path || '', item.value || '', item.label].join('::').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 24);
  }

  function getSnapshot() {
    const candidates = window.hexCandidateStore?.snapshot?.() || {};
    const awareness = window.hexPcAwareness?.getSnapshot?.() || {};
    return {
      apps: mergeBucket('app', awareness.inventory?.apps, candidates.app),
      files: mergeBucket('file', awareness.inventory?.files, candidates.file),
      games: mergeBucket('game', awareness.inventory?.games, candidates.game),
      windows: mergeBucket('window', awareness.windows, candidates.window),
      processes: mergeBucket('process', awareness.processes, candidates.process),
      promoted: Array.isArray(window.hexRecentPromoter?.top?.(10)) ? window.hexRecentPromoter.top(10) : []
    };
  }

  function search(query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const snapshot = getSnapshot();
    const all = ['apps', 'files', 'games', 'windows', 'processes', 'promoted']
      .flatMap((key) => snapshot[key] || []);
    return all
      .map((item) => {
        const haystack = [item.label, item.path, item.value, item.meta?.processName].filter(Boolean).join(' ').toLowerCase();
        const exact = haystack.includes(q) ? 2 : 0;
        const starts = item.label.toLowerCase().startsWith(q) ? 1 : 0;
        return { item, score: exact + starts + (item.score || 0) / 100 };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry, index) => ({ ...entry.item, index: index + 1 }));
  }

  return {
    getSnapshot,
    search
  };
})();
