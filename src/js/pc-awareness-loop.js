'use strict';

window.hexPcAwarenessLoop = (() => {
  let timer = null;
  let ticking = false;

  function isEnabled() {
    return !document.hidden && !window.hexSleep?._sleeping;
  }

  async function tick(force = false) {
    if (ticking || !isEnabled()) return;
    const refresh = window.hexPcAwarenessRefresh;
    if (!force && !refresh?.hasActiveDesktopContext?.()) return;

    ticking = true;
    try {
      await Promise.allSettled([
        window.hexPcAwareness?.refreshWindows?.(force),
        window.hexPcAwareness?.refreshProcesses?.(force)
      ]);
      window.hexPcInventory?.persistNow?.();
    } finally {
      ticking = false;
    }
  }

  function scheduleNext() {
    if (!timer) return;
    const refresh = window.hexPcAwarenessRefresh;
    const windowPolicy = refresh?.getPolicy?.('window') || { minInterval: 7000 };
    const processPolicy = refresh?.getPolicy?.('process') || { minInterval: 9000 };
    const nextDelay = Math.max(2500, Math.min(windowPolicy.minInterval, processPolicy.minInterval, 8000));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await tick(false).catch(() => { });
      scheduleNext();
    }, nextDelay);
  }

  function pulse(surface = 'desktop', meta = {}) {
    window.hexPcAwarenessRefresh?.noteUserActivity?.(surface, meta);
    if (surface === 'desktop' || meta.inventoryBoost || meta.followUp) {
      tick(false).catch(() => { });
      scheduleNext();
    }
  }

  function start() {
    if (timer) return;
    timer = setTimeout(async () => {
      await tick(false).catch(() => { });
      scheduleNext();
    }, 4000);
    window._hexIntervals = window._hexIntervals || [];
    window._hexIntervals.push(timer);
  }

  return {
    start,
    tick,
    pulse
  };
})();
