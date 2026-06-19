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
    if (/\b(file|document|folder|image|video|song|track|photo|pdf)\b/.test(lower)) return 'file';
    if (/\b(game|steam|epic)\b/.test(lower)) return 'game';
    if (/\b(process|task|service|pid)\b/.test(lower)) return 'process';
    if (/\b(window|tab)\b/.test(lower)) return 'window';
    if (/\b(app|program|software|browser)\b/.test(lower)) return 'app';
    return null;
  }

  function hasPronounReference(text) {
    return /\b(it|that|this|them|those|these)\b/.test(String(text || '').toLowerCase());
  }

  function resolveDesktopReference(text, preferredKind = null) {
    const query = String(text || '').trim();
    if (!query) return null;

    let kind = preferredKind || detectKind(query);
    let pool = kind ? (window.hexCandidateStore?.get(kind) || []) : [];
    if (!pool.length && hasPronounReference(query)) {
      const recent = window.hexCandidateStore?.get('recent') || [];
      if (recent.length) {
        kind = recent[0].kind || kind || 'file';
        pool = kind ? (window.hexCandidateStore?.get(kind) || []) : [];
        if (!pool.length) pool = recent;
      }
    }
    if (!pool.length) {
      kind = kind || 'file';
      pool = window.hexCandidateStore?.get(kind) || [];
    }
    if (!pool.length) return null;

    const ordinal = ordinalIndex(query);
    if (ordinal !== null) {
      const hit = ordinal === -1 ? pool[pool.length - 1] : pool[ordinal] || null;
      return hit ? { ...hit, kind: hit.kind || kind } : null;
    }

    const lower = query.toLowerCase();
    const matched = pool.find((item) =>
      `${item.label} ${item.path || ''} ${item.value || ''}`.toLowerCase().includes(lower)
    ) || null;
    return matched ? { ...matched, kind: matched.kind || kind } : null;
  }

  function isDesktopReferenceCommand(text) {
    const lower = String(text || '').trim().toLowerCase();
    return /^(open|launch|play|start|show|reveal|locate|close|focus|switch|select|kill|terminate|end)\s+/.test(lower) &&
      /\b(first|second|third|fourth|fifth|last|it|that|this|them|those|these)\b/.test(lower);
  }

  return {
    resolveDesktopReference,
    isDesktopReferenceCommand
  };
})();
