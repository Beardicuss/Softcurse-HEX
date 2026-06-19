'use strict';

window.hexMemoryRetrieval = {
  updateSelfKnowledge(memory) {
    const activeNodes = memory.nodes.filter((node) => node.status === 'active');
    const byType = {};
    for (const node of activeNodes) {
      if (!byType[node.type]) byType[node.type] = [];
      byType[node.type].push(node);
    }

    const known_well = Object.entries(byType).filter(([, value]) => value.length >= 3).map(([key]) => key);
    const known_partially = Object.entries(byType).filter(([, value]) => value.length >= 1 && value.length < 3).map(([key]) => key);
    const recent_changes = memory.nodes
      .filter((node) => Date.now() - node.last_confirmed_at < 7 * 86400000 && node.status === 'active')
      .slice(-5)
      .map((node) => node.content.substring(0, 60));

    memory.selfKnowledge = {
      total_nodes: activeNodes.length,
      known_well,
      known_partially,
      recent_changes,
      oldest_fact_date: activeNodes.reduce((min, node) => Math.min(min, node.created_at || Date.now()), Date.now()),
      session_count: memory.episodes.length,
      last_updated: Date.now(),
    };
  },

  getHealthReport(memory) {
    this.updateSelfKnowledge(memory);
    const selfKnowledge = memory.selfKnowledge;
    if (!selfKnowledge) return 'No memory data yet.';

    const lines = [
      'Facts stored: ' + selfKnowledge.total_nodes,
      'Know well: ' + (selfKnowledge.known_well.join(', ') || 'none yet'),
      'Know partially: ' + (selfKnowledge.known_partially.join(', ') || 'none'),
      'Sessions remembered: ' + selfKnowledge.session_count,
    ];
    if (selfKnowledge.recent_changes.length) {
      lines.push('Recent additions: ' + selfKnowledge.recent_changes.slice(0, 3).join('; '));
    }
    return lines.join('\n');
  },

  getContext(memory, currentMessage, options = {}) {
    const parts = [];
    const activeNodes = memory.nodes.filter((node) => node.status === 'active');
    const maxFacts = options.maxFacts || memory.MAX_CONTEXT_FACTS;
    const maxChars = options.maxChars || memory.MAX_CONTEXT_CHARS;

    const working = memory.working;
    const workingLines = [];
    if (working.currentTask) workingLines.push('Current task: ' + working.currentTask);
    if (working.currentEntities.length) workingLines.push('Active entities: ' + working.currentEntities.join(', '));
    if (working.sessionPreferences.length) workingLines.push('Session preferences: ' + working.sessionPreferences.join(', '));
    if (working.mood && working.mood !== 'neutral') workingLines.push('Mood this session: ' + working.mood);
    if (working.hypotheses.length) {
      const hypotheses = working.hypotheses.slice(0, 2).map((item) => item.belief + ' (' + Math.round(item.confidence * 100) + '%)');
      workingLines.push('Working hypotheses: ' + hypotheses.join('; '));
    }
    if (workingLines.length) parts.push('[SESSION CONTEXT]\n' + workingLines.join('\n'));

    const continuityLines = window.hexMemorySession?.buildContinuityRecall?.(memory, currentMessage || '') || [];
    if (continuityLines.length) {
      parts.push('[CONTINUITY MEMORY]\n' + continuityLines.join('\n'));
    }

    if (activeNodes.length > 0) {
      const scored = activeNodes.map((node) => ({
        node,
        score: this.relevanceScore(memory, node, currentMessage || '')
      })).sort((a, b) => b.score - a.score).slice(0, maxFacts);

      scored.forEach(({ node }) => {
        const mentions = memory._sessionMentions.get(node.id) || 0;
        memory._sessionMentions.set(node.id, mentions + 1);
      });

      const groups = {};
      for (const { node } of scored) {
        const type = node.type || 'general';
        if (!groups[type]) groups[type] = [];
        const confidence = node.confidence;
        const qualifier = confidence > 0.8 ? '' : confidence > 0.5 ? ' (likely)' : ' (uncertain)';
        groups[type].push(node.content + qualifier);
      }

      const typeOrder = ['user', 'system', 'app_preference', 'folder', 'workflow', 'skill', 'preference', 'habit', 'task', 'action_outcome', 'belief', 'general'];
      const factLines = [];
      for (const type of typeOrder) {
        if (groups[type]) factLines.push(...groups[type].map((content) => '[' + type + '] ' + content));
      }
      for (const type of Object.keys(groups)) {
        if (!typeOrder.includes(type)) factLines.push(...groups[type].map((content) => '[' + type + '] ' + content));
      }

      if (factLines.length) parts.push('[KNOWN FACTS ABOUT USER]\n' + factLines.join('\n'));
    }

    const failures = activeNodes.filter((node) => node.type === 'action_outcome' && node.content.startsWith('Action failed:'));
    if (failures.length) {
      parts.push('[KNOWN FAILURES — avoid repeating]\n' + failures.map((node) => node.content).join('\n'));
    }

    const pendingReflections = (memory.reflections || []).filter((reflection) => reflection.status === 'pending' || reflection.status === 'confirmed');
    if (pendingReflections.length) {
      const observationLines = pendingReflections.slice(0, 3).map((reflection) => {
        const qualifier = reflection.status === 'pending' ? ' (not sure yet)' : '';
        return `• ${reflection.content}${qualifier}`;
      });
      parts.push('[YOUR OBSERVATIONS ABOUT USER — mention naturally if relevant]\n' + observationLines.join('\n'));
    }

    if (currentMessage && memory.episodes.length > 0) {
      const relevantEpisode = this.findRelevantEpisode(memory, currentMessage);
      if (relevantEpisode) {
        parts.push('[RELEVANT PAST SESSION]\n' + relevantEpisode.summary);
      }
    }

    if (memory.summary) {
      parts.push('[CONVERSATION SUMMARY]\n' + memory.summary);
    }

    const joined = parts.join('\n\n');
    return joined.length > maxChars ? joined.substring(0, maxChars) : joined;
  },

  getConversationDigest(memory, n = 8, maxChars = 900) {
    const turns = memory.history.slice(-Math.max(2, n));
    if (!turns.length) return '';

    const lines = turns.map((turn) => {
      const label = turn.role === 'assistant' ? 'HEX' : 'USER';
      return label + ': ' + String(turn.content || '').replace(/\s+/g, ' ').trim().substring(0, 180);
    });

    const digest = lines.join('\n');
    return digest.length > maxChars ? digest.substring(digest.length - maxChars) : digest;
  },

  relevanceScore(memory, node, message) {
    const lowerMessage = message.toLowerCase();
    const lowerContent = node.content.toLowerCase();

    const messageWords = new Set(lowerMessage.split(/\W+/).filter((word) => word.length > 3));
    const contentWords = new Set(lowerContent.split(/\W+/).filter((word) => word.length > 3));
    let overlap = 0;
    for (const word of contentWords) if (messageWords.has(word)) overlap++;
    const textScore = messageWords.size ? overlap / messageWords.size : 0;

    const ageDays = (Date.now() - (node.last_confirmed_at || node.created_at || 0)) / 86400000;
    const recency = Math.max(0, 1 - ageDays / 180);
    const mention = Math.min(1, (node.mention_count || 0) / 10);
    const tierBonus = node.tier === 0 ? 0.3 : node.tier === 1 ? 0.1 : 0;

    return (0.5 * textScore) + (0.25 * recency) + (0.15 * node.confidence) + (0.1 * mention) + tierBonus;
  },

  findRelevantEpisode(memory, message) {
    if (!memory.episodes.length) return null;
    const messageWords = new Set(message.toLowerCase().split(/\W+/).filter((word) => word.length > 3));
    let best = null;
    let bestScore = 0;
    for (const episode of memory.episodes.slice(-20)) {
      const episodeWords = new Set((episode.summary + ' ' + episode.topics.join(' ')).toLowerCase().split(/\W+/).filter((word) => word.length > 3));
      let overlap = 0;
      for (const word of episodeWords) if (messageWords.has(word)) overlap++;
      const score = episodeWords.size ? overlap / episodeWords.size : 0;
      if (score > bestScore && score > 0.15) {
        bestScore = score;
        best = episode;
      }
    }
    return best;
  },

  addTurn(memory, role, content) {
    memory.history.push({ role, content: (content || '').substring(0, 600), ts: Date.now() });
    if (memory.history.length > memory.MAX_HISTORY_KEEP * 2) {
      memory.history = memory.history.slice(-memory.MAX_HISTORY_KEEP);
    }
    memory.summary = this.getConversationDigest(memory, 10, 1200);
    memory._scheduleSave();
  },

  getRecentHistory(memory, n = 20) {
    return memory.history.slice(-n).map((turn) => ({ role: turn.role || 'user', content: turn.content || '' }));
  },

  getStats(memory) {
    const active = memory.nodes.filter((node) => node.status === 'active');
    const archived = memory.nodes.filter((node) => node.status === 'archived');
    const byTier = [0, 1, 2, 3].map((tier) => active.filter((node) => node.tier === tier).length);
    this.updateSelfKnowledge(memory);
    return {
      facts: active.length,
      archived: archived.length,
      turns: memory.history.length,
      sessions: memory.episodes.length,
      edges: memory.edges.length,
      summary: !!memory.summary,
      tierCounts: { protected: byTier[0], high: byTier[1], active: byTier[2], weak: byTier[3] },
      oldestTurn: memory.history[0] ? new Date(memory.history[0].ts).toLocaleDateString() : null,
      workingMemory: memory.working,
      selfKnowledge: memory.selfKnowledge,
    };
  },
};

