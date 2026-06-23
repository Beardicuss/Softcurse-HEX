'use strict';

window.hexPcEntityPromoter = (() => {
  function normalizeItems(items, kind, limit = 12, weight = 1.2) {
    return (Array.isArray(items) ? items : [])
      .slice(0, limit)
      .map((item, index) => ({
        kind: item.kind || kind,
        label: item.label || item.value || item.path || '',
        path: item.path || null,
        value: item.value || item.path || item.label || null,
        meta: {
          ...(item.meta || {}),
          promotedFrom: 'pc-inventory',
          promotedKind: kind,
          promotedRank: index + 1,
          promotedWeight: weight
        }
      }))
      .filter((item) => item.label);
  }

  function promoteInventorySnapshot(snapshot = null) {
    const inventory = snapshot || window.hexPcInventory?.getSnapshot?.();
    if (!inventory) return [];
    const batches = [
      normalizeItems(inventory.apps, 'app', 14, 1.2),
      normalizeItems(inventory.files, 'file', 14, 1.1),
      normalizeItems(inventory.folders, 'folder', 14, 1.25),
      normalizeItems(inventory.games, 'game', 10, 1.3),
      normalizeItems(inventory.windows, 'window', 8, 1.0),
      normalizeItems(inventory.processes, 'process', 8, 0.95),
      normalizeItems(inventory.knownLocations, 'folder', 10, 1.35),
      normalizeItems(inventory.promoted, 'recent', 10, 1.4)
    ];

    return batches.flatMap((items) => {
      const weight = Number(items[0]?.meta?.promotedWeight || 1.2);
      const kind = items[0]?.kind || 'item';
      return window.hexPcEntityMemory?.ingest?.(items, kind, weight) || [];
    });
  }

  return {
    promoteInventorySnapshot
  };
})();
