'use strict';
// ── main/telemetry.js ─────────────────────────────────────────────────────────
// System resource polling (CPU / RAM / disk / network / temp) and
// activity-based break / idle monitoring.
//
// Returns { startPolling } — call it with the current BrowserWindow.
// Each call replaces the previous poll interval and returns the new timer id.

const os = require('os');

module.exports = function registerTelemetry({ si, formatBytes, safeSend, powerMonitor, getConfig }) {

  // ── Activity state ─────────────────────────────────────────────────────────
  const activityState = {
    sessionStart:   Date.now(),
    lastActive:     Date.now(),
    breakSuggested: false,
    breakCount:     0,
    idleAlertSent:  false,
  };

  // powerMonitor events
  powerMonitor.on('user-did-become-active', () => {
    const was = activityState.lastActive;
    activityState.lastActive  = Date.now();
    activityState.idleAlertSent = false;
    const idleMin = Math.round((Date.now() - was) / 60000);
    const config  = getConfig();
    if (idleMin > (config.monitoring?.idleThresholdMin || 5)) {
      safeSend('activity:event', { type: 'return_from_idle', idleMin });
    }
  });

  powerMonitor.on('user-did-resign-active', () => {
    activityState.lastActive = Date.now();
  });

  // Break suggestion interval (checked every minute)
  setInterval(() => {
    const config = getConfig();
    if (!config.monitoring?.proactiveAdvice) return;
    const activeMin     = Math.round((Date.now() - activityState.sessionStart) / 60000);
    const breakInterval = config.monitoring?.breakIntervalMin || 90;

    if (config.monitoring?.breaks && activeMin >= breakInterval && !activityState.breakSuggested) {
      activityState.breakSuggested = true;
      activityState.breakCount++;
      safeSend('activity:event', { type: 'break_suggestion', activeMin });
    }
    if (activeMin >= breakInterval + 15) {
      activityState.breakSuggested = false;
      activityState.sessionStart   = Date.now();
    }
  }, 60000);

  // ── Resource polling ───────────────────────────────────────────────────────
  // Returns the interval timer so window.js can store and clear it.
  function startPolling(mainWindow) {
    let _pollCount = 0;
    let _lastTemp  = '—';

    const poll = async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      _pollCount++;
      try {
        const doTemp = (_pollCount % 6 === 0); // temp is expensive on Windows (WMI)
        const tasks  = [si.currentLoad(), si.mem(), si.fsSize(), si.networkStats()];
        if (doTemp) tasks.push(si.cpuTemperature());

        const results = await Promise.allSettled(tasks);

        const cpu = results[0].status === 'fulfilled' ? results[0].value : null;
        const m   = results[1].status === 'fulfilled' ? results[1].value : null;
        const d   = results[2].status === 'fulfilled' ? results[2].value : [];
        const n   = results[3].status === 'fulfilled' ? results[3].value : [];
        if (doTemp) {
          const t = results[4].status === 'fulfilled' ? results[4].value : null;
          _lastTemp = t && t.main ? Math.round(t.main) + '°C' : '—';
        }

        const primaryDisk = d.find(x => x.mount === '/' || x.mount === 'C:') || d[0] || {};
        const primaryNet  = n[0] || {};

        safeSend('system:update', {
          cpu:      cpu ? Math.round(cpu.currentLoad) : 0,
          ram:      m   ? Math.round((m.used / m.total) * 100) : 0,
          ramUsed:  m   ? formatBytes(m.used)      : '—',
          ramTotal: m   ? formatBytes(m.total)     : '—',
          disk:     primaryDisk.size ? Math.round((primaryDisk.used / primaryDisk.size) * 100) : 0,
          diskUsed: primaryDisk.used       ? formatBytes(primaryDisk.used)      : '—',
          diskFree: primaryDisk.available  ? formatBytes(primaryDisk.available) : '—',
          netRx:    primaryNet.rx_sec != null ? formatBytes(primaryNet.rx_sec) + '/s' : '—',
          netTx:    primaryNet.tx_sec != null ? formatBytes(primaryNet.tx_sec) + '/s' : '—',
          temp:     _lastTemp,
          ts:       Date.now(),
        });
      } catch (_) { /* silently skip failed poll */ }
    };

    poll();
    return setInterval(poll, 5000);
  }

  return { startPolling };
};
