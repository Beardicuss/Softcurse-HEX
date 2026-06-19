'use strict';

window.hexPcAwarenessRefresh = (() => {
  function hasActiveDesktopContext() {
    const promoted = window.hexRecentPromoter?.top?.(3) || [];
    const browser = window.hexContextState?.getSnapshot?.()?.browserSnapshot || {};
    return promoted.length > 0 || !!browser.open;
  }

  function shouldRefresh(lastAt, force = false, activeMs = 8000, idleMs = 18000) {
    if (force) return true;
    const minInterval = hasActiveDesktopContext() ? activeMs : idleMs;
    return (Date.now() - (lastAt || 0)) >= minInterval;
  }

  return {
    shouldRefresh
  };
})();
