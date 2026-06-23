'use strict';

window.hexCloudContextRehydrator = (() => {
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

  function normalizeDesktopCandidates(list, kind, source = 'cloud-desktop') {
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
          meta: {
            ...(item?.meta || {}),
            source,
            rehydrated: true
          }
        };
      })
      .filter(Boolean);
  }

  function rehydrateBucket(kind, items, weight = 1.2) {
    if (!Array.isArray(items) || !items.length) return;
    window.hexCandidateStore?.merge?.(kind, items);
    window.hexPcEntityMemory?.ingest?.(items, kind, weight);
  }

  function rehydrateDesktopByCategory(references = {}) {
    const byCategory = references?.desktopByCategory || {};
    rehydrateBucket('app', normalizeDesktopCandidates(byCategory.apps, 'app', 'cloud-category'), 1.3);
    rehydrateBucket('file', normalizeDesktopCandidates(byCategory.files, 'file', 'cloud-category'), 1.2);
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.folders, 'folder', 'cloud-category'), 1.2);
    rehydrateBucket('game', normalizeDesktopCandidates(byCategory.games, 'game', 'cloud-category'), 1.35);
    rehydrateBucket('window', normalizeDesktopCandidates(byCategory.windows, 'window', 'cloud-category'), 1.05);
    rehydrateBucket('process', normalizeDesktopCandidates(byCategory.processes, 'process', 'cloud-category'), 1.0);
    rehydrateBucket('folder', normalizeDesktopCandidates(byCategory.locations, 'folder', 'cloud-category'), 1.2);
    rehydrateBucket('recent', normalizeDesktopCandidates(byCategory.recent, 'recent', 'cloud-category'), 1.15);
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

  function rehydrateReferences(references = {}) {
    const desktopItems = normalizeDesktopCandidates(references.desktop, 'recent', 'cloud-reference');
    const browserItems = normalizeDesktopCandidates(references.browser, 'browser', 'cloud-browser');
    rehydrateBucket('recent', desktopItems, 1.15);
    window.hexPcEntityMemory?.ingest?.(browserItems, 'browser', 1.1);
    rehydrateDesktopByCategory(references);
  }

  function rehydrateMemories(memories = []) {
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
            rehydrated: true
          }
        };
      })
      .filter(Boolean);
    rehydrateBucket('recent', items, 1.1);
  }

  function applyPacket(packet = null) {
    if (!packet || typeof packet !== 'object') return false;
    rehydrateDesktopContext(packet.desktopContext || {});
    rehydrateReferences(packet.references || {});
    rehydrateMemories(packet.relevantMemories || packet.memories || []);
    window.hexPcAwareness?.syncFromCandidates?.();
    window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
    window.hexPcInventory?.persistNow?.();
    return true;
  }

  return {
    applyPacket
  };
})();
