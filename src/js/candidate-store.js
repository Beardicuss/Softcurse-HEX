'use strict';

window.hexCandidateStore = (() => {
  const MAX_ITEMS = 20;
  const buckets = {
    file: [],
    folder: [],
    app: [],
    game: [],
    window: [],
    process: [],
    recent: []
  };

  function normalize(kind, items, source = '') {
    const now = Date.now();
    return (Array.isArray(items) ? items : [])
      .map((item, idx) => ({
        kind,
        index: Number.isFinite(item?.index) ? item.index : idx + 1,
        label: String(item?.label || item?.name || item?.title || item?.path || '').trim(),
        path: item?.path || null,
        value: item?.value || item?.path || item?.name || item?.title || null,
        meta: { ...(item?.meta || {}), seenAt: Number(item?.meta?.seenAt || item?.seenAt || now), source: item?.meta?.source || item?.source || source || item?.meta?.source || kind + '-candidate' }
      }))
      .filter((item) => item.label)
      .slice(0, MAX_ITEMS);
  }

  function set(kind, items, source = '') {
    if (!buckets[kind]) return [];
    buckets[kind] = normalize(kind, items, source || kind + '-set');
    return buckets[kind];
  }

  function merge(kind, items, source = '') {
    if (!buckets[kind]) return [];
    const incoming = normalize(kind, items, source || kind + '-merge');
    const seen = new Set();
    buckets[kind] = [...incoming, ...buckets[kind]]
      .filter((item) => {
        const key = [item.kind, item.path || '', item.value || '', item.label || ''].join('::').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ITEMS)
      .map((item, index) => ({ ...item, index: index + 1 }));
    return buckets[kind];
  }

  function get(kind) {
    return Array.isArray(buckets[kind]) ? buckets[kind].map((item) => ({ ...item })) : [];
  }


  function freshness(kind, maxAgeMs = 5 * 60 * 1000) {
    const items = get(kind);
    const newest = items.reduce((max, item) => Math.max(max, Number(item?.meta?.seenAt || 0)), 0);
    const ageMs = newest ? Date.now() - newest : null;
    return {
      kind,
      count: items.length,
      newestAt: newest || null,
      ageMs,
      fresh: newest > 0 && ageMs <= maxAgeMs
    };
  }

  function freshnessSnapshot(maxAgeMs = 5 * 60 * 1000) {
    return Object.keys(buckets).reduce((out, kind) => {
      out[kind] = freshness(kind, maxAgeMs);
      return out;
    }, {});
  }
  function snapshot() {
    return {
      file: get('file'),
      folder: get('folder'),
      app: get('app'),
      game: get('game'),
      window: get('window'),
      process: get('process'),
      recent: get('recent')
    };
  }

  return { set, merge, get, snapshot, freshness, freshnessSnapshot };
})();
