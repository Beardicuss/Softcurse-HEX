'use strict';

window.buildHexDesktopContext = function buildHexDesktopContext() {
  const snapshot = window.hexCandidateStore?.snapshot?.() || {};
  const awareness = window.hexPcAwareness?.getSnapshot?.() || {};
  const inventory = window.hexPcInventory?.getSnapshot?.() || {};
  const persistedSavedAt = window.hexPcInventory?.getPersistedSavedAt?.() || 0;
  const recent = Array.isArray(snapshot.recent) ? snapshot.recent.slice(0, 3) : [];
  const promoted = Array.isArray(inventory.promoted) ? inventory.promoted.slice(0, 6) : [];
  const summarize = (items, fallbackKind) => (Array.isArray(items) ? items : [])
    .slice(0, 6)
    .map((item) => `${item.index}. ${item.label || item.value || item.path || fallbackKind}`);
  const entityHighlights = (window.hexPcEntityMemory?.topHighlights?.(8) || [])
    .map((item, index) => `${index + 1}. ${item.label || item.value || item.path || 'item'} [${item.kind || 'item'}]`);
  const topInventory = [
    ...(inventory.apps || []).slice(0, 3),
    ...(inventory.files || []).slice(0, 3),
    ...(inventory.folders || []).slice(0, 3),
    ...(inventory.games || []).slice(0, 2)
  ]
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.label || item.value || item.path || 'item'} [${item.kind || 'item'}]`);
  const inventoryAge = persistedSavedAt
    ? Math.max(0, Math.round((Date.now() - persistedSavedAt) / (1000 * 60)))
    : null;

  return {
    recent,
    promotedRecent: summarize(promoted, 'recent'),
    knownLocations: (inventory.knownLocations || awareness.knownLocations || [])
      .slice(0, 6)
      .map((item, index) => `${index + 1}. ${item.label || item.value || 'location'}${item.meta?.alias ? ' [' + item.meta.alias + ']' : ''}`),
    recentSummary: recent[0]
      ? ('#' + recent[0].index + ' ' + (recent[0].label || recent[0].value || recent[0].path || '') + ' [' + (recent[0].kind || 'item') + ']')
      : 'none',
    fileCandidates: summarize((inventory.files || awareness.inventory?.files || snapshot.file), 'file'),
    folderCandidates: summarize((inventory.folders || awareness.inventory?.folders || snapshot.folder), 'folder'),
    appCandidates: summarize((inventory.apps || awareness.inventory?.apps || snapshot.app), 'app'),
    gameCandidates: summarize((inventory.games || awareness.inventory?.games || snapshot.game), 'game'),
    windowCandidates: summarize((inventory.windows || awareness.windows || snapshot.window), 'window'),
    processCandidates: summarize((inventory.processes || awareness.processes || snapshot.process), 'process'),
    inventoryHighlights: entityHighlights.length ? entityHighlights : topInventory,
    inventoryAgeMinutes: inventoryAge,
    inventorySummary: [
      'apps=' + ((inventory.apps || awareness.inventory?.apps || snapshot.app || []).length || 0),
      'files=' + ((inventory.files || awareness.inventory?.files || snapshot.file || []).length || 0),
      'folders=' + ((inventory.folders || awareness.inventory?.folders || snapshot.folder || []).length || 0),
      'games=' + ((inventory.games || awareness.inventory?.games || snapshot.game || []).length || 0),
      'windows=' + ((inventory.windows || awareness.windows || snapshot.window || []).length || 0),
      'processes=' + ((inventory.processes || awareness.processes || snapshot.process || []).length || 0),
      'locations=' + ((inventory.knownLocations || awareness.knownLocations || []).length || 0)
    ].join(' | ')
  };
};
