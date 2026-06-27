export const CONTEXT_PACKET_SCHEMA = 'hex.context-packet.v2';

const LIMITS = Object.freeze({
  memories: { items: 6, chars: 1200 },
  turns: { items: 8, chars: 1600 },
  references: { items: 10, chars: 1200 },
  tasks: { items: 6, chars: 720 },
  actions: { items: 8, chars: 1200 },
  commitments: { items: 4, chars: 480 },
  corrections: { items: 4, chars: 480 },
  desktopItemsPerCategory: 8,
  text: 240
});

export function assembleContextPacketV2({
  continuity,
  retrieval,
  relevantMemories,
  relevantTurns,
  references,
  unresolvedTasks,
  actionTimeline,
  summary,
  query
}) {
  const turns = boundedTurns(relevantTurns);
  const dialogue = deriveDialogueSignals(continuity?.recentTurns || turns, continuity?.activityEvents || []);
  const tasks = boundedObjects(unresolvedTasks, LIMITS.tasks, (item) => ({
    kind: text(item?.kind, 40),
    text: text(item?.text, LIMITS.text)
  }));
  const projectedMemories = boundedObjects(relevantMemories, LIMITS.memories, (item) => ({
    id: item?.id || null,
    kind: text(item?.kind, 60),
    content: text(item?.content, LIMITS.text),
    confidence: finite(item?.confidence),
    retrievalReason: text(item?.retrievalReason, 160) || null
  }));
  const projectedTurns = turns.map((turn) => ({
    ...turn,
    retrievalReason: text(turn?.retrievalReason, 160) || null
  }));
  const actions = boundedObjects(actionTimeline, LIMITS.actions, (item) => ({
    kind: text(item?.kind, 40),
    status: text(item?.status, 20) || null,
    actionType: text(item?.actionType, 80) || null,
    text: text(item?.text, LIMITS.text),
    surface: text(item?.surface, 40) || 'chat',
    at: item?.at || null
  }));
  const generatedAt = new Date().toISOString();
  const continuityState = buildContinuityState(continuity, actions, projectedTurns, generatedAt);

  return {
    schema: CONTEXT_PACKET_SCHEMA,
    generatedAt,
    query: text(query, 500),
    profile: projectProfile(continuity?.profile),
    session: projectSession(continuity?.session),
    continuityState,
    activeGoal: buildActiveGoal(continuity, tasks),
    topics: projectTopics(continuity?.topicLedger),
    browser: projectBrowser(continuity?.browser),
    workingMemory: projectWorkingMemory(continuity?.workingMemory),
    desktopContext: projectDesktopContext(continuity?.desktopContext),
    retrieval: enrichRetrievalSummary(retrieval, {
      relevantMemories: projectedMemories,
      relevantTurns: projectedTurns,
      references,
      unresolvedTasks: tasks,
      actionTimeline: actions,
      continuityState
    }),
    relevantMemories: projectedMemories,
    relevantTurns: projectedTurns,
    references: projectReferences(references),
    unresolvedTasks: tasks,
    actionTimeline: actions,
    dialogue,
    summary: {
      ...(summary || {}),
      commitmentCount: dialogue.commitments.length,
      correctionCount: dialogue.corrections.length,
      pendingFollowUp: dialogue.pendingFollowUp
    },
    budgets: {
      limits: LIMITS,
      used: {
        memories: countChars(projectedMemories),
        turns: countChars(projectedTurns),
        references: countChars(references),
        tasks: countChars(tasks),
        actions: countChars(actions)
      }
    }
  };
}

function buildContinuityState(continuity = {}, actions = [], turns = [], generatedAt = null) {
  const session = continuity?.session || {};
  const browser = continuity?.browser || {};
  const desktop = continuity?.desktopContext || {};
  const lastTurn = [...(Array.isArray(turns) ? turns : [])].reverse().find((turn) => turn?.created_at) || null;
  const lastAction = [...(Array.isArray(actions) ? actions : [])].reverse().find((action) => action?.at || action?.text) || null;
  const generatedTime = Date.parse(generatedAt || new Date().toISOString());
  const ageSeconds = (value) => {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time) || !Number.isFinite(generatedTime)) return null;
    return Math.max(0, Math.round((generatedTime - time) / 1000));
  };

  const state = {
    schema: 'hex.continuity-state.v1',
    activeSurface: text(session.activeSurface, 40) || 'chat',
    sessionUpdatedAt: session.updatedAt || session.updated_at || null,
    inventoryUpdatedAt: desktop.inventoryUpdatedAt || null,
    lastTurnAt: lastTurn?.created_at || null,
    lastActionAt: lastAction?.at || null,
    lastActionStatus: text(lastAction?.status, 20) || null,
    browser: {
      open: browser?.open === true,
      title: text(browser?.title, LIMITS.text) || null,
      url: text(browser?.url, 500) || null
    },
    hasDesktopInventory: !!(
      desktop.inventorySummary ||
      (Array.isArray(desktop.inventoryHighlights) && desktop.inventoryHighlights.length) ||
      (Array.isArray(desktop.promotedRecent) && desktop.promotedRecent.length)
    ),
    freshness: {
      sessionSeconds: ageSeconds(session.updatedAt || session.updated_at),
      inventorySeconds: ageSeconds(desktop.inventoryUpdatedAt),
      lastTurnSeconds: ageSeconds(lastTurn?.created_at),
      lastActionSeconds: ageSeconds(lastAction?.at)
    }
  };
  state.freshnessTiers = buildFreshnessTiers(state);
  return state;
}

function buildFreshnessTiers(state = {}) {
  const seconds = state.freshness || {};
  const tier = (value, max, available = true) => {
    if (!available) return 'missing';
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unknown';
    return n <= max ? 'fresh' : 'stale';
  };
  return {
    session: tier(seconds.sessionSeconds ?? seconds.lastTurnSeconds, 45 * 60),
    browser: tier(seconds.lastTurnSeconds ?? seconds.sessionSeconds, 15 * 60, state.browser?.open === true),
    inventory: tier(seconds.inventorySeconds ?? seconds.sessionSeconds, 6 * 60 * 60, state.hasDesktopInventory === true),
    action: tier(seconds.lastActionSeconds ?? seconds.lastTurnSeconds ?? seconds.sessionSeconds, 20 * 60)
  };
}

function buildContextUse(continuityState = {}) {
  const tiers = continuityState.freshnessTiers || {};
  const active = [];
  const background = [];
  const missing = [];
  for (const key of ['session', 'browser', 'inventory', 'action']) {
    const value = tiers[key] || 'unknown';
    if (value === 'fresh' || value === 'unknown') active.push(key);
    else if (value === 'stale') background.push(key);
    else missing.push(key);
  }
  return {
    schema: 'hex.context-use.v1',
    active,
    background,
    missing,
    guidance: background.length
      ? 'Use stale areas only as background memory; prefer live/local state for those surfaces.'
      : 'Server continuity is suitable for active routing.'
  };
}

function buildRoutingGuidance(continuityState = {}) {
  const contextUse = buildContextUse(continuityState);
  const browserOpen = continuityState?.browser?.open === true;
  const clarificationTriggers = [];
  if (!browserOpen || contextUse.missing.includes('browser')) clarificationTriggers.push('no-active-browser-session');
  if (contextUse.background.includes('browser')) clarificationTriggers.push('stale-browser-reference');
  if (contextUse.background.includes('action')) clarificationTriggers.push('stale-action-context');
  if (contextUse.missing.includes('inventory')) clarificationTriggers.push('missing-inventory-context');
  return {
    schema: 'hex.routing-guidance.v1',
    activeSurfaces: contextUse.active,
    backgroundOnlySurfaces: contextUse.background,
    missingSurfaces: contextUse.missing,
    clarificationTriggers,
    recoveryPolicy: contextUse.background.length || contextUse.missing.length
      ? 'prefer-live-local-context-before-provider-or-clarification'
      : 'server-context-can-drive-routing',
    browserFollowUpPolicy: browserOpen && !contextUse.background.includes('browser') && !contextUse.missing.includes('browser')
      ? 'server-browser-context-active'
      : 'require-fresh-live-browser-target-before-clicking'
  };
}
function enrichRetrievalSummary(retrieval = {}, projected = {}) {
  const references = projected.references || {};
  const desktopByCategory = references.desktopByCategory || {};
  const categoryCounts = Object.fromEntries(Object.entries(desktopByCategory).map(([key, values]) => [key, Array.isArray(values) ? values.length : 0]));
  const memoryReasons = (projected.relevantMemories || [])
    .filter((item) => item.retrievalReason)
    .slice(0, 6)
    .map((item) => ({ id: item.id, kind: item.kind, reason: item.retrievalReason }));
  const turnReasons = (projected.relevantTurns || [])
    .filter((item) => item.retrievalReason)
    .slice(0, 6)
    .map((item) => ({ id: item.id, role: item.role, reason: item.retrievalReason }));
  const actionStatusCounts = (projected.actionTimeline || []).reduce((acc, item) => {
    const status = item.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const actionReasons = (projected.actionTimeline || [])
    .slice(0, 6)
    .map((item) => ({
      kind: item.kind,
      status: item.status || 'unknown',
      actionType: item.actionType || null,
      reason: [item.status || 'unknown', item.actionType || item.kind, item.surface || 'chat'].filter(Boolean).join(' | ')
    }));

  return {
    ...(retrieval || {}),
    schema: 'hex.retrieval-summary.v1',
    categoryCounts,
    actionStatusCounts,
    contextUse: buildContextUse(projected.continuityState || {}),
    routingGuidance: buildRoutingGuidance(projected.continuityState || {}),
    selectedCounts: {
      memories: (projected.relevantMemories || []).length,
      turns: (projected.relevantTurns || []).length,
      priorityReferences: Array.isArray(references.priority) ? references.priority.length : 0,
      desktopReferences: Array.isArray(references.desktop) ? references.desktop.length : 0,
      browserReferences: Array.isArray(references.browser) ? references.browser.length : 0,
      unresolvedTasks: (projected.unresolvedTasks || []).length,
      actionTimeline: (projected.actionTimeline || []).length
    },
    reasons: {
      memories: memoryReasons,
      turns: turnReasons,
      actions: actionReasons
    }
  };
}
function buildActiveGoal(continuity, tasks) {
  const session = continuity?.session || {};
  const value = tasks[0]?.text || session.primaryGoal || continuity?.workingMemory?.currentTask || null;
  return value ? {
    text: text(value, LIMITS.text),
    source: tasks[0]?.text ? 'pending-task' : (session.primaryGoal ? 'session' : 'working-memory'),
    surface: text(session.activeSurface, 40) || 'chat'
  } : null;
}

function projectTopics(value = {}) {
  const mapTopic = (item) => ({
    label: text(item?.label, LIMITS.text),
    status: item?.status === 'paused' ? 'paused' : 'active',
    at: item?.at || null
  });
  return {
    active: value?.active ? mapTopic(value.active) : null,
    paused: (value?.paused || []).slice(0, 4).map(mapTopic),
    recent: (value?.recent || []).slice(0, 6).map(mapTopic)
  };
}

function deriveDialogueSignals(turns, events = []) {
  const commitments = [];
  const corrections = [];
  let pendingFollowUp = null;
  for (const event of Array.isArray(events) ? events : []) {
    const item = { text: text(event?.summary, LIMITS.text), at: event?.createdAt || null };
    if (!item.text) continue;
    if (event?.kind === 'commitment' && event?.status === 'pending') commitments.push(item);
    if (event?.kind === 'correction') corrections.push(item);
  }
  for (const turn of (Array.isArray(turns) ? turns : []).slice(-12)) {
    const role = String(turn?.role || '').toLowerCase();
    const content = text(turn?.content, LIMITS.text);
    if (!content) continue;
    if (role === 'assistant' && /\b(i will|i'll|let me|next i|we will|i can)\b/i.test(content)) {
      commitments.push({ text: content, at: turn?.created_at || null });
    }
    if (role === 'user' && /\b(no,?|actually|i mean|not that|instead|correction|don't|do not)\b/i.test(content)) {
      corrections.push({ text: content, at: turn?.created_at || null });
    }
    if (role === 'assistant' && /\?\s*$/.test(content)) pendingFollowUp = content;
    if (role === 'user' && pendingFollowUp) pendingFollowUp = null;
  }
  return {
    commitments: boundedObjects(commitments, LIMITS.commitments, (item) => item),
    corrections: boundedObjects(corrections, LIMITS.corrections, (item) => item),
    pendingFollowUp
  };
}

function boundedTurns(items) {
  return boundedObjects(items, LIMITS.turns, (item) => ({
    id: item?.id || null,
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: text(item?.content, LIMITS.text),
    surface: text(item?.surface, 40) || 'chat',
    created_at: item?.created_at || null,
    retrievalReason: text(item?.retrievalReason, 160) || null
  }));
}

function projectReferences(refs = {}) {
  return {
    query: text(refs.query, 500),
    requestedSurface: text(refs.requestedSurface, 40) || null,
    desktopFocusOrder: (refs.desktopFocusOrder || []).slice(0, 9).map((item) => text(item, 40)),
    priority: boundedPriorityReferenceList(refs.priority),
    desktop: boundedReferenceList(refs.desktop),
    browser: boundedReferenceList(refs.browser),
    desktopByCategory: Object.fromEntries(Object.entries(refs.desktopByCategory || {}).slice(0, 9).map(([key, value]) => [
      key,
      boundedReferenceList(value, LIMITS.desktopItemsPerCategory)
    ]))
  };
}

function boundedReferenceList(items, limit = LIMITS.references.items) {
  return boundedObjects(items, { items: limit, chars: LIMITS.references.chars }, (item) => ({
    index: finite(item?.index),
    kind: text(item?.kind, 40),
    label: text(item?.label || item, LIMITS.text),
    path: text(item?.path, LIMITS.text) || null,
    value: text(item?.value, LIMITS.text) || null
  }));
}

function boundedPriorityReferenceList(items, limit = LIMITS.references.items) {
  return boundedObjects(items, { items: limit, chars: LIMITS.references.chars }, (item) => ({
    index: finite(item?.index),
    kind: text(item?.kind, 40),
    label: text(item?.label || item, LIMITS.text),
    path: text(item?.path, LIMITS.text) || null,
    value: text(item?.value, LIMITS.text) || null,
    confidence: finite(item?.confidence),
    retrievalReason: text(item?.retrievalReason, 160) || null
  }));
}

function projectDesktopContext(value = {}) {
  const fields = ['promotedRecent', 'knownLocations', 'appCandidates', 'fileCandidates', 'folderCandidates', 'gameCandidates', 'windowCandidates', 'processCandidates', 'inventoryHighlights', 'entityMatches'];
  const result = {
    inventorySummary: text(value?.inventorySummary, 600),
    inventoryUpdatedAt: value?.inventoryUpdatedAt || null
  };
  for (const field of fields) {
    result[field] = (Array.isArray(value?.[field]) ? value[field] : [])
      .slice(0, LIMITS.desktopItemsPerCategory)
      .map((item) => text(item?.label || item?.value || item?.path || item, LIMITS.text))
      .filter(Boolean);
  }
  return result;
}

function projectProfile(value = {}) {
  return {
    id: value?.id || null,
    displayName: text(value?.display_name || value?.displayName, 100),
    language: text(value?.language, 12),
    assistantMode: text(value?.assistant_mode || value?.assistantMode, 30)
  };
}

function projectSession(value = {}) {
  return {
    id: value?.id || null,
    deviceId: value?.device_id || value?.deviceId || null,
    activeSurface: text(value?.activeSurface, 40) || 'chat',
    primaryGoal: text(value?.primaryGoal, LIMITS.text) || null,
    lastActionSummary: text(value?.lastActionSummary, LIMITS.text) || null,
    updatedAt: value?.updatedAt || value?.updated_at || null
  };
}

function projectBrowser(value = {}) {
  return {
    open: value?.open === true,
    url: text(value?.url, 500) || null,
    title: text(value?.title, LIMITS.text) || null
  };
}

function projectWorkingMemory(value = {}) {
  return {
    currentTask: text(value?.currentTask, LIMITS.text) || null,
    currentEntities: (value?.currentEntities || []).slice(0, 8).map((item) => text(item, 120)).filter(Boolean),
    mood: text(value?.mood, 40) || 'neutral'
  };
}

function boundedObjects(items, limits, mapper) {
  const result = [];
  let chars = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    if (result.length >= limits.items) break;
    const item = mapper(raw);
    const size = countChars(item);
    if (chars + size > limits.chars && result.length > 0) break;
    chars += size;
    result.push(item);
  }
  return result;
}

function countChars(value) {
  try { return JSON.stringify(value || '').length; } catch (_) { return 0; }
}

function text(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
