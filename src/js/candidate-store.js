'use strict';

window.hexCandidateStore = (() => {
  const MAX_ITEMS = 20;
  const buckets = {
    file: [],
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

  function get(kind) {
    return Array.isArray(buckets[kind]) ? buckets[kind].map((item) => ({ ...item })) : [];
  }

  function snapshot() {
    return {
      file: get('file'),
      app: get('app'),
      game: get('game'),
      window: get('window'),
      process: get('process'),
      recent: get('recent')
    };
  }

  return { set, get, snapshot };
})();

