'use strict';

window.hexMemoryStorage = {
  async load(memory) {
    try {
      window.hexTaskBus?.push('Loading memory from disk...');
      const data = await window.hexAPI.getMemory();
      if (data) {
        if (data.schema_version === '2.0') {
          memory.nodes = data.nodes || [];
          memory.edges = data.edges || [];
          memory.clusters = data.clusters || [];
          memory.episodes = data.episodes || [];
          memory.reflections = data.reflections || [];
          memory.history = data.history || [];
          memory.summary = data.summary || '';
          memory.selfKnowledge = data.selfKnowledge || null;
          if (data.working && typeof data.working === 'object') {
            memory.working = { ...memory.working, ...data.working };
          }
        } else {
          this.migrateLegacy(memory, data);
        }
        memory._log(`Memory loaded: ${memory.nodes.length} nodes, ${memory.history.length} turns, ${memory.episodes.length} sessions`);
        memory._updateSelfKnowledge();
        this.rebuildHashIndex(memory);
      } else {
        memory._log('No prior memory. Starting fresh.');
      }
    } catch (error) {
      memory._log('Memory load failed: ' + (error?.message || String(error)));
    }
  },

  migrateLegacy(memory, data) {
    const legacyFacts = data.facts || [];
    memory.history = data.history || [];
    memory.summary = data.summary || '';
    for (const fact of legacyFacts) {
      memory.nodes.push({
        id: fact.id || memory._uid(),
        type: fact.category || 'general',
        content: fact.content || '',
        confidence: fact.confidence || 0.7,
        created_at: fact.ts || Date.now(),
        last_confirmed_at: fact.ts || Date.now(),
        mention_count: 1,
        status: 'active',
        tier: memory._classifyTier({
          type: fact.category,
          confidence: fact.confidence || 0.7,
          mention_count: 1,
          created_at: fact.ts || Date.now()
        }),
        temporal: 'current',
        implicit: false,
        migrated: true,
      });
    }
    memory._log(`Migrated ${legacyFacts.length} legacy facts to v2 nodes.`);
  },

  scheduleSave(memory) {
    memory._dirty = true;
    clearTimeout(memory._saveTimer);
    memory._saveTimer = setTimeout(() => memory._flush(), 2000);
  },

  async flush(memory) {
    if (!memory._dirty) return;
    try {
      window.hexTaskBus?.push('Flushing memory to disk...');
      await window.hexAPI.setMemory({
        schema_version: '2.0',
        saved_at: new Date().toISOString(),
        nodes: memory.nodes,
        edges: memory.edges,
        clusters: memory.clusters,
        episodes: memory.episodes,
        reflections: memory.reflections,
        history: memory.history.slice(-memory.MAX_HISTORY_KEEP),
        summary: memory.summary,
        selfKnowledge: memory.selfKnowledge,
        working: memory.working,
      });
      memory._dirty = false;
    } catch (error) {
      memory._log('Memory save failed: ' + (error?.message || String(error)));
    }
  },

  async forceSave(memory) {
    clearTimeout(memory._saveTimer);
    await memory._flush();
  },

  rebuildHashIndex(memory) {
    memory._contentHashes.clear();
    for (const node of memory.nodes) {
      if (node.status === 'active') {
        memory._contentHashes.set(memory._contentHash(node.content), node.id);
      }
    }
  },
};

