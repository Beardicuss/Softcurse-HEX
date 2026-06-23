'use strict';

window.hexPcInventory = (() => {
  const STORAGE_KEY = 'hex.pcInventory.v1';
  const MAX_BUCKET_AGE_MS = 1000 * 60 * 60 * 24 * 10;
  const SOFT_BUCKET_AGE_MS = 1000 * 60 * 60 * 18;
  let persisted = {
    apps: [],
    files: [],
    folders: [],
    games: [],
    windows: [],
    processes: [],
    knownLocations: [],
    promoted: [],
    savedAt: 0
  };

  function rankLabel(item) {
    return String(item?.label || item?.value || item?.path || '').trim();
  }

  function safeClone(list, limit = 24) {
    return (Array.isArray(list) ? list : [])
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        index: Number.isFinite(item?.index) ? item.index : index + 1,
        meta: item?.meta ? { ...item.meta } : {}
      }));
  }

  function stampMeta(item) {
    return {
      ...(item?.meta || {}),
      inventorySeenAt: Number(item?.meta?.inventorySeenAt || Date.now()),
      inventoryUpdatedAt: Date.now()
    };
  }

  function pruneStale(list, limit = 24) {
    const now = Date.now();
    return safeClone(list, limit)
      .filter((item) => {
        const updatedAt = Number(item?.meta?.inventoryUpdatedAt || item?.meta?.inventorySeenAt || persisted.savedAt || 0);
        if (!updatedAt) return true;
        return (now - updatedAt) <= MAX_BUCKET_AGE_MS;
      })
      .map((item) => ({
        ...item,
        meta: {
          ...(item?.meta || {}),
          inventorySeenAt: Number(item?.meta?.inventorySeenAt || item?.meta?.inventoryUpdatedAt || persisted.savedAt || now),
          inventoryUpdatedAt: Number(item?.meta?.inventoryUpdatedAt || item?.meta?.inventorySeenAt || persisted.savedAt || now)
        }
      }));
  }

  function mergeBucket(kind, primary, secondary, fallback) {
    const seen = new Set();
    const now = Date.now();
    return [
      ...(Array.isArray(primary) ? primary : []),
      ...(Array.isArray(secondary) ? secondary : []),
      ...(Array.isArray(fallback) ? fallback : [])
    ]
      .map((item, index) => ({
        kind,
        index: Number.isFinite(item?.index) ? item.index : index + 1,
        label: rankLabel(item),
        path: item?.path || null,
        value: item?.value || item?.path || item?.label || null,
        meta: {
          ...(item?.meta || {}),
          inventorySeenAt: Number(item?.meta?.inventorySeenAt || item?.meta?.inventoryUpdatedAt || persisted.savedAt || now),
          inventoryUpdatedAt: Number(item?.meta?.inventoryUpdatedAt || item?.meta?.inventorySeenAt || now)
        }
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

  function loadPersisted() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      persisted = {
        apps: pruneStale(parsed.apps),
        files: pruneStale(parsed.files),
        folders: pruneStale(parsed.folders),
        games: pruneStale(parsed.games),
        windows: pruneStale(parsed.windows, 12),
        processes: pruneStale(parsed.processes, 12),
        knownLocations: pruneStale(parsed.knownLocations, 12),
        promoted: pruneStale(parsed.promoted, 12),
        savedAt: Number(parsed.savedAt || 0)
      };
    } catch (_) {}
  }

  function persistNow() {
    try {
      const snapshot = getSnapshot();
      persisted = {
        apps: safeClone(snapshot.apps).map((item) => ({ ...item, meta: stampMeta(item) })),
        files: safeClone(snapshot.files).map((item) => ({ ...item, meta: stampMeta(item) })),
        folders: safeClone(snapshot.folders).map((item) => ({ ...item, meta: stampMeta(item) })),
        games: safeClone(snapshot.games).map((item) => ({ ...item, meta: stampMeta(item) })),
        windows: safeClone(snapshot.windows, 12).map((item) => ({ ...item, meta: stampMeta(item) })),
        processes: safeClone(snapshot.processes, 12).map((item) => ({ ...item, meta: stampMeta(item) })),
        knownLocations: safeClone(snapshot.knownLocations, 12).map((item) => ({ ...item, meta: stampMeta(item) })),
        promoted: safeClone(snapshot.promoted, 12).map((item) => ({ ...item, meta: stampMeta(item) })),
        savedAt: Date.now()
      };
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(persisted));
      return persisted;
    } catch (_) {
      return persisted;
    }
  }

  function getSnapshot() {
    const candidates = window.hexCandidateStore?.snapshot?.() || {};
    const awareness = window.hexPcAwareness?.getSnapshot?.() || {};
    return {
      apps: mergeBucket('app', awareness.inventory?.apps, candidates.app, persisted.apps),
      files: mergeBucket('file', awareness.inventory?.files, candidates.file, persisted.files),
      folders: mergeBucket('folder', awareness.inventory?.folders, candidates.folder, persisted.folders),
      games: mergeBucket('game', awareness.inventory?.games, candidates.game, persisted.games),
      windows: mergeBucket('window', awareness.windows, candidates.window, persisted.windows),
      processes: mergeBucket('process', awareness.processes, candidates.process, persisted.processes),
      knownLocations: mergeBucket('folder', awareness.knownLocations, [], persisted.knownLocations),
      promoted: mergeBucket('recent', window.hexRecentPromoter?.top?.(10), [], persisted.promoted)
    };
  }

  function scoreItem(item, q) {
    const haystack = [item.label, item.path, item.value, item.meta?.processName, item.meta?.alias].filter(Boolean).join(' ').toLowerCase();
    const label = String(item.label || '').toLowerCase();
    let score = 0;
    if (label === q) score += 7;
    if (label.startsWith(q)) score += 4;
    if (haystack.includes(q)) score += 2;

    const focusBoost = Math.min(Number(item.meta?.focusRank || 0) / 4, 3);
    const refreshBoost = Math.min(Number(item.meta?.refreshRank || 0) / 5, 2);
    const recentBoost = Math.min(Number(item.meta?.score || item.score || 0) / 100, 1.5);
    const liveBoost = item.meta?.lastFocusedAt || item.meta?.seenAt ? 1 : 0;
    const updatedAt = Number(item.meta?.inventoryUpdatedAt || item.meta?.inventorySeenAt || persisted.savedAt || 0);
    const stalePenalty = item.meta?.lastFocusedAt || item.meta?.seenAt || !updatedAt
      ? 0
      : Math.min(Math.max((Date.now() - updatedAt) / SOFT_BUCKET_AGE_MS, 0), 3);

    return score + focusBoost + refreshBoost + recentBoost + liveBoost - stalePenalty;
  }

  function search(query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const snapshot = getSnapshot();
    const all = ['apps', 'files', 'folders', 'games', 'windows', 'processes', 'knownLocations', 'promoted']
      .flatMap((key) => snapshot[key] || []);
    return all
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry, index) => ({ ...entry.item, index: index + 1 }));
  }

  loadPersisted();

  return {
    getSnapshot,
    search,
    persistNow,
    getPersistedSavedAt: () => persisted.savedAt || 0
  };
})();
