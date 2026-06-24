export function buildPriorityReferences({ query = '', desktopByCategory = {}, focusOrder = [], desktopHits = [], browserHits = [], limit = 12 } = {}) {
  const queryText = String(query || '').trim();
  const tokens = tokenize(queryText);
  const items = [];

  const add = (item, source, baseScore = 0, reasonParts = []) => {
    const normalized = normalizeReference(item, source);
    if (!normalized) return;
    const haystack = [normalized.label, normalized.value, normalized.path, normalized.kind].filter(Boolean).join(' ');
    const score = Math.max(0, baseScore + scoreText(queryText, tokens, haystack));
    items.push({
      ...normalized,
      score,
      confidence: clamp01(0.35 + score / 3),
      retrievalReason: reasonParts.filter(Boolean).join(' | ') || source
    });
  };

  for (const [index, item] of (Array.isArray(desktopHits) ? desktopHits : []).entries()) {
    add(item, 'desktop-focus', Math.max(0.1, 1.1 - index * 0.04), ['desktop focus', item?.kind ? 'kind ' + item.kind : null]);
  }

  for (const [index, value] of (Array.isArray(browserHits) ? browserHits : []).entries()) {
    add({ kind: 'browser', label: String(value || ''), value: String(value || '') }, 'browser-continuity', Math.max(0.1, 1.0 - index * 0.04), ['browser continuity']);
  }

  for (const [orderIndex, category] of (Array.isArray(focusOrder) ? focusOrder : []).entries()) {
    const list = Array.isArray(desktopByCategory?.[category]) ? desktopByCategory[category] : [];
    for (const [itemIndex, item] of list.entries()) {
      add(item, 'category-' + category, Math.max(0.05, 0.78 - orderIndex * 0.06 - itemIndex * 0.02), ['category ' + category, 'focus rank ' + (orderIndex + 1)]);
    }
  }

  return dedupe(items)
    .sort((a, b) => (b.score - a.score) || (b.confidence - a.confidence))
    .slice(0, limit)
    .map((item, index) => ({
      index: index + 1,
      kind: item.kind,
      label: item.label,
      path: item.path || null,
      value: item.value || item.label,
      confidence: Number(item.confidence.toFixed(2)),
      retrievalReason: item.retrievalReason
    }));
}

function normalizeReference(item, source = 'reference') {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const label = String(item.label || item.value || item.path || '').trim();
    if (!label) return null;
    return {
      kind: String(item.kind || inferKind(label) || 'recent').trim(),
      label,
      path: item.path || null,
      value: item.value || item.path || label,
      source
    };
  }
  const label = String(item || '').trim();
  if (!label) return null;
  return { kind: inferKind(label) || 'recent', label, path: null, value: label, source };
}

function dedupe(items) {
  const best = new Map();
  for (const item of items) {
    const key = [item.kind, item.path || '', item.value || '', item.label].join('::').toLowerCase();
    const previous = best.get(key);
    if (!previous || item.score > previous.score) best.set(key, item);
  }
  return [...best.values()];
}

function inferKind(value) {
  const text = String(value || '').toLowerCase();
  if (/\b(game|steam|epic)\b/.test(text)) return 'game';
  if (/\b(app|program|software|exe)\b/.test(text)) return 'app';
  if (/\b(file|document|pdf|docx|txt|image|photo|video)\b/.test(text)) return 'file';
  if (/\b(folder|directory|downloads|documents|desktop)\b/.test(text)) return 'folder';
  if (/\b(window|tab)\b/.test(text)) return 'window';
  if (/\b(process|pid|service)\b/.test(text)) return 'process';
  if (/\b(browser|youtube|google|url|link|page|video|result)\b/.test(text)) return 'browser';
  return 'recent';
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 16);
}

function scoreText(queryText, tokens, value) {
  const hay = String(value || '').toLowerCase();
  if (!hay) return 0;
  if (!queryText) return 0.08;
  let score = 0;
  const cleanQuery = String(queryText || '').toLowerCase();
  if (hay.includes(cleanQuery)) score += 1.2;
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 0.35 : 0.18;
  }
  return score;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}