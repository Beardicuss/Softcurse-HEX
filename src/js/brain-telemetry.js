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

  function compactPriorityItem(item = {}) {
    return {
      label: clean(item.label || item.value || item.title, 80),
      kind: clean(item.kind || item.type, 30),
      purpose: clean(item.purpose || item.surface || item.contextPurpose, 40),
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
      freshnessReason: clean(item.freshnessReason || item.retrievalReason || item.reason, 80),
      ageSeconds: Number.isFinite(Number(item.ageSeconds)) ? Number(item.ageSeconds) : null
    };
  }

  function compactPriority(priority = {}) {
    if (!priority || typeof priority !== 'object') return null;
    const active = Array.isArray(priority.active) ? priority.active.slice(0, 5).map(compactPriorityItem) : [];
    const background = Array.isArray(priority.background) ? priority.background.slice(0, 5).map(compactPriorityItem) : [];
    if (!active.length && !background.length && !priority.guidance) return null;
    return {
      activeCount: active.length,
      backgroundCount: background.length,
      topActive: active[0] || null,
      topBackground: background[0] || null,
      guidance: clean(priority.guidance, 180)
    };
  }

  function compactRoutingGuidance(guidance = null) {
    if (!guidance || typeof guidance !== 'object') return null;
    return {
      schema: clean(guidance.schema, 60),
      recoveryPolicy: clean(guidance.recoveryPolicy, 80),
      browserFollowUpPolicy: clean(guidance.browserFollowUpPolicy, 80),
      activeSurfaces: Array.isArray(guidance.activeSurfaces) ? guidance.activeSurfaces.slice(0, 6).map((item) => clean(item, 30)) : [],
      backgroundOnlySurfaces: Array.isArray(guidance.backgroundOnlySurfaces) ? guidance.backgroundOnlySurfaces.slice(0, 6).map((item) => clean(item, 30)) : [],
      missingSurfaces: Array.isArray(guidance.missingSurfaces) ? guidance.missingSurfaces.slice(0, 6).map((item) => clean(item, 30)) : [],
      clarificationTriggers: Array.isArray(guidance.clarificationTriggers) ? guidance.clarificationTriggers.slice(0, 6).map((item) => clean(item, 60)) : []
    };
  }

  function compactPacketHealth(health = {}) {
    if (!health || typeof health !== 'object') return null;
    const issues = Array.isArray(health.issues) ? health.issues.slice(0, 6).map((item) => clean(item, 80)) : [];
    const references = health.references && typeof health.references === 'object' ? {
      active: Number.isFinite(Number(health.references.active)) ? Number(health.references.active) : 0,
      background: Number.isFinite(Number(health.references.background)) ? Number(health.references.background) : 0,
      total: Number.isFinite(Number(health.references.total)) ? Number(health.references.total) : null
    } : null;
    const freshness = health.freshness && typeof health.freshness === 'object' ? {
      session: clean(health.freshness.session?.state || health.freshness.session, 30),
      browser: clean(health.freshness.browser?.state || health.freshness.browser, 30),
      inventory: clean(health.freshness.inventory?.state || health.freshness.inventory, 30),
      action: clean(health.freshness.action?.state || health.freshness.action, 30)
    } : null;
    return {
      schema: clean(health.schema, 60),
      level: clean(health.level, 30) || 'unknown',
      ready: health.ready === true,
      issues,
      references,
      freshness,
      routingGuidance: compactRoutingGuidance(health.routingGuidance)
    };
  }

  function compactLiveTarget(target = null) {
    if (!target || typeof target !== 'object') return null;
    return {
      label: clean(target.label || target.value || target.path, 80),
      kind: clean(target.kind, 30),
      surface: clean(target.surface, 30),
      source: clean(target.source, 40),
      fresh: target.fresh === true,
      ageMs: Number.isFinite(Number(target.ageMs)) ? Number(target.ageMs) : null,
      index: Number.isFinite(Number(target.index)) ? Number(target.index) : null,
      path: clean(target.path, 120) || null
    };
  }

  function compactLocalLiveContext(live = {}) {
    if (!live || typeof live !== 'object') return null;
    const browser = live.browser && typeof live.browser === 'object' ? {
      open: live.browser.open === true,
      title: clean(live.browser.title, 80),
      url: clean(live.browser.url, 120),
      candidateCount: Number.isFinite(Number(live.browser.candidateCount)) ? Number(live.browser.candidateCount) : 0,
      candidatesFresh: live.browser.candidatesFresh === true,
      candidatesAgeMs: Number.isFinite(Number(live.browser.candidatesAgeMs)) ? Number(live.browser.candidatesAgeMs) : null,
      snapshotAgeMs: Number.isFinite(Number(live.browser.snapshotAgeMs)) ? Number(live.browser.snapshotAgeMs) : null
    } : null;
    const candidates = live.candidates && typeof live.candidates === 'object'
      ? ['recent', 'file', 'folder', 'app', 'game', 'window', 'process'].reduce((out, kind) => {
        const item = live.candidates[kind];
        if (!item) return out;
        out[kind] = {
          count: Number.isFinite(Number(item.count)) ? Number(item.count) : 0,
          fresh: item.fresh === true,
          ageMs: Number.isFinite(Number(item.ageMs)) ? Number(item.ageMs) : null
        };
        return out;
      }, {})
      : null;
    const bestTarget = live.bestTarget || live.browser?.bestTarget || null;
    return {
      browser,
      bestTarget: compactLiveTarget(bestTarget),
      desktopBestTarget: compactLiveTarget(live.desktopBestTarget || live.bestDesktopTarget || null),
      candidates,
      referenceCandidateCount: Number.isFinite(Number(live.referenceCandidateCount)) ? Number(live.referenceCandidateCount) : 0,
      lastResolvedReference: live.lastResolvedReference ? {
        label: clean(live.lastResolvedReference.label || live.lastResolvedReference.value, 80),
        kind: clean(live.lastResolvedReference.kind, 30),
        surface: clean(live.lastResolvedReference.surface, 30),
        source: clean(live.lastResolvedReference.source, 40)
      } : null
    };
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
      priority: compactPriority(event.priority || event.priorityView || event.server?.priorityView || null),
      packetHealth: compactPacketHealth(event.packetHealth || event.serverPacketHealth || event.server?.packetHealth || null),
      localLiveContext: compactLocalLiveContext(event.localLiveContext || event.liveContext || event.local?.liveContext || null),
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
