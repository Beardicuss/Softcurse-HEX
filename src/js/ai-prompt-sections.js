'use strict';

window.buildHexSystemStateBlock = function buildHexSystemStateBlock(state, ctx) {
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
    '  Windows  : ' + ((state.desktopContext?.windowCandidates || []).join(' | ') || 'none'),
    '  Processes: ' + ((state.desktopContext?.processCandidates || []).join(' | ') || 'none'),
    '  Apps     : ' + ((state.desktopContext?.appCandidates || []).join(' | ') || 'none'),
    '  Files    : ' + ((state.desktopContext?.fileCandidates || []).join(' | ') || 'none'),
    '  Resolved : ' + (state.sessionContext?.resolvedReference ? ('#' + state.sessionContext.resolvedReference.index + ' ' + (state.sessionContext.resolvedReference.label || state.sessionContext.resolvedReference.text || '') + (state.sessionContext.resolvedReference.url ? ' | ' + state.sessionContext.resolvedReference.url : '')) : 'none'),
    '  Goal     : ' + (state.sessionContext?.primaryGoal || 'none'),
    '  FollowUp : ' + (state.sessionContext?.lastUserWasFollowUp ? 'YES — resolve against active session' : 'NO / unclear'),
    '  Surface  : ' + (state.sessionContext?.activeSurface || 'chat'),
    '',
    '  WARNING: This snapshot is SHALLOW. For real hardware/software truth, always trigger actions.',
  ].join('\n');
};

window.buildHexContinuityBlock = function buildHexContinuityBlock(state, userMsg) {
  return [
    '=== ACTIVE SESSION CONTINUITY ===',
    '  Latest user message : ' + (state.sessionContext?.lastUserMessage || userMsg || '--'),
    '  Last assistant reply: ' + ((state.sessionContext?.lastAssistantMessage || '--').substring(0, 180)),
    '  Last action plan    : ' + (state.sessionContext?.lastActionSummary || 'none'),
    '  Last system data    : ' + ((state.sessionContext?.lastSystemDataSummary || 'none').substring(0, 220)),
    '  Working task        : ' + (state.workingMemory?.currentTask || 'none'),
    '  Working entities    : ' + ((state.workingMemory?.currentEntities || []).join(', ') || 'none'),
    '  Active topics       : ' + ((state.sessionContext?.activeTopics || []).join(', ') || 'none'),
    '  Recent entities     : ' + ((state.sessionContext?.recentEntities || []).join(', ') || 'none'),
    '  Reference targets   : ' + ((state.sessionContext?.referenceCandidates || []).join(' | ') || 'none'),
    '  Desktop games       : ' + ((state.desktopContext?.gameCandidates || []).join(' | ') || 'none'),
    '  Recent desktop      : ' + (state.desktopContext?.recentSummary || 'none'),
    '  Promoted desktop     : ' + ((state.desktopContext?.promotedRecent || []).join(' | ') || 'none'),
    '  Resolved target     : ' + (state.sessionContext?.resolvedReference ? ('#' + state.sessionContext.resolvedReference.index + ' ' + (state.sessionContext.resolvedReference.label || state.sessionContext.resolvedReference.text || '') + (state.sessionContext.resolvedReference.url ? ' | ' + state.sessionContext.resolvedReference.url : '')) : 'none'),
    '  Session mood        : ' + (state.workingMemory?.mood || 'neutral'),
    '',
    '  Continuity rule: treat short or referential messages as follow-ups to the active goal unless the user clearly switches topics.',
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
