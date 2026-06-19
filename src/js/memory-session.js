'use strict';

window.hexMemorySession = {
  summarizeLiveSession(state = {}) {
    const session = state.sessionContext || {};
    const browser = state.browserSession || {};
    const desktop = state.desktopContext || {};
    const working = state.workingMemory || {};

    const lines = [];
    if (session.primaryGoal) lines.push('Goal: ' + session.primaryGoal);
    if (session.lastActionSummary) lines.push('Actions: ' + session.lastActionSummary);
    if (working.currentTask) lines.push('Working task: ' + working.currentTask);
    if (Array.isArray(working.currentEntities) && working.currentEntities.length) {
      lines.push('Entities: ' + working.currentEntities.slice(0, 8).join(', '));
    }
    if (browser.open) {
      lines.push('Browser: ' + (browser.title || 'Untitled') + ' | ' + (browser.url || '--'));
    }
    if (desktop.recentSummary && desktop.recentSummary !== 'none') {
      lines.push('Desktop target: ' + desktop.recentSummary);
    }
    if (desktop.windowCandidates?.length) lines.push('Windows: ' + desktop.windowCandidates.slice(0, 4).join(' | '));
    if (desktop.processCandidates?.length) lines.push('Processes: ' + desktop.processCandidates.slice(0, 4).join(' | '));
    if (desktop.appCandidates?.length) lines.push('Apps: ' + desktop.appCandidates.slice(0, 4).join(' | '));
    if (desktop.fileCandidates?.length) lines.push('Files: ' + desktop.fileCandidates.slice(0, 4).join(' | '));
    if (desktop.gameCandidates?.length) lines.push('Games: ' + desktop.gameCandidates.slice(0, 4).join(' | '));
    return lines.slice(0, 10);
  },

  promoteLiveSession(memory, state = {}) {
    if (!memory || !state) return;
    const session = state.sessionContext || {};
    const browser = state.browserSession || {};
    const desktop = state.desktopContext || {};
    const working = state.workingMemory || {};
    const summaryLines = this.summarizeLiveSession(state);

    if (session.primaryGoal) {
      memory.addNode('task', 'Current goal: ' + session.primaryGoal.substring(0, 220), 0.82, { implicit: true, temporal: 'current' });
    }
    if (working.currentTask) {
      memory.addNode('task', 'Current working task: ' + working.currentTask.substring(0, 220), 0.8, { implicit: true, temporal: 'current' });
    }
    if (Array.isArray(working.currentEntities)) {
      working.currentEntities.slice(0, 6).forEach((entity) => {
        memory.addNode('workflow', 'Current session entity: ' + String(entity).substring(0, 120), 0.7, { implicit: true, temporal: 'current' });
      });
    }
    if (browser.open && (browser.title || browser.url)) {
      memory.addNode('workflow', 'Active browser session: ' + ((browser.title || 'Untitled') + ' | ' + (browser.url || '--')).substring(0, 220), 0.78, { implicit: true, temporal: 'current' });
    }
    if (desktop.recentSummary && desktop.recentSummary !== 'none') {
      memory.addNode('workflow', 'Recent desktop target: ' + desktop.recentSummary.substring(0, 220), 0.76, { implicit: true, temporal: 'current' });
    }

    memory.working.lastLiveSessionSummary = summaryLines.join(' || ');
    memory.working.lastLiveSessionAt = Date.now();
    memory.updateWorking({
      currentTask: working.currentTask || session.primaryGoal || memory.working.currentTask,
      currentEntities: Array.isArray(working.currentEntities) ? working.currentEntities.slice(0, 12) : memory.working.currentEntities,
      mood: working.mood || memory.working.mood
    });
    memory._scheduleSave();
  },

  buildContinuityRecall(memory, currentMessage = '') {
    const lines = [];
    if (memory.working.lastLiveSessionSummary) {
      lines.push('Live session snapshot: ' + memory.working.lastLiveSessionSummary);
    }

    const recentTaskNodes = memory.nodes
      .filter((node) => node.status === 'active' && (node.type === 'task' || node.type === 'workflow'))
      .sort((a, b) => (b.last_confirmed_at || b.created_at || 0) - (a.last_confirmed_at || a.created_at || 0))
      .slice(0, 6)
      .map((node) => node.content);
    if (recentTaskNodes.length) {
      lines.push('Recent task memory: ' + recentTaskNodes.join(' | '));
    }

    const recentTurns = memory.history.slice(-6).map((turn) => {
      const label = turn.role === 'assistant' ? 'HEX' : 'USER';
      return label + ': ' + String(turn.content || '').replace(/\s+/g, ' ').trim().substring(0, 120);
    });
    if (recentTurns.length) {
      lines.push('Recent dialogue: ' + recentTurns.join(' || '));
    }

    if (currentMessage) {
      const episode = window.hexMemoryRetrieval?.findRelevantEpisode?.(memory, currentMessage);
      if (episode?.summary) lines.push('Relevant remembered session: ' + episode.summary.substring(0, 220));
    }

    return lines.slice(0, 4);
  }
};
