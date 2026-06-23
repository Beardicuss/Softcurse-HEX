'use strict';

window.hexPcAwareness = (() => {
  const state = {
    windows: [],
    processes: [],
    knownLocations: [],
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
    state.knownLocations = (window.hexPcKnownLocations?.listAll?.() || [])
      .map((item, index) => ({
        kind: item.kind || 'folder',
        index: index + 1,
        label: item.label,
        value: item.alias,
        path: null,
        meta: {
          alias: item.alias,
          priority: item.priority || 0,
          startup: !!item.startup,
          source: 'known-location'
        }
      }));
  }

  function mergeMetaByLabel(previous = [], next = [], rankMetaFactory) {
    const prevByKey = new Map((Array.isArray(previous) ? previous : []).map((item) => [String(item?.label || '').toLowerCase(), item]));
    return (Array.isArray(next) ? next : []).map((item, index) => {
      const existing = prevByKey.get(String(item?.label || '').toLowerCase());
      const rankMeta = rankMetaFactory(index);
      return {
        ...item,
        index: index + 1,
        meta: {
          ...(existing?.meta || {}),
          ...(item?.meta || {}),
          ...rankMeta
        }
      };
    });
  }

  async function refreshWindows(force = false) {
    const now = Date.now();
    if (!window.hexPcAwarenessRefresh?.shouldRefresh?.('window', state.lastWindowsRefreshAt, force)) return state.windows;
    window.hexPcAwarenessRefresh?.noteAttempt?.('window');
    const result = await window.hexAPI?.butler?.listWindows?.().catch(() => null);
    if (result?.success && Array.isArray(result.windows)) {
      const nextWindows = result.windows
        .map((win, index) => ({
          index: index + 1,
          label: win.MainWindowTitle || '',
          value: win.MainWindowTitle || '',
          meta: { pid: win.Id || null, processName: win.ProcessName || '' }
        }))
        .filter((win) => win.label)
        .slice(0, 12);
      window.hexCandidatePublishers?.publishWindows(result.windows || []);
      state.windows = mergeMetaByLabel(state.windows, nextWindows, (index) => ({
        lastFocusedAt: now,
        focusRank: Math.max(1, 12 - index)
      }));
      state.lastWindowsRefreshAt = now;
      window.hexPcAwarenessRefresh?.noteResult?.('window', true);
      syncFromCandidates();
      return state.windows;
    }
    window.hexPcAwarenessRefresh?.noteResult?.('window', false);
    return state.windows;
  }

  async function refreshProcesses(force = false) {
    const now = Date.now();
    if (!window.hexPcAwarenessRefresh?.shouldRefresh?.('process', state.lastProcessesRefreshAt, force)) return state.processes;
    window.hexPcAwarenessRefresh?.noteAttempt?.('process');
    const result = await window.hexAPI?.butler?.listProcesses?.().catch(() => null);
    if (result?.success && Array.isArray(result.processes)) {
      const nextProcesses = result.processes
        .map((proc, index) => ({
          index: index + 1,
          label: proc.name || '',
          value: proc.name || '',
          meta: { pid: proc.pid || null, cpu: proc.cpu || null, mem: proc.mem || null }
        }))
        .filter((proc) => proc.label)
        .slice(0, 12);
      window.hexCandidatePublishers?.publishProcesses(result.processes || []);
      state.processes = mergeMetaByLabel(state.processes, nextProcesses, (index) => ({
        refreshRank: Math.max(1, 12 - index),
        seenAt: now
      }));
      state.lastProcessesRefreshAt = now;
      window.hexPcAwarenessRefresh?.noteResult?.('process', true);
      syncFromCandidates();
      return state.processes;
    }
    window.hexPcAwarenessRefresh?.noteResult?.('process', false);
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
      knownLocations: state.knownLocations.map((item) => ({ ...item, meta: item?.meta ? { ...item.meta } : {} })),
      lastWindowsRefreshAt: state.lastWindowsRefreshAt,
      lastProcessesRefreshAt: state.lastProcessesRefreshAt,
      refreshState: window.hexPcAwarenessRefresh?.getState?.() || {}
    };
  }

  return {
    syncFromCandidates,
    refreshWindows,
    refreshProcesses,
    getSnapshot
  };
})();
