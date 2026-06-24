'use strict';

window.hexPcAwarenessRefresh = (() => {
  const state = {
    window: { lastAttemptAt: 0, lastSuccessAt: 0, failures: 0 },
    process: { lastAttemptAt: 0, lastSuccessAt: 0, failures: 0 },
    signals: {
      lastUserDesktopAt: 0,
      lastUserBrowserAt: 0,
      lastDesktopActionAt: 0,
      lastProcessActionAt: 0,
      lastWindowActionAt: 0,
      lastInventoryBoostAt: 0,
      desktopPressure: 0,
      desktopIntent: 'general',
      lastIntentAt: 0
    }
  };

  function hasActiveDesktopContext() {
    const promoted = window.hexRecentPromoter?.top?.(4) || [];
    const browser = window.hexContextState?.getSnapshot?.()?.browserSnapshot || {};
    const processOverlayOpen = !!document.getElementById('process-overlay')?.classList?.contains('open');
    return promoted.length > 0 || !!browser.open || processOverlayOpen;
  }

  function ageMs(value) {
    return value ? Math.max(0, Date.now() - value) : Infinity;
  }

  function detectIntent(text = '') {
    const lower = String(text || '').toLowerCase();
    if (/\b(process|task|service|pid|kill|terminate|running)\b/.test(lower)) return 'process';
    if (/\b(window|tab|focus|switch|bring|close window)\b/.test(lower)) return 'window';
    if (/\b(app|program|software|game|file|folder|directory|document|desktop|downloads|documents)\b/.test(lower)) return 'inventory';
    return 'general';
  }

  function noteUserActivity(surface = 'chat', meta = {}) {
    const now = Date.now();
    if (surface === 'desktop') {
      state.signals.lastUserDesktopAt = now;
      state.signals.desktopPressure = Math.min(5, (state.signals.desktopPressure || 0) + (meta.followUp ? 2 : 1));
    }
    if (surface === 'browser') {
      state.signals.lastUserBrowserAt = now;
    }
    if (meta.inventoryBoost) {
      state.signals.lastInventoryBoostAt = now;
    }
  }

  function noteQueryIntent(text = '') {
    state.signals.desktopIntent = detectIntent(text);
    state.signals.lastIntentAt = Date.now();
  }

  function noteAction(kind = 'desktop') {
    const now = Date.now();
    state.signals.lastDesktopActionAt = now;
    if (kind === 'process') state.signals.lastProcessActionAt = now;
    if (kind === 'window') state.signals.lastWindowActionAt = now;
    state.signals.desktopPressure = Math.min(5, (state.signals.desktopPressure || 0) + 1);
  }

  function decayPressure() {
    const age = ageMs(Math.max(
      state.signals.lastUserDesktopAt || 0,
      state.signals.lastDesktopActionAt || 0,
      state.signals.lastProcessActionAt || 0,
      state.signals.lastWindowActionAt || 0
    ));
    if (age > 60000) return 0;
    if (age > 30000) return Math.min(state.signals.desktopPressure || 0, 1);
    if (age > 15000) return Math.min(state.signals.desktopPressure || 0, 2);
    return state.signals.desktopPressure || 0;
  }

  function getPolicy(kind) {
    const info = state[kind] || state.window;
    const active = hasActiveDesktopContext();
    const pressure = decayPressure();
    const recentDesktop = ageMs(state.signals.lastUserDesktopAt) < 20000;
    const recentInventoryBoost = ageMs(state.signals.lastInventoryBoostAt) < 25000;
    const recentKindAction = kind === 'window'
      ? ageMs(state.signals.lastWindowActionAt) < 20000
      : ageMs(state.signals.lastProcessActionAt) < 20000;
    const intentAgeFresh = ageMs(state.signals.lastIntentAt) < 15000;
    const currentIntent = intentAgeFresh ? state.signals.desktopIntent : 'general';

    const activeMs = kind === 'window' ? 7000 : 9000;
    const idleMs = kind === 'window' ? 18000 : 22000;
    let minInterval = active ? activeMs : idleMs;

    if (recentDesktop) minInterval -= kind === 'window' ? 2500 : 2000;
    if (recentKindAction) minInterval -= kind === 'window' ? 2000 : 2500;
    if (recentInventoryBoost) minInterval -= 1500;
    minInterval -= pressure * 700;

    if (currentIntent === 'window') {
      minInterval += kind === 'process' ? 4500 : -1500;
    } else if (currentIntent === 'process') {
      minInterval += kind === 'window' ? 4500 : -1500;
    } else if (currentIntent === 'inventory') {
      minInterval += 3000;
    }

    const multiplier = window.hexPerformancePolicy?.awarenessMultiplier?.() || 1;
    const pressureBackoff = window.hexPerformancePolicy?.isSystemUnderPressure?.() ? 20000 : 0;
    const failureBackoffMs = Math.min((info.failures || 0) * 5000, 30000);
    const floor = kind === 'window' ? 2500 : 3500;
    minInterval = Math.max(floor * multiplier, minInterval * multiplier) + failureBackoffMs + pressureBackoff;

    return {
      active,
      pressure,
      recentDesktop,
      recentKindAction,
      recentInventoryBoost,
      currentIntent,
      minInterval
    };
  }

  function shouldRefresh(kind, lastAt, force = false) {
    if (force) return true;
    if (document.hidden) return false;
    const policy = getPolicy(kind);
    return (Date.now() - (lastAt || 0)) >= policy.minInterval;
  }

  function noteAttempt(kind) {
    if (!state[kind]) return;
    state[kind].lastAttemptAt = Date.now();
  }

  function noteResult(kind, success) {
    if (!state[kind]) return;
    if (success) {
      state[kind].lastSuccessAt = Date.now();
      state[kind].failures = 0;
      return;
    }
    state[kind].failures += 1;
  }


  function planRefreshForTurn(actionPlan = {}, context = {}) {
    const domain = String(actionPlan.domain || 'dialogue');
    const surface = String(actionPlan.suggestedSurface || context.surface || 'chat');
    const urgent = actionPlan.urgency === 'high';
    const browserOpen = !!actionPlan.browserOpen;
    const plan = {
      refreshWindows: false,
      refreshProcesses: false,
      pulseDesktop: false,
      inventoryBoost: false,
      captureBrowser: false,
      reason: domain
    };

    if (domain === 'desktop-action' || domain === 'desktop-follow-up') {
      plan.pulseDesktop = true;
      plan.inventoryBoost = true;
      plan.refreshWindows = true;
      plan.refreshProcesses = /process|kill|running|task/.test(String(context.text || '').toLowerCase()) || urgent;
    } else if (domain === 'browser-action' || domain === 'browser-follow-up') {
      plan.captureBrowser = browserOpen;
      plan.refreshWindows = false;
      plan.refreshProcesses = false;
    } else if (domain === 'continuity') {
      plan.refreshWindows = surface === 'desktop';
      plan.refreshProcesses = false;
      plan.captureBrowser = surface === 'browser' && browserOpen;
    } else if (domain === 'memory-read' || domain === 'memory-write' || domain === 'profile') {
      plan.refreshWindows = false;
      plan.refreshProcesses = false;
    } else if (domain === 'reasoning') {
      plan.refreshWindows = false;
      plan.refreshProcesses = false;
    }

    return plan;
  }

  function getState() {
    return JSON.parse(JSON.stringify({
      ...state,
      signals: {
        ...state.signals,
        effectivePressure: decayPressure()
      }
    }));
  }

  return {
    shouldRefresh,
    noteAttempt,
    noteResult,
    noteUserActivity,
    noteQueryIntent,
    noteAction,
    planRefreshForTurn,
    getPolicy,
    getState,
    hasActiveDesktopContext
  };
})();
