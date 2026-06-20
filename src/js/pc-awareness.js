'use strict';

window.hexPcAwareness = (() => {
  const state = {
    windows: [],
    processes: [],
    inventory: {
      apps: [],
      files: [],
      folders: [],
      games: [],
      recent: []
    },
    lastWindowsRefreshAt: 0,
    lastProcessesRefreshAt: 0
  };

  function cloneCandidateList(list, limit = 12) {
    return (Array.isArray(list) ? list : [])
      .slice(0, limit)
      .map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} }));
  }

  function syncFromCandidates() {
    const snapshot = window.hexCandidateStore?.snapshot?.() || {};
    state.inventory.apps = cloneCandidateList(snapshot.app, 12);
    state.inventory.files = cloneCandidateList(snapshot.file, 12);
    state.inventory.folders = cloneCandidateList(snapshot.folder, 12);
    state.inventory.games = cloneCandidateList(snapshot.game, 12);
    state.inventory.recent = cloneCandidateList(snapshot.recent, 6);
  }

  async function refreshWindows(force = false) {
    const now = Date.now();
    if (!window.hexPcAwarenessRefresh?.shouldRefresh?.(state.lastWindowsRefreshAt, force, 8000, 18000)) return state.windows;
    const result = await window.hexAPI?.butler?.listWindows?.().catch(() => null);
    if (result?.success && Array.isArray(result.windows)) {
      state.windows = result.windows
        .map((win, index) => ({
          index: index + 1,
          label: win.MainWindowTitle || '',
          value: win.MainWindowTitle || '',
          meta: { pid: win.Id || null, processName: win.ProcessName || '' }
        }))
        .filter((win) => win.label)
        .slice(0, 12);
      window.hexCandidatePublishers?.publishWindows(result.windows || []);
      state.lastWindowsRefreshAt = now;
      syncFromCandidates();
    }
    return state.windows;
  }

  async function refreshProcesses(force = false) {
    const now = Date.now();
    if (!window.hexPcAwarenessRefresh?.shouldRefresh?.(state.lastProcessesRefreshAt, force, 8000, 22000)) return state.processes;
    const result = await window.hexAPI?.butler?.listProcesses?.().catch(() => null);
    if (result?.success && Array.isArray(result.processes)) {
      state.processes = result.processes
        .map((proc, index) => ({
          index: index + 1,
          label: proc.name || '',
          value: proc.name || '',
          meta: { pid: proc.pid || null, cpu: proc.cpu || null, mem: proc.mem || null }
        }))
        .filter((proc) => proc.label)
        .slice(0, 12);
      window.hexCandidatePublishers?.publishProcesses(result.processes || []);
      state.lastProcessesRefreshAt = now;
      syncFromCandidates();
    }
    return state.processes;
  }

  function getSnapshot() {
    syncFromCandidates();
    return {
      windows: state.windows.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
      processes: state.processes.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
      inventory: {
        apps: state.inventory.apps.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
        files: state.inventory.files.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
        folders: state.inventory.folders.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
        games: state.inventory.games.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
        recent: state.inventory.recent.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} }))
      },
      lastWindowsRefreshAt: state.lastWindowsRefreshAt,
      lastProcessesRefreshAt: state.lastProcessesRefreshAt
    };
  }

  return {
    syncFromCandidates,
    refreshWindows,
    refreshProcesses,
    getSnapshot
  };
})();

