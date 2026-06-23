'use strict';

window.hexPcEntityMemory = (() => {
  const STORAGE_KEY = 'hex.pcEntityMemory.v1';
  const MAX_ITEMS = 180;
  const state = new Map();

  function keyFor(item = {}) {
    return [item.kind || 'item', item.path || '', item.value || '', item.label || ''].join('::').toLowerCase();
  }

  function normalize(item = {}, kindHint = 'item') {
    return {
      kind: item.kind || kindHint,
      label: String(item.label || item.value || item.path || '').trim(),
      path: item.path || null,
      value: item.value || item.path || item.label || null,
      meta: item.meta ? { ...item.meta } : {}
    };
  }

  function basename(path) {
    const value = String(path || '').trim();
    if (!value) return '';
    const parts = value.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || value;
  }

  function searchText(entry) {
    return [
      entry.label,
      entry.path,
      entry.value,
      basename(entry.path || entry.value || ''),
      entry.meta?.alias,
      entry.meta?.parent,
      entry.meta?.sourceAlias,
      entry.meta?.processName,
      entry.meta?.browserTitle,
      entry.meta?.browserUrl,
      entry.meta?.candidateKind,
      entry.meta?.version
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function decayScore(entry) {
    const ageHours = Math.max(0, (Date.now() - Number(entry?.lastSeenAt || 0)) / (1000 * 60 * 60));
    return Number(entry?.score || 0) + (entry?.successes || 0) * 1.4 - (entry?.failures || 0) * 1.6 - Math.min(ageHours / 12, 6);
  }

  function prune() {
    const ranked = Array.from(state.values())
      .sort((a, b) => (decayScore(b) - decayScore(a)) || (b.lastSeenAt - a.lastSeenAt));
    ranked.slice(MAX_ITEMS).forEach((entry) => state.delete(entry.id));
  }

  function persist() {
    try {
      const rows = Array.from(state.values())
        .sort((a, b) => (b.lastSeenAt - a.lastSeenAt))
        .slice(0, MAX_ITEMS);
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch (_) {}
  }

  function load() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      const rows = JSON.parse(raw || '[]');
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (!row?.id || !row?.label) return;
        state.set(row.id, row);
      });
      prune();
    } catch (_) {}
  }

  function upsert(item, kindHint = 'item', weight = 1) {
    const normalized = normalize(item, kindHint);
    if (!normalized.label) return null;
    const id = keyFor(normalized);
    const now = Date.now();
    const existing = state.get(id);
    const next = existing || {
      id,
      ...normalized,
      hits: 0,
      successes: 0,
      failures: 0,
      score: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      lastOutcomeAt: 0
    };
    next.kind = normalized.kind;
    next.label = normalized.label;
    next.path = normalized.path;
    next.value = normalized.value;
    next.meta = { ...(existing?.meta || {}), ...(normalized.meta || {}) };
    next.hits += 1;
    next.score += Math.max(1, weight);
    next.lastSeenAt = now;
    state.set(id, next);
    prune();
    persist();
    return { ...next, effectiveScore: decayScore(next) };
  }

  function ingest(items, kindHint = 'item', weight = 1) {
    return (Array.isArray(items) ? items : []).map((item) => upsert(item, kindHint, weight)).filter(Boolean);
  }

  function ingestSnapshot(snapshot = {}) {
    ingest(snapshot.app, 'app', 1);
    ingest(snapshot.file, 'file', 1);
    ingest(snapshot.folder, 'folder', 1.1);
    ingest(snapshot.game, 'game', 1.1);
    ingest(snapshot.window, 'window', 0.9);
    ingest(snapshot.process, 'process', 0.9);
    ingest(snapshot.recent, 'recent', 1.4);
  }

  function noteActionOutcome(item, kindHint, success, detail = '') {
    const normalized = normalize(item, kindHint);
    if (!normalized.label) return null;
    const id = keyFor(normalized);
    const existing = state.get(id) || upsert(normalized, kindHint, 1);
    if (!existing) return null;
    existing.lastOutcomeAt = Date.now();
    existing.lastSeenAt = Date.now();
    existing.lastError = success ? '' : String(detail || '');
    if (success) {
      existing.successes += 1;
      existing.score += 2;
    } else {
      existing.failures += 1;
      existing.score = Math.max(0, existing.score - 1);
    }
    state.set(id, existing);
    prune();
    persist();
    return { ...existing, effectiveScore: decayScore(existing) };
  }

  function search(query, kinds = [], limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const allow = new Set((Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean));
    return Array.from(state.values())
      .filter((entry) => !allow.size || allow.has(entry.kind))
      .map((entry) => {
        const haystack = searchText(entry);
        const label = entry.label.toLowerCase();
        const base = basename(entry.path || entry.value || '').toLowerCase();
        let score = decayScore(entry);
        if (label === q || base === q) score += 8;
        else if (label.startsWith(q) || base.startsWith(q)) score += 4;
        else if (haystack.includes(q)) score += 2;
        if (entry.meta?.alias && String(entry.meta.alias).toLowerCase() === q) score += 5;
        return { entry, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row, index) => ({ ...row.entry, score: row.score, index: index + 1 }));
  }

  function topHighlights(limit = 8) {
    return Array.from(state.values())
      .sort((a, b) => (decayScore(b) - decayScore(a)) || (b.lastSeenAt - a.lastSeenAt))
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, score: decayScore(entry), index: index + 1 }));
  }

  load();

  return {
    ingest,
    ingestSnapshot,
    noteActionOutcome,
    search,
    topHighlights
  };
})();
