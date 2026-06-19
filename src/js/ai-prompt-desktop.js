'use strict';

window.buildHexDesktopContext = function buildHexDesktopContext() {
  const snapshot = window.hexCandidateStore?.snapshot?.() || {};
  const awareness = window.hexPcAwareness?.getSnapshot?.() || {};
  const inventory = window.hexPcInventory?.getSnapshot?.() || {};
  const recent = Array.isArray(snapshot.recent) ? snapshot.recent.slice(0, 3) : [];
  const promoted = Array.isArray(inventory.promoted) ? inventory.promoted.slice(0, 6) : [];
  const summarize = (items, fallbackKind) => (Array.isArray(items) ? items : [])
    .slice(0, 6)
    .map((item) => `${item.index}. ${item.label || item.value || item.path || fallbackKind}`);

  return {
    recent,
    promotedRecent: summarize(promoted, 'recent'),
    recentSummary: recent[0]
      ? ('#' + recent[0].index + ' ' + (recent[0].label || recent[0].value || recent[0].path || '') + ' [' + (recent[0].kind || 'item') + ']')
      : 'none',
    fileCandidates: summarize((awareness.inventory?.files || snapshot.file), 'file'),
    appCandidates: summarize((awareness.inventory?.apps || snapshot.app), 'app'),
    gameCandidates: summarize((awareness.inventory?.games || snapshot.game), 'game'),
    windowCandidates: summarize((awareness.windows || snapshot.window), 'window'),
    processCandidates: summarize((awareness.processes || snapshot.process), 'process'),
    inventorySummary: [
      'apps=' + ((awareness.inventory?.apps || snapshot.app || []).length || 0),
      'files=' + ((awareness.inventory?.files || snapshot.file || []).length || 0),
      'games=' + ((awareness.inventory?.games || snapshot.game || []).length || 0),
      'windows=' + ((awareness.windows || snapshot.window || []).length || 0),
      'processes=' + ((awareness.processes || snapshot.process || []).length || 0)
    ].join(' | ')
  };
};
