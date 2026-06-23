'use strict';
// ── brain-telemetry.js ──────────────────────────────────────────────────────
// Lightweight route/plan audit trail for debugging HEX brain decisions.

(function () {
  const VERSION = '1.0.0';
  const MAX_EVENTS = 80;
  const events = [];

  function clean(value, max = 220) {
    return String(value || '').trim().slice(0, max);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function compactEvent(event = {}) {
    return {
      id: 'bt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      at: nowIso(),
      phase: clean(event.phase, 40) || 'unknown',
      user: clean(event.user, 220),
      route: clean(event.route, 60),
      reason: clean(event.reason, 100),
      confidence: typeof event.confidence === 'number' ? event.confidence : null,
      actionDomain: clean(event.actionDomain, 60),
      actionSurface: clean(event.actionSurface, 40),
      actionUrgency: clean(event.actionUrgency, 20),
      providerRequired: event.providerRequired === true,
      serverPacket: event.serverPacket === true,
      serverMemoryHits: Number(event.serverMemoryHits || 0),
      sources: Array.isArray(event.sources) ? event.sources.slice(0, 8).map((item) => clean(item, 40)) : [],
      details: event.details && typeof event.details === 'object' ? event.details : null
    };
  }

  function record(event = {}) {
    const item = compactEvent(event);
    events.push(item);
    while (events.length > MAX_EVENTS) events.shift();
    if (window.addLog) {
      const route = item.route || item.actionDomain || item.phase;
      const why = item.reason || (item.sources || []).join(', ') || 'planned';
      window.addLog('BRAIN', route + ' :: ' + why);
    }
    return item;
  }

  function sync(event = {}) {
    const item = record(event);
    window.hexCloudSync?.runDetached?.('record brain telemetry', () => window.hexCloudSync.recordActivity({
      kind: 'brain-route',
      status: 'success',
      surface: item.actionSurface || 'chat',
      actionType: item.route || item.actionDomain || item.phase,
      summary: 'Brain ' + item.phase + ': ' + (item.route || item.actionDomain || 'unknown') + (item.reason ? ' (' + item.reason + ')' : ''),
      details: item
    }));
    return item;
  }

  function recent(limit = 20) {
    return events.slice(-Math.max(1, Math.min(80, Number(limit || 20))));
  }

  window.hexBrainTelemetry = { version: VERSION, record, sync, recent };
})();
