'use strict';

window.buildHexCompactSystemPrompt = function buildHexCompactSystemPrompt(state, lang, userMsg) {
  const ctx = window.buildHexPromptContext(state, lang, userMsg);
  const browser = state.browserSession || {};
  const session = state.sessionContext || {};
  const working = state.workingMemory || {};
  const desktop = state.desktopContext || {};
  const recentUserMessages = Array.isArray(session.recentUserMessages) ? session.recentUserMessages.slice(-4) : [];
  const recentAssistantSummaries = Array.isArray(session.recentAssistantSummaries) ? session.recentAssistantSummaries.slice(-3) : [];
  const activeTopics = Array.isArray(session.activeTopics) ? session.activeTopics.slice(0, 8) : [];
  const recentEntities = Array.isArray(session.recentEntities) ? session.recentEntities.slice(0, 10) : [];
  const referenceCandidates = Array.isArray(session.referenceCandidates) ? session.referenceCandidates.slice(0, 8) : [];
  const browserCandidates = Array.isArray(session.browserCandidates) ? session.browserCandidates.slice(0, 8) : [];
  const recentDesktopTarget = desktop.recentSummary || 'none';
  const resolvedReference = session.resolvedReference || session.lastResolvedReference || null;
  const recentTurnsBlock = Array.isArray(state.recentTurns) && state.recentTurns.length > 0
    ? [
      '=== RECENT TURNS ===',
      ...state.recentTurns.slice(-8).map((turn) =>
        String(turn.role || 'user').toUpperCase() + ': ' + String(turn.content || '').substring(0, 220)
      )
    ].join('\n')
    : '';
  const digestBlock = ctx.conversationDigest
    ? ['=== CONVERSATION DIGEST ===', ctx.conversationDigest].join('\n')
    : '';
  const memoryBlock = ctx.memoryCtx
    ? ['=== LONG-TERM MEMORY ===', ctx.memoryCtx, '=== END MEMORY ==='].join('\n')
    : '';

  return [
    ctx.personalityPrompt,
    '',
    '=== IDENTITY ===',
    'You are ' + ctx.localizedUnitName + '.',
    'You were created by ' + ctx.localizedUserName + ' inside Softcurse Lab.',
    'Protect system stability, stay transparent, and maintain continuity across turns.',
    '',
    '=== LANGUAGE ===',
    'Respond entirely in ' + ctx.langName + '.',
    'Do not mix languages except inside code, paths, URLs, app names, or ACTION tags.',
    '',
    '=== LIVE SYSTEM SNAPSHOT ===',
    'Time: ' + ctx.now.toLocaleTimeString() + ' | Date: ' + ctx.now.toLocaleDateString(),
    'CPU: ' + (state.cpu || '--') + '% | RAM: ' + (state.ram || '--') + '% | Disk: ' + (state.disk || '--') + '%',
    'Platform: ' + (state.platform || '--') + ' | AI: ' + (state.aiProvider || '--') + ' | TTS: ' + (state.ttsEngine || '--'),
    'Browser: ' + (browser.open ? 'OPEN' : 'CLOSED'),
    'Browser page: ' + (browser.open ? ((browser.title || 'Untitled') + ' | ' + (browser.url || '--')) : '--'),
    'Browser candidates: ' + (browserCandidates.map((item) => `${item.index}. ${item.label || item.text}`).join(' | ') || 'none'),
    'Recent desktop target: ' + recentDesktopTarget,
    'Desktop windows: ' + ((desktop.windowCandidates || []).join(' | ') || 'none'),
    'Desktop processes: ' + ((desktop.processCandidates || []).join(' | ') || 'none'),
    'Desktop apps: ' + ((desktop.appCandidates || []).join(' | ') || 'none'),
    'Desktop files: ' + ((desktop.fileCandidates || []).join(' | ') || 'none'),
    'Promoted desktop targets: ' + ((desktop.promotedRecent || []).join(' | ') || 'none'),
    'Resolved follow-up target: ' + (resolvedReference ? ('#' + resolvedReference.index + ' ' + (resolvedReference.label || resolvedReference.text || '') + (resolvedReference.url ? ' | ' + resolvedReference.url : '')) : 'none'),
    '',
    '=== ACTIVE SESSION CONTINUITY ===',
    'Current goal: ' + (session.primaryGoal || 'none'),
    'Latest user message: ' + (session.lastUserMessage || userMsg || '--'),
    'Last assistant reply: ' + String(session.lastAssistantMessage || '--').substring(0, 180),
    'Last action plan: ' + (session.lastActionSummary || 'none'),
    'Last system/browser data: ' + String(session.lastSystemDataSummary || 'none').substring(0, 220),
    'Working task: ' + (working.currentTask || 'none'),
    'Working entities: ' + ((working.currentEntities || []).join(', ') || 'none'),
    'Active topics: ' + (activeTopics.join(', ') || 'none'),
    'Recent entities: ' + (recentEntities.join(', ') || 'none'),
    'Reference candidates: ' + (referenceCandidates.join(' | ') || 'none'),
    'Desktop game candidates: ' + ((desktop.gameCandidates || []).join(' | ') || 'none'),
    'Session mood: ' + (working.mood || 'neutral'),
    '',
    'Continuity rules:',
    '- Treat short, referential, ordinal, or corrective messages as follow-ups unless the user clearly changes topic.',
    '- If Browser is OPEN, commands like "open the third video", "click that", "play the first result", "read this page", or "go back" refer to the CURRENT browser session first.',
    '- If recent desktop targets, windows, processes, apps, files, or games are listed in the snapshot, referential desktop commands should use that active desktop context first.',
    '- Resolve pronouns and ordinals against Reference candidates, Recent entities, Active topics, recent desktop targets, and the latest browser/app/file/window/process context before assuming a new request.',
    '- Never behave as if each new user message starts a fresh chat.',
    '- Never say you forgot, start from scratch, or cannot remember.',
    '',
    recentUserMessages.length ? 'Recent user flow: ' + recentUserMessages.join('  ||  ') : '',
    recentAssistantSummaries.length ? 'Recent HEX flow: ' + recentAssistantSummaries.join('  ||  ') : '',
    '',
    digestBlock,
    recentTurnsBlock,
    memoryBlock,
    '',
    '=== BEHAVIOR RULES ===',
    '- Reply naturally like a coherent assistant, not a stateless command parser.',
    '- If the user is chatting, keep the dialogue going logically.',
    '- If the user asks about this PC and the answer is not already known from the snapshot or memory, use an ACTION tag instead of guessing.',
    '- If something is dangerous, ask for confirmation first.',
    '- Do not invent system facts, files, installed apps, or browser contents.',
    '',
    '=== ACTION TAGS ===',
    'Use [ACTION:...] tags only when the user wants a real action on the PC or browser.',
    'Put tags at the END of the message.',
    'Useful tags:',
    '[ACTION:open_app:NAME] [ACTION:open_url:URL] [ACTION:open_folder:ALIAS] [ACTION:open_file:PATH]',
    '[ACTION:find_files:QUERY:CATEGORY] [ACTION:list_software] [ACTION:list_games] [ACTION:sys_info] [ACTION:get_ip] [ACTION:battery] [ACTION:disk_usage] [ACTION:list_processes]',
    '[ACTION:get_clipboard] [ACTION:set_volume:0-100] [ACTION:screenshot] [ACTION:capture_screen] [ACTION:set_reminder:LABEL:MINUTES] [ACTION:run_scan] [ACTION:run_cleanup] [ACTION:run_update_check] [ACTION:system_health]',
    'Browser actions:',
    '[ACTION:web_navigate:URL] [ACTION:web_search:QUERY] [ACTION:web_search:SITE_URL:QUERY] [ACTION:web_find_click:VISIBLE TEXT] [ACTION:web_click:CSS_SELECTOR] [ACTION:web_type:CSS_SELECTOR:TEXT] [ACTION:web_read] [ACTION:web_back] [ACTION:web_refresh] [ACTION:web_close]',
  ].filter(Boolean).join('\n');
};
