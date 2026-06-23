'use strict';

window.hexRecentPromoter = (() => {
  const MAX_ITEMS = 40;
  const SOFT_DECAY_MS = 1000 * 60 * 30;
  const HARD_EXPIRE_MS = 1000 * 60 * 60 * 24 * 5;
  const items = new Map();

  function fingerprint(item = {}) {
    return [
      item.kind || 'item',
      item.path || '',
      item.value || '',
      item.label || ''
    ].join('::').toLowerCase();
  }

  function normalize(item = {}, kindHint = 'item') {
    return {
      kind: item.kind || kindHint,
      label: String(item.label || item.value || item.path || '').trim(),
      path: item.path || null,
      value: item.value || item.path || item.label || null,
      meta: item.meta || {},
      index: Number.isFinite(item.index) ? item.index : null
    };
  }

  function decayScore(item) {
    const age = Math.max(0, Date.now() - Number(item?.lastSeenAt || 0));
    if (age >= HARD_EXPIRE_MS) return -Infinity;
    return Number(item?.score || 0) - (age / SOFT_DECAY_MS);
  }

  function prune() {
    Array.from(items.values()).forEach((item) => {
      if (decayScore(item) === -Infinity) items.delete(item.id);
    });
    const ranked = Array.from(items.values())
      .sort((a, b) => (decayScore(b) - decayScore(a)) || (b.lastSeenAt - a.lastSeenAt));
    ranked.slice(MAX_ITEMS).forEach((item) => items.delete(item.id));
  }

  function touch(item, kindHint = 'item', weight = 1) {
    const normalized = normalize(item, kindHint);
    if (!normalized.label) return null;
    const id = fingerprint(normalized);
    const existing = items.get(id);
    const now = Date.now();
    const next = existing || {
      id,
      ...normalized,
      score: 0,
      hits: 0,
      firstSeenAt: now,
      lastSeenAt: now
    };

    next.kind = normalized.kind;
    next.label = normalized.label;
    next.path = normalized.path;
    next.value = normalized.value;
    next.meta = normalized.meta;
    next.index = normalized.index;
    next.hits += 1;
    next.score += Math.max(1, weight);
    next.lastSeenAt = now;
    items.set(id, next);
    prune();
    return { ...next, effectiveScore: decayScore(next) };
  }

  function touchMany(kind, list, weight = 1) {
    return (Array.isArray(list) ? list : [])
      .map((item) => touch(item, kind, weight))
      .filter(Boolean);
  }

  function top(limit = 8) {
    prune();
    return Array.from(items.values())
      .sort((a, b) => (decayScore(b) - decayScore(a)) || (b.lastSeenAt - a.lastSeenAt))
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        score: decayScore(item),
        index: index + 1
      }));
  }

  function topByKinds(kinds, limit = 8) {
    const allow = new Set((Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean));
    return top(MAX_ITEMS)
      .filter((item) => allow.has(item.kind))
      .slice(0, limit)
      .map((item, index) => ({ ...item, index: index + 1 }));
  }

  return {
    touch,
    touchMany,
    top,
    topByKinds
  };
})();
