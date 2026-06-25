'use strict';

window.hexCloudContextRehydrator = (() => {
  let lastContinuityState = null;

  function normalizeLabel(value) {
    return String(value || '').trim();
  }

  function parseKind(value, fallback = 'recent') {
    const text = String(value || '').toLowerCase();
    if (/\bgame\b/.test(text)) return 'game';
    if (/\bapp\b/.test(text) || /\bsoftware\b/.test(text) || /\bprogram\b/.test(text)) return 'app';
    if (/\bfile\b/.test(text) || /\bdocument\b/.test(text)) return 'file';
    if (/\bfolder\b/.test(text) || /\blocation\b/.test(text) || /\bdirectory\b/.test(text)) return 'folder';
    if (/\bwindow\b/.test(text)) return 'window';
    if (/\bprocess\b/.test(text)) return 'process';
    if (/\bbrowser\b/.test(text) || /\bvideo\b/.test(text) || /\blink\b/.test(text) || /\bpage\b/.test(text)) return 'browser';
    return fallback;
  }


  function packetFreshness(packet = {}, purpose = 'session') {
    const state = packet?.continuityState || null;
    if (!state?.schema) return { fresh: true, stale: false, reason: 'legacy-packet-no-freshness', ageSeconds: null };
    const freshness = state.freshness || {};
    const rules = {
      browser: { keys: ['lastTurnSeconds', 'sessionSeconds'], max: 15 * 60, requires: () => state.browser?.open === true },
      inventory: { keys: ['inventorySeconds', 'sessionSeconds'], max: 6 * 60 * 60, requires: () => state.hasDesktopInventory === true },
      action: { keys: ['lastActionSeconds', 'lastTurnSeconds', 'sessionSeconds'], max: 20 * 60, requires: () => true },
      session: { keys: ['sessionSeconds', 'lastTurnSeconds'], max: 45 * 60, requires: () => true },
      memory: { keys: ['sessionSeconds', 'lastTurnSeconds'], max: 24 * 60 * 60, requires: () => true }
    };
    const rule = rules[purpose] || rules.session;
    const ageSeconds = rule.keys.map((key) => Number(freshness[key])).find((value) => Number.isFinite(value));
    if (rule.requires && !rule.requires()) return { fresh: false, stale: true, reason: purpose + '-state-missing', ageSeconds: ageSeconds ?? null };
    if (ageSeconds == null) return { fresh: true, stale: false, reason: 'freshness-age-missing', ageSeconds: null };
    const fresh = ageSeconds <= rule.max;
    return { fresh, stale: !fresh, reason: fresh ? purpose + '-fresh' : purpose + '-stale', ageSeconds };
  }

  function freshnessMeta(packet, purpose) {
    const freshness = packetFreshness(packet, purpose);
    return {
      contextPurpose: purpose,
      contextFresh: freshness.fresh,
      contextStale: freshness.stale,
      contextFreshnessReason: freshness.reason,
      contextAgeSeconds: freshness.ageSeconds
    };
  }

  function weightFor(packet, purpose, weight) {
    return packetFreshness(packet, purpose).stale ? Math.max(0.2, weight * 0.45) : weight;
  }
  function fromStrings(list, fallbackKind = 'recent', source = 'cloud-reference') {
    return (Array.isArray(list) ? list : [])
      .map((value, index) => {
        const label = normalizeLabel(value);
        if (!label) return null;
        return {
          index: index + 1,
          kind: parseKind(label, fallbackKind),
          label,
          value: label,
          meta: { source, rehydrated: true }
        };
      })
      .filter(Boolean);
  }

  function metaFromPacketItem(item = {}, source = 'cloud-desktop', extra = {}) {
    return {
      ...(item?.meta || {}),
      ...extra,
      source,
      rehydrated: true,
      retrievalReason: item?.retrievalReason || item?.reason || extra.retrievalReason || null,
      retrievalSchema: extra.retrievalSchema || null
    };
  }

  function normalizeDesktopCandidates(list, kind, source = 'cloud-desktop', extraMeta = {}) {
    return (Array.isArray(list) ? list : [])
      .map((item, index) => {
        const label = normalizeLabel(item?.label || item?.value || item?.path || item);
        if (!label) return null;
        return {
          index: index + 1,
          kind: item?.kind || kind,
          label,
          path: item?.path || null,
          value: item?.value || item?.path || label,
          meta: metaFromPacketItem(item, source, extraMeta)
        };
      })
      .filter(Boolean);
  }

  function rehydrateBucket(kind, items, weight = 1.2) {
    if (!Array.isArray(items) || !items.length) return;
    window.hexCandidateStore?.merge?.(kind, items);
    window.hexPcEntityMemory?.ingest?.(items, kind, weight);
  }

  function rehydrateDesktopByCategory(references = {}, packet = {}) {
    const byCategory = references?.desktopByCategory || {};
    const categoryCounts = packet?.retrieval?.categoryCounts || {};
    const schema = packet?.retrieval?.schema || null;
    const categoryMeta = (category) => ({ retrievalSchema: schema, categoryCount: categoryCounts[category] || 0, ...freshnessMeta(packet, 'inventory') });
    rehydrateBucket('app', normalizeDesktopCandidates(byCategory.apps, 'app', 'cloud-category', categoryMeta('apps')), weightFor(packet, 'inventory', 1.3));
    rehydrateBucket('file', normalizeDesktopCandidates(byCategory.files, 'file', 'cloud-category', categoryMeta('files')), weightFor(packet, 'inventory', 1.2));
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.folders, 'folder', 'cloud-category', categoryMeta('folders')), weightFor(packet, 'inventory', 1.2));
    rehydrateBucket('game', normalizeDesktopCandidates(byCategory.games, 'game', 'cloud-category', categoryMeta('games')), weightFor(packet, 'inventory', 1.35));
    rehydrateBucket('window', normalizeDesktopCandidates(byCategory.windows, 'window', 'cloud-category', categoryMeta('windows')), weightFor(packet, 'inventory', 1.05));
    rehydrateBucket('process', normalizeDesktopCandidates(byCategory.processes, 'process', 'cloud-category', categoryMeta('processes')), weightFor(packet, 'inventory', 1.0));
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.locations, 'folder', 'cloud-category', categoryMeta('locations')), weightFor(packet, 'inventory', 1.2));
    rehydrateBucket('recent', normalizeDesktopCandidates(byCategory.recent, 'recent', 'cloud-category', categoryMeta('recent')), weightFor(packet, 'inventory', 1.15));
  }

  function rehydrateDesktopContext(desktopContext = {}, packet = {}) {
    rehydrateBucket('app', normalizeDesktopCandidates(desktopContext.appCandidates || desktopContext.apps, 'app', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.25));
    rehydrateBucket('file', normalizeDesktopCandidates(desktopContext.fileCandidates || desktopContext.files, 'file', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.15));
    rehydrateBucket('folder', normalizeDesktopCandidates(desktopContext.folderCandidates || desktopContext.folders, 'folder', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.2));
    rehydrateBucket('game', normalizeDesktopCandidates(desktopContext.gameCandidates || desktopContext.games, 'game', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.3));
    rehydrateBucket('window', normalizeDesktopCandidates(desktopContext.windowCandidates || desktopContext.windows, 'window', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.0));
    rehydrateBucket('process', normalizeDesktopCandidates(desktopContext.processCandidates || desktopContext.processes, 'process', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 0.95));
    rehydrateBucket('recent', normalizeDesktopCandidates(desktopContext.promotedRecent || desktopContext.inventoryHighlights, 'recent', 'cloud-desktop', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.35));
    rehydrateBucket('folder', normalizeDesktopCandidates(desktopContext.knownLocations, 'folder', 'cloud-location', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.25));
    rehydrateBucket('recent', normalizeDesktopCandidates(desktopContext.entityMatches, 'recent', 'cloud-entity', freshnessMeta(packet, 'inventory')), weightFor(packet, 'inventory', 1.3));
  }

  function rehydrateReferences(references = {}, packet = {}) {
    const retrievalSchema = packet?.retrieval?.schema || null;
    const priorityItems = normalizeDesktopCandidates(references.priority, 'recent', 'cloud-priority', { retrievalSchema, priority: true, ...freshnessMeta(packet, 'session') });
    const desktopItems = normalizeDesktopCandidates(references.desktop, 'recent', 'cloud-reference', { retrievalSchema, ...freshnessMeta(packet, 'inventory') });
    const browserItems = normalizeDesktopCandidates(references.browser, 'browser', 'cloud-browser', { retrievalSchema, ...freshnessMeta(packet, 'browser') });
    rehydrateBucket('recent', priorityItems, weightFor(packet, 'session', 1.45));
    window.hexPcEntityMemory?.ingest?.(priorityItems, 'priority', weightFor(packet, 'session', 1.45));
    rehydrateBucket('recent', desktopItems, weightFor(packet, 'inventory', 1.15));
    window.hexPcEntityMemory?.ingest?.(browserItems, 'browser', weightFor(packet, 'browser', 1.1));
    rehydrateDesktopByCategory(references, packet);
  }
  function rehydrateMemories(memories = [], packet = {}) {
    const items = (Array.isArray(memories) ? memories : [])
      .map((memory, index) => {
        const content = normalizeLabel(memory?.content);
        if (!content) return null;
        return {
          index: index + 1,
          kind: parseKind(memory?.kind || content, 'recent'),
          label: content,
          value: content,
          meta: {
            memoryKind: memory?.kind || 'memory',
            confidence: Number(memory?.confidence || 0),
            source: 'cloud-memory',
            rehydrated: true,
            retrievalReason: memory?.retrievalReason || null,
            retrievalSchema: packet?.retrieval?.schema || null
          }
        };
      })
      .filter(Boolean);
    rehydrateBucket('recent', items, weightFor(packet, 'memory', 1.1));
  }

  function applyPacket(packet = null) {
    if (!packet || typeof packet !== 'object') return false;
    lastContinuityState = packet.continuityState && typeof packet.continuityState === 'object' ? { ...packet.continuityState } : null;
    rehydrateDesktopContext(packet.desktopContext || {}, packet);
    rehydrateReferences(packet.references || {}, packet);
    rehydrateMemories(packet.relevantMemories || packet.memories || [], packet);
    window.hexPcAwareness?.syncFromCandidates?.();
    if (packetFreshness(packet, 'inventory').fresh) {
      window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
      window.hexPcInventory?.persistNow?.();
    }
    return true;
  }

  function getLastContinuityState() {
    return lastContinuityState ? { ...lastContinuityState } : null;
  }

  return {
    applyPacket,
    getLastContinuityState
  };
})();
