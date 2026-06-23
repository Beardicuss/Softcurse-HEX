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

  function normalize(kind, items) {
    return (Array.isArray(items) ? items : [])
      .map((item, idx) => ({
        kind,
        index: Number.isFinite(item?.index) ? item.index : idx + 1,
        label: String(item?.label || item?.name || item?.title || item?.path || '').trim(),
        path: item?.path || null,
        value: item?.value || item?.path || item?.name || item?.title || null,
        meta: item?.meta || {}
      }))
      .filter((item) => item.label)
      .slice(0, MAX_ITEMS);
  }

  function set(kind, items) {
    if (!buckets[kind]) return [];
    buckets[kind] = normalize(kind, items);
    return buckets[kind];
  }

  function merge(kind, items) {
    if (!buckets[kind]) return [];
    const incoming = normalize(kind, items);
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

  return { set, merge, get, snapshot };
})();
