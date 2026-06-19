'use strict';

window.hexCandidatePublishers = (() => {
  function set(kind, items) {
    const result = window.hexCandidateStore?.set(kind, items) || [];
    window.hexRecentPromoter?.touchMany?.(kind, result, 1);
    window.hexPcAwareness?.syncFromCandidates?.();
    return result;
  }

  function rememberRecent(item) {
    if (!item || !item.label) return [];
    return set('recent', [{ ...item, index: 1 }]);
  }

  function publishFiles(files) {
    return set('file', (files || []).map((file, index) => ({
      index: index + 1,
      label: file.name || file.path,
      path: file.path,
      value: file.path,
      meta: { size: file.size || 0 }
    })));
  }

  function publishApps(apps) {
    return set('app', (apps || []).map((app, index) => ({
      index: index + 1,
      label: app.DisplayName || app.name || app.label || '',
      path: app.path || null,
      value: app.DisplayName || app.name || app.label || '',
      meta: { version: app.DisplayVersion || app.version || null }
    })));
  }

  function publishGames(games) {
    return set('game', (games || []).map((game, index) => ({
      index: index + 1,
      label: game.name || game.label || '',
      path: game.path || null,
      value: game.name || game.label || '',
      meta: game
    })));
  }

  function publishWindows(windows) {
    return set('window', (windows || []).map((win, index) => ({
      index: index + 1,
      label: win.MainWindowTitle || win.title || '',
      value: win.MainWindowTitle || win.title || '',
      meta: {
        processName: win.ProcessName || win.processName || '',
        pid: win.Id || win.pid || null
      }
    })));
  }

  function publishProcesses(processes) {
    return set('process', (processes || []).map((proc, index) => ({
      index: index + 1,
      label: proc.name || proc.ProcessName || '',
      value: proc.name || proc.ProcessName || '',
      meta: {
        pid: proc.pid || proc.Id || null,
        cpu: proc.cpu || null,
        mem: proc.mem || null
      }
    })));
  }

  return {
    rememberRecent,
    publishFiles,
    publishApps,
    publishGames,
    publishWindows,
    publishProcesses
  };
})();
