'use strict';

window.hexSessionContext = window.hexContextState?.state || window.hexSessionContext || {};

window.getLocalizedUserName = function getLocalizedUserName(name = window._hexConfig?.userName) {
  return window.i18n?.getLocalizedUserName
    ? window.i18n.getLocalizedUserName(name || 'Operator')
    : (name || 'Operator');
};

window.getLocalizedUnitName = function getLocalizedUnitName(mode = window.currentMode || 'hex', style = 'short') {
  if (window.i18n?.getAssistantName) {
    return window.i18n.getAssistantName(mode, style);
  }
  if (mode === 'cardinal') return 'CARDINAL';
  return style === 'display' ? 'H.E.X.' : 'HEX';
};

window.updateSessionContextForUser = function updateSessionContextForUser(text, browserStatus) {
  window.hexContextState?.updateForUser(text, browserStatus);
};

window.updateSessionContextForAssistant = function updateSessionContextForAssistant(text, actions) {
  window.hexContextState?.updateForAssistant(text, actions);
};

window.updateSessionContextForSystemData = function updateSessionContextForSystemData(infoResults) {
  window.hexContextState?.updateForSystemData(infoResults);
};

window.getBrowserSessionState = async function getBrowserSessionState() {
  return window.hexContextState?.getBrowserSessionState()
    || { open: false, url: null, title: null };
};

window.resolveSessionReference = function resolveSessionReference(text, surface = 'browser') {
  return window.hexContextState?.resolveReference?.(text, surface) || null;
};

function makeMinimalDesktopContext() {
  return {
    recent: [],
    recentSummary: 'lite-mode:on-demand',
    promotedRecent: [],
    knownLocations: [],
    fileCandidates: [],
    folderCandidates: [],
    appCandidates: [],
    gameCandidates: [],
    windowCandidates: [],
    processCandidates: [],
    inventoryHighlights: [],
    entityMatches: [],
    inventorySummary: 'desktop context deferred by Lite Performance Mode',
    inventoryAgeMinutes: null,
    deferred: true
  };
}

window.buildAIContextState = async function buildAIContextState(userText, options = {}) {
  const config = options.config || window._hexConfig || {};
  const sysStats = options.sysStats || window.sysStats || {};
  const browserSession = await window.getBrowserSessionState();
  if (!options.skipUserUpdate) {
    window.updateSessionContextForUser(userText, browserSession);
  }

  const recentTurns = window.hexMemory
    ? window.hexMemory.getRecentHistory(8)
    : window.hexAI.history.slice(-8);
  const working = window.hexMemory?.working || {};

  const sessionContext = window.hexContextState?.getSnapshot() || { ...window.hexSessionContext };
  const resolvedReference = options.resolvedReference || sessionContext.lastResolvedReference || null;
  if (resolvedReference) {
    sessionContext.resolvedReference = { ...resolvedReference };
  }
  const wantsDesktopContext = options.forceDesktopContext === true
    || !window.hexPerformancePolicy?.isLite?.()
    || window.hexPerformancePolicy?.needsDesktopContext?.(userText);
  const desktopContext = wantsDesktopContext && window.buildHexDesktopContext
    ? window.buildHexDesktopContext()
    : makeMinimalDesktopContext();

  if (userText && wantsDesktopContext) {
    const entityMatches = window.hexPcEntityMemory?.search?.(userText, [], 6) || [];
    desktopContext.entityMatches = entityMatches.map((item, index) => `${index + 1}. ${item.label || item.value || item.path || 'item'} [${item.kind || 'item'}]`);
  } else if (!Array.isArray(desktopContext.entityMatches)) {
    desktopContext.entityMatches = [];
  }

  return {
    cpu: sysStats.cpu,
    ram: sysStats.ram,
    disk: sysStats.disk,
    diskUsed: sysStats.diskUsed,
    diskFree: sysStats.diskFree,
    netRx: sysStats.netRx,
    netTx: sysStats.netTx,
    temp: sysStats.temp,
    platform: navigator.platform,
    uptime: document.getElementById('v-uptime')?.textContent,
    userName: window.getLocalizedUserName(config.userName),
    activeTask: typeof window.getActiveTask === 'function' ? window.getActiveTask() : null,
    ttsEngine: config.voice?.ttsEngine || 'os',
    aiProvider: config.llm?.provider || 'none',
    browserSession,
    sessionContext,
    desktopContext,
    workingMemory: {
      currentTask: working.currentTask || null,
      currentEntities: Array.isArray(working.currentEntities) ? [...working.currentEntities] : [],
      mood: working.mood || 'neutral'
    },
    recentTurns: recentTurns.map((turn) => ({
      role: turn.role || 'user',
      content: String(turn.content || '').substring(0, 180)
    }))
  };
};

