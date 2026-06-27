'use strict';

const normalizeHexPromptContextUse = (value) => ({
  active: Array.isArray(value?.active) ? value.active : [],
  background: Array.isArray(value?.background) ? value.background : [],
  missing: Array.isArray(value?.missing) ? value.missing : []
});

window.buildHexSystemStateBlock = function buildHexSystemStateBlock(state, ctx) {
  const cloudSelectedCounts = state.cloudContext?.retrieval?.selectedCounts || {};
  const cloudState = state.cloudContext?.continuityState || {};
  const cloudFreshness = cloudState.freshness || {};
  const fmtAge = (value) => Number.isFinite(Number(value)) ? (Math.round(Number(value) / 60) + 'm') : 'n/a';
  const cloudActionStatusCounts = state.cloudContext?.retrieval?.actionStatusCounts || {};
  const cloudContextUse = normalizeHexPromptContextUse(state.cloudContext?.retrieval?.contextUse);
  const cloudContextUseLine = 'active ' + ((cloudContextUse.active || []).join('/') || 'none') + ' | background ' + ((cloudContextUse.background || []).join('/') || 'none') + ' | missing ' + ((cloudContextUse.missing || []).join('/') || 'none');
  const cloudRoutingGuidance = state.cloudContext?.retrieval?.routingGuidance || state.brainRoute?.serverPacketHealth?.routingGuidance || null;
  const cloudRoutingLine = cloudRoutingGuidance ? ('policy ' + (cloudRoutingGuidance.recoveryPolicy || 'unknown') + ' | browser ' + (cloudRoutingGuidance.browserFollowUpPolicy || 'unknown') + ' | clarify ' + ((cloudRoutingGuidance.clarificationTriggers || []).join('/') || 'none')) : 'none';
  const cloudPriorityView = state.cloudContext?.desktopPriorityView || window.hexCloudContextRehydrator?.getPriorityView?.(state.cloudContext) || null;
  const formatPriorityRefs = (items) => (items || [])
    .slice(0, 5)
    .map((item) => `${item.index || '?'}:${item.label || item.value || item} [${item.purpose || item.kind || 'ref'} ${item.contextFresh ? 'fresh' : 'background'}]`)
    .filter(Boolean);
  const cloudRetrievalReasons = [
    ...((state.cloudContext?.retrieval?.reasons?.memories || []).slice(0, 3).map((item) => 'memory ' + (item.kind || 'item') + ': ' + item.reason)),
    ...((state.cloudContext?.retrieval?.reasons?.turns || []).slice(0, 2).map((item) => 'turn ' + (item.role || 'user') + ': ' + item.reason))
  ].filter(Boolean).slice(0, 5);
  return [
    '=== LIVE SYSTEM SNAPSHOT ===',
    '  Time     : ' + ctx.now.toLocaleTimeString() + '  |  Date    : ' + ctx.now.toLocaleDateString(),
    '  Uptime   : ' + (state.uptime || '--'),
    '  CPU      : ' + (state.cpu || '--') + '%  |  RAM    : ' + (state.ram || '--') + '%  |  Disk   : ' + (state.disk || '--') + '% (' + (state.diskFree || '--') + ' free)',
    '  Network  : down:' + (state.netRx || '--') + ' up:' + (state.netTx || '--') + '  |  Temp   : ' + (state.temp || '--'),
    '  Platform : ' + (state.platform || '--') + '  |  AI     : ' + (state.aiProvider || '--') + '  |  TTS : ' + (state.ttsEngine || '--'),
    '  Task     : ' + (state.activeTask || 'none'),
    '  Browser  : ' + (state.browserSession?.open ? 'OPEN' : 'CLOSED'),
    '  Page     : ' + (state.browserSession?.open
      ? ((state.browserSession.title || 'Untitled') + ' | ' + (state.browserSession.url || '--'))
      : '--'),
    '  Candidates: ' + (((state.sessionContext?.browserCandidates || []).slice(0, 8)).map((item) => `${item.index}. ${item.label || item.text}`).join(' | ') || 'none'),
    '  Recent   : ' + (state.desktopContext?.recentSummary || 'none'),
    '  Promoted : ' + ((state.desktopContext?.promotedRecent || []).join(' | ') || 'none'),
    '  Locations: ' + ((state.desktopContext?.knownLocations || []).join(' | ') || 'none'),
    '  Windows  : ' + ((state.desktopContext?.windowCandidates || []).join(' | ') || 'none'),
    '  Processes: ' + ((state.desktopContext?.processCandidates || []).join(' | ') || 'none'),
    '  Apps     : ' + ((state.desktopContext?.appCandidates || []).join(' | ') || 'none'),
    '  Files    : ' + ((state.desktopContext?.fileCandidates || []).join(' | ') || 'none'),
    '  Folders  : ' + ((state.desktopContext?.folderCandidates || []).join(' | ') || 'none'),
    '  Inventory: ' + (state.desktopContext?.inventorySummary || 'none'),
    '  Highlights: ' + ((state.desktopContext?.inventoryHighlights || []).join(' | ') || 'none'),
    '  Matches   : ' + ((state.desktopContext?.entityMatches || []).join(' | ') || 'none'),
    '  Cached age: ' + (state.desktopContext?.inventoryAgeMinutes != null ? (state.desktopContext.inventoryAgeMinutes + ' min') : 'n/a'),
    '  Brain route: ' + (state.brainRoute?.route || 'provider') + ' | Server packet: ' + (state.brainRoute?.serverPacket ? 'YES' : 'NO') + ' | Server memory hits: ' + (state.brainRoute?.serverMemoryHits || 0),
    '  Provider layer: ' + (state.brainRoute?.providerLayer || 'external') + ' — API keys are unstable; prefer server/local memory when present.',
    '  Brain confidence   : ' + (state.brainRoute?.confidence || 'n/a') + ' | Provider required: ' + (state.brainRoute?.providerRequired === false ? 'NO' : 'YES'),
    '  Brain next         : ' + (state.brainRoute?.recommendedNext || 'unknown'),
    '  Brain sources      : ' + ((state.brainRoute?.sources || []).join(', ') || 'none'),
    '  Brain action plan : ' + (state.brainRoute?.actionPlan?.domain || 'dialogue') + ' | surface: ' + (state.brainRoute?.actionPlan?.suggestedSurface || 'chat') + ' | urgency: ' + (state.brainRoute?.actionPlan?.urgency || 'normal'),
    '  Brain action why  : ' + ((state.brainRoute?.actionPlan?.reasons || []).join(', ') || 'none'),
    '  Cloud goal: ' + (state.cloudContext?.activeGoal?.text || state.cloudContext?.summary?.goal || 'none'),
    '  Cloud topic: ' + (state.cloudContext?.topics?.active?.label || 'none'),
    '  Cloud continuity: surface ' + (cloudState.activeSurface || 'chat') + ' | browser ' + (cloudState.browser?.open ? 'OPEN' : 'CLOSED') + ' | inventory ' + (cloudState.hasDesktopInventory ? 'YES' : 'NO') + ' | session age ' + fmtAge(cloudFreshness.sessionSeconds) + ' | inventory age ' + fmtAge(cloudFreshness.inventorySeconds) + ' | last action ' + (cloudState.lastActionStatus || 'none'),
    '  Paused topics: ' + ((state.cloudContext?.topics?.paused || []).map((item) => item.label).join(' | ') || 'none'),
    '  Cloud mems: ' + ((state.cloudContext?.summary?.memoryHighlights || []).join(' | ') || 'none'),
    '  Cloud retrieval: memories ' + (cloudSelectedCounts.memories || 0) + ', turns ' + (cloudSelectedCounts.turns || 0) + ', desktop refs ' + (cloudSelectedCounts.desktopReferences || 0) + ', browser refs ' + (cloudSelectedCounts.browserReferences || 0) + ', actions ' + (cloudSelectedCounts.actionTimeline || 0),
    '  Cloud action outcomes: success ' + (cloudActionStatusCounts.success || 0) + ', failure ' + (cloudActionStatusCounts.failure || 0) + ', pending ' + (cloudActionStatusCounts.pending || 0),
    '  Cloud why: ' + (cloudRetrievalReasons.join(' | ') || 'none'),
    '  Cloud context use: ' + cloudContextUseLine,
    '  Cloud routing guidance: ' + cloudRoutingLine,
    '  Cloud priority active: ' + (formatPriorityRefs(cloudPriorityView?.active).join(' | ') || 'none'),
    '  Cloud priority background: ' + (formatPriorityRefs(cloudPriorityView?.background).join(' | ') || 'none'),
    '  Cloud refs: ' + ((state.cloudContext?.references?.desktop || []).map((item) => item?.label || item?.value || item).join(' | ') || 'none'),
    '  Pending tasks: ' + ((state.cloudContext?.unresolvedTasks || []).map((item) => item.text).join(' | ') || 'none'),
    '  Action timeline: ' + ((state.cloudContext?.actionTimeline || []).map((item) => item.kind + ': ' + item.text).join(' | ') || 'none'),
    '  Resolved : ' + (state.sessionContext?.resolvedReference ? ('#' + state.sessionContext.resolvedReference.index + ' ' + (state.sessionContext.resolvedReference.label || state.sessionContext.resolvedReference.text || '') + (state.sessionContext.resolvedReference.url ? ' | ' + state.sessionContext.resolvedReference.url : '')) : 'none'),
    '  Goal     : ' + (state.sessionContext?.primaryGoal || 'none'),
    '  FollowUp : ' + (state.sessionContext?.lastUserWasFollowUp ? 'YES — resolve against active session' : 'NO / unclear'),
    '  Surface  : ' + (state.sessionContext?.activeSurface || 'chat'),
    '',
    '  WARNING: This snapshot is SHALLOW. For real hardware/software truth, always trigger actions.',
  ].join('\n');
};

window.buildHexContinuityBlock = function buildHexContinuityBlock(state, userMsg) {
  const formatRecoveredAction = (item) => {
    if (!item || typeof item !== 'object') return 'none';
    const status = item.success === false ? 'failed' : 'succeeded';
    const type = String(item.type || 'action');
    const summary = String(item.summary || item.reason || '').replace(/\s+/g, ' ').trim();
    return (type + ' ' + status + (summary ? ': ' + summary : '')).substring(0, 220);
  };
  const cloudSelectedCounts = state.cloudContext?.retrieval?.selectedCounts || {};
  const cloudState = state.cloudContext?.continuityState || {};
  const cloudFreshness = cloudState.freshness || {};
  const fmtAge = (value) => Number.isFinite(Number(value)) ? (Math.round(Number(value) / 60) + 'm') : 'n/a';
  const cloudActionStatusCounts = state.cloudContext?.retrieval?.actionStatusCounts || {};
  const cloudContextUse = normalizeHexPromptContextUse(state.cloudContext?.retrieval?.contextUse);
  const cloudContextUseLine = 'active ' + ((cloudContextUse.active || []).join('/') || 'none') + ' | background ' + ((cloudContextUse.background || []).join('/') || 'none') + ' | missing ' + ((cloudContextUse.missing || []).join('/') || 'none');
  const cloudRoutingGuidance = state.cloudContext?.retrieval?.routingGuidance || state.brainRoute?.serverPacketHealth?.routingGuidance || null;
  const cloudRoutingLine = cloudRoutingGuidance ? ('policy ' + (cloudRoutingGuidance.recoveryPolicy || 'unknown') + ' | browser ' + (cloudRoutingGuidance.browserFollowUpPolicy || 'unknown') + ' | clarify ' + ((cloudRoutingGuidance.clarificationTriggers || []).join('/') || 'none')) : 'none';
  const cloudPriorityView = state.cloudContext?.desktopPriorityView || window.hexCloudContextRehydrator?.getPriorityView?.(state.cloudContext) || null;
  const formatPriorityRefs = (items) => (items || [])
    .slice(0, 5)
    .map((item) => `${item.index || '?'}:${item.label || item.value || item} [${item.purpose || item.kind || 'ref'} ${item.contextFresh ? 'fresh' : 'background'}]`)
    .filter(Boolean);
  const cloudRetrievalReasons = [
    ...((state.cloudContext?.retrieval?.reasons?.memories || []).slice(0, 3).map((item) => 'memory ' + (item.kind || 'item') + ': ' + item.reason)),
    ...((state.cloudContext?.retrieval?.reasons?.turns || []).slice(0, 2).map((item) => 'turn ' + (item.role || 'user') + ': ' + item.reason))
  ].filter(Boolean).slice(0, 5);
  return [
    '=== ACTIVE SESSION CONTINUITY ===',
    '  Latest user message : ' + (state.sessionContext?.lastUserMessage || userMsg || '--'),
    '  Last assistant reply: ' + ((state.sessionContext?.lastAssistantMessage || '--').substring(0, 180)),
    '  Last action plan    : ' + (state.sessionContext?.lastActionSummary || 'none'),
    '  Last recovered action: ' + formatRecoveredAction(state.sessionContext?.lastRecoveredAction),
    '  Last system data    : ' + ((state.sessionContext?.lastSystemDataSummary || 'none').substring(0, 220)),
    '  Working task        : ' + (state.workingMemory?.currentTask || 'none'),
    '  Working entities    : ' + ((state.workingMemory?.currentEntities || []).join(', ') || 'none'),
    '  Active topics       : ' + ((state.sessionContext?.activeTopics || []).join(', ') || 'none'),
    '  Recent entities     : ' + ((state.sessionContext?.recentEntities || []).join(', ') || 'none'),
    '  Reference targets   : ' + ((state.sessionContext?.referenceCandidates || []).join(' | ') || 'none'),
    '  Desktop games       : ' + ((state.desktopContext?.gameCandidates || []).join(' | ') || 'none'),
    '  Recent desktop      : ' + (state.desktopContext?.recentSummary || 'none'),
    '  Promoted desktop     : ' + ((state.desktopContext?.promotedRecent || []).join(' | ') || 'none'),
    '  Known locations      : ' + ((state.desktopContext?.knownLocations || []).join(' | ') || 'none'),
    '  Desktop folders      : ' + ((state.desktopContext?.folderCandidates || []).join(' | ') || 'none'),
    '  Inventory summary    : ' + (state.desktopContext?.inventorySummary || 'none'),
    '  Inventory highlights : ' + ((state.desktopContext?.inventoryHighlights || []).join(' | ') || 'none'),
    '  Query entity hits    : ' + ((state.desktopContext?.entityMatches || []).join(' | ') || 'none'),
    '  Resolved target     : ' + (state.sessionContext?.resolvedReference ? ('#' + state.sessionContext.resolvedReference.index + ' ' + (state.sessionContext.resolvedReference.label || state.sessionContext.resolvedReference.text || '') + (state.sessionContext.resolvedReference.url ? ' | ' + state.sessionContext.resolvedReference.url : '')) : 'none'),
    '  Session mood        : ' + (state.workingMemory?.mood || 'neutral'),
    '  Cloud memory hits    : ' + ((state.cloudContext?.relevantMemories || []).map((item) => item.content).join(' | ') || 'none'),
    '  Cloud continuity    : surface ' + (cloudState.activeSurface || 'chat') + ' | browser ' + (cloudState.browser?.open ? 'OPEN' : 'CLOSED') + ' | inventory ' + (cloudState.hasDesktopInventory ? 'YES' : 'NO') + ' | session age ' + fmtAge(cloudFreshness.sessionSeconds) + ' | inventory age ' + fmtAge(cloudFreshness.inventorySeconds) + ' | last action ' + (cloudState.lastActionStatus || 'none'),
    '  Cloud retrieval      : memories ' + (cloudSelectedCounts.memories || 0) + ', turns ' + (cloudSelectedCounts.turns || 0) + ', desktop refs ' + (cloudSelectedCounts.desktopReferences || 0) + ', browser refs ' + (cloudSelectedCounts.browserReferences || 0) + ', actions ' + (cloudSelectedCounts.actionTimeline || 0),
    '  Cloud action outcomes : success ' + (cloudActionStatusCounts.success || 0) + ', failure ' + (cloudActionStatusCounts.failure || 0) + ', pending ' + (cloudActionStatusCounts.pending || 0),
    '  Cloud retrieval why  : ' + (cloudRetrievalReasons.join(' | ') || 'none'),
    '  Cloud context use    : ' + cloudContextUseLine,
    '  Cloud routing guidance: ' + cloudRoutingLine,
    '  Cloud priority active : ' + (formatPriorityRefs(cloudPriorityView?.active).join(' | ') || 'none'),
    '  Cloud priority background: ' + (formatPriorityRefs(cloudPriorityView?.background).join(' | ') || 'none'),
    '  Cloud turn hits      : ' + ((state.cloudContext?.relevantTurns || []).map((item) => (String(item.role || 'user').toUpperCase() + ': ' + String(item.content || '').substring(0, 100))).join(' | ') || 'none'),
    '  Cloud desktop refs   : ' + ((state.cloudContext?.references?.desktop || []).map((item) => item?.label || item?.value || item).join(' | ') || 'none'),
    '  HEX commitments     : ' + ((state.cloudContext?.dialogue?.commitments || []).map((item) => item.text).join(' | ') || 'none'),
    '  User corrections    : ' + ((state.cloudContext?.dialogue?.corrections || []).map((item) => item.text).join(' | ') || 'none'),
    '  Pending follow-up    : ' + (state.cloudContext?.dialogue?.pendingFollowUp || 'none'),
    '  Cloud browser refs   : ' + ((state.cloudContext?.references?.browser || []).map((item) => item?.label || item?.value || item).join(' | ') || 'none'),
    '',
    '  Continuity rule: treat short or referential messages as follow-ups to the active goal unless the user clearly switches topics.',
    '  Topic rule: conversational topics are separate from executable tasks; resume a paused topic from its prior context.',
    '  Browser rule: if Browser is OPEN, commands about page items/results/videos/buttons must operate inside that session first.',
    '  Desktop rule: if recent desktop targets/windows/processes/apps/files/games are present, desktop follow-ups should resolve inside that active desktop context first.',
    '  Reference rule: pronouns, ordinals, and "same/that/it/continue" should resolve against the active session before starting a new flow.',
  ].join('\n');
};

window.buildHexPluginActionsBlock = function buildHexPluginActionsBlock() {
  if (!window._hexPluginTags || window._hexPluginTags.length === 0) return '';
  return [
    '',
    '=== INSTALLED PLUGINS ===',
    'These plugins extend your capabilities. Use them when relevant.',
    'Format: [ACTION:plugin:PLUGIN_ID:ACTION_NAME:ARG1:ARG2...]',
    '',
    ...window._hexPluginTags,
    '',
    'Examples:',
    '  "what is bitcoin price"    -> "Checking. [ACTION:plugin:hex-crypto-tracker:get_crypto_price:bitcoin]"',
    '  "scan my games folder"     -> "[ACTION:plugin:hex-games-launcher:scan_games]"',
    '  "launch MyGame"            -> "[ACTION:plugin:hex-games-launcher:launch_game:MyGame]"',
    '  "post to discord: hello"   -> "[ACTION:plugin:hex-discord-webhook:send_webhook_message:hello]"',
  ].join('\n');
};
