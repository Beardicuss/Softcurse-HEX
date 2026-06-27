'use strict';

window.hexCandidatePublishers = (() => {
  function set(kind, items, source = '') {
    const result = window.hexCandidateStore?.set(kind, items, source || kind + '-publisher') || [];
    window.hexRecentPromoter?.touchMany?.(kind, result, 1);
    window.hexPcAwareness?.syncFromCandidates?.();
    window.hexPcEntityMemory?.ingestSnapshot?.(window.hexCandidateStore?.snapshot?.() || {});
    window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
    window.hexPcInventory?.persistNow?.();
    return result;
  }

  function rememberRecent(item) {
    if (!item || !item.label) return [];
    const current = window.hexCandidateStore?.get('recent') || [];
    const merged = [{ ...item, index: 1 }, ...current]
      .filter(Boolean)
      .filter((entry, index, list) => list.findIndex((other) => {
        const a = [other?.kind || '', other?.path || '', other?.value || '', other?.label || ''].join('::').toLowerCase();
        const b = [entry?.kind || '', entry?.path || '', entry?.value || '', entry?.label || ''].join('::').toLowerCase();
        return a === b;
      }) === index)
      .slice(0, 10)
      .map((entry, index) => ({ ...entry, index: index + 1 }));
    const result = set('recent', merged, 'recent-action');
    window.hexPcEntityMemory?.ingest?.(result, 'recent', 1.5);
    return result;
  }

  function publishFiles(files) {
    return set('file', (files || []).map((file, index) => ({
      index: index + 1,
      label: file.name || file.path,
      path: file.path,
      value: file.path,
      meta: { size: file.size || 0, source: file.source || 'file-search' }
    })), 'file-search');
  }

  function publishApps(apps) {
    return set('app', (apps || []).map((app, index) => ({
      index: index + 1,
      label: app.DisplayName || app.name || app.label || '',
      path: app.path || null,
      value: app.DisplayName || app.name || app.label || '',
      meta: { version: app.DisplayVersion || app.version || null, source: app.source || 'app-scan' }
    })), 'app-scan');
  }

  function publishGames(games) {
    return set('game', (games || []).map((game, index) => ({
      index: index + 1,
      label: game.name || game.label || '',
      path: game.path || null,
      value: game.name || game.label || '',
      meta: { ...game, source: game.source || 'game-scan' }
    })), 'game-scan');
  }
  function publishFolders(folders) {
    return set('folder', (folders || []).map((folder, index) => ({
      index: index + 1,
      label: folder.name || folder.label || folder.path || '',
      path: folder.path || folder.value || null,
      value: folder.path || folder.value || folder.name || folder.label || '',
      meta: { ...(folder.meta || { targetType: 'folder' }), source: folder.meta?.source || folder.source || 'folder-scan' }
    })), 'folder-scan');
  }

  function publishWindows(windows) {
    return set('window', (windows || []).map((win, index) => ({
      index: index + 1,
      label: win.MainWindowTitle || win.title || '',
      value: win.MainWindowTitle || win.title || '',
      meta: {
        processName: win.ProcessName || win.processName || '',
        pid: win.Id || win.pid || null,
        source: 'window-refresh'
      }
    })), 'window-refresh');
  }

  function publishProcesses(processes) {
    return set('process', (processes || []).map((proc, index) => ({
      index: index + 1,
      label: proc.name || proc.ProcessName || '',
      value: proc.name || proc.ProcessName || '',
      meta: {
        pid: proc.pid || proc.Id || null,
        cpu: proc.cpu || null,
        mem: proc.mem || null,
        source: 'process-refresh'
      }
    })), 'process-refresh');
  }

  return {
    rememberRecent,
    publishFiles,
    publishApps,
    publishGames,
    publishFolders,
    publishWindows,
    publishProcesses
  };
})();
