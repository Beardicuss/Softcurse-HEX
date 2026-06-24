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
    const categoryMeta = (category) => ({ retrievalSchema: schema, categoryCount: categoryCounts[category] || 0 });
    rehydrateBucket('app', normalizeDesktopCandidates(byCategory.apps, 'app', 'cloud-category', categoryMeta('apps')), 1.3);
    rehydrateBucket('file', normalizeDesktopCandidates(byCategory.files, 'file', 'cloud-category', categoryMeta('files')), 1.2);
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.folders, 'folder', 'cloud-category', categoryMeta('folders')), 1.2);
    rehydrateBucket('game', normalizeDesktopCandidates(byCategory.games, 'game', 'cloud-category', categoryMeta('games')), 1.35);
    rehydrateBucket('window', normalizeDesktopCandidates(byCategory.windows, 'window', 'cloud-category', categoryMeta('windows')), 1.05);
    rehydrateBucket('process', normalizeDesktopCandidates(byCategory.processes, 'process', 'cloud-category', categoryMeta('processes')), 1.0);
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.locations, 'folder', 'cloud-category', categoryMeta('locations')), 1.2);
    rehydrateBucket('recent', normalizeDesktopCandidates(byCategory.recent, 'recent', 'cloud-category', categoryMeta('recent')), 1.15);
  }

  function rehydrateDesktopContext(desktopContext = {}) {
    rehydrateBucket('app', normalizeDesktopCandidates(desktopContext.appCandidates || desktopContext.apps, 'app'), 1.25);
    rehydrateBucket('file', normalizeDesktopCandidates(desktopContext.fileCandidates || desktopContext.files, 'file'), 1.15);
    rehydrateBucket('folder', normalizeDesktopCandidates(desktopContext.folderCandidates || desktopContext.folders, 'folder'), 1.2);
    rehydrateBucket('game', normalizeDesktopCandidates(desktopContext.gameCandidates || desktopContext.games, 'game'), 1.3);
    rehydrateBucket('window', normalizeDesktopCandidates(desktopContext.windowCandidates || desktopContext.windows, 'window'), 1.0);
    rehydrateBucket('process', normalizeDesktopCandidates(desktopContext.processCandidates || desktopContext.processes, 'process'), 0.95);
    rehydrateBucket('recent', normalizeDesktopCandidates(desktopContext.promotedRecent || desktopContext.inventoryHighlights, 'recent'), 1.35);
    rehydrateBucket('folder', normalizeDesktopCandidates(desktopContext.knownLocations, 'folder', 'cloud-location'), 1.25);
    rehydrateBucket('recent', normalizeDesktopCandidates(desktopContext.entityMatches, 'recent', 'cloud-entity'), 1.3);
  }

  function rehydrateReferences(references = {}, packet = {}) {
    const retrievalSchema = packet?.retrieval?.schema || null;
    const priorityItems = normalizeDesktopCandidates(references.priority, 'recent', 'cloud-priority', { retrievalSchema, priority: true });
    const desktopItems = normalizeDesktopCandidates(references.desktop, 'recent', 'cloud-reference', { retrievalSchema });
    const browserItems = normalizeDesktopCandidates(references.browser, 'browser', 'cloud-browser', { retrievalSchema });
    rehydrateBucket('recent', priorityItems, 1.45);
    window.hexPcEntityMemory?.ingest?.(priorityItems, 'priority', 1.45);
    rehydrateBucket('recent', desktopItems, 1.15);
    window.hexPcEntityMemory?.ingest?.(browserItems, 'browser', 1.1);
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
    rehydrateBucket('recent', items, 1.1);
  }

  function applyPacket(packet = null) {
    if (!packet || typeof packet !== 'object') return false;
    lastContinuityState = packet.continuityState && typeof packet.continuityState === 'object' ? { ...packet.continuityState } : null;
    rehydrateDesktopContext(packet.desktopContext || {});
    rehydrateReferences(packet.references || {}, packet);
    rehydrateMemories(packet.relevantMemories || packet.memories || [], packet);
    window.hexPcAwareness?.syncFromCandidates?.();
    window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
    window.hexPcInventory?.persistNow?.();
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
