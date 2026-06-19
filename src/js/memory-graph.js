'use strict';

window.hexMemoryGraph = {
  addNode(memory, type, content, confidence = 0.7, opts = {}) {
    content = (content || '').trim();
    if (!content) return null;

    const similar = this.findSimilarNode(memory, type, content);
    if (similar && similar.score > 0.75) {
      similar.node.content = content;
      similar.node.last_confirmed_at = Date.now();
      similar.node.mention_count = (similar.node.mention_count || 1) + 1;
      similar.node.confidence = Math.min(1, similar.node.confidence + 0.05);
      similar.node.tier = this.classifyTier(memory, similar.node);
      memory._scheduleSave();
      return similar.node;
    }

    const node = {
      id: memory._uid(),
      type,
      content,
      confidence: Math.max(0, Math.min(1, confidence)),
      created_at: Date.now(),
      last_confirmed_at: Date.now(),
      mention_count: 1,
      status: 'active',
      temporal: opts.temporal || 'current',
      implicit: opts.implicit || false,
      tier: null,
      source_session_id: memory.working.sessionId || null,
    };
    node.tier = this.classifyTier(memory, node);

    memory.nodes.push(node);
    memory._contentHashes.set(this.contentHash(content), node.id);
    this.checkConflictsAsync(memory, node);
    this.evictIfNeeded(memory);
    memory._scheduleSave();
    return node;
  },

  removeFact(memory, id) {
    const node = memory.nodes.find((item) => item.id === id);
    if (node) {
      node.status = 'deleted';
      memory.nodes = memory.nodes.filter((item) => item.id !== id);
    }
    memory.edges = memory.edges.filter((edge) => edge.from !== id && edge.to !== id);
    memory._scheduleSave();
  },

  async checkConflictsAsync(memory, newNode) {
    const candidates = memory.nodes.filter((node) =>
      node.id !== newNode.id &&
      node.status === 'active' &&
      node.type === newNode.type &&
      this.wordOverlap(node.content, newNode.content) > 0.3
    );
    if (!candidates.length) return;

    const OPPOSITION_PAIRS = [
      ['prefer dark', 'prefer light'], ['dark mode', 'light mode'],
      ['love', 'hate'], ['like', 'dislike'], ['use windows', 'use mac'],
      ['use mac', 'use linux'], ['working on', 'finished'],
    ];

    for (const candidate of candidates) {
      for (const [a, b] of OPPOSITION_PAIRS) {
        const candidateText = candidate.content.toLowerCase();
        const newText = newNode.content.toLowerCase();
        if ((candidateText.includes(a) && newText.includes(b)) || (candidateText.includes(b) && newText.includes(a))) {
          this.archiveNode(memory, candidate, newNode.id, 'contradiction_heuristic');
          memory._log(`Conflict resolved: "${candidate.content}" → archived, superseded by "${newNode.content}"`);
          return;
        }
      }
    }

    if (window.hexAI && window.hexAI.config && candidates.length > 0 && candidates[0].confidence > 0.6) {
      this.llmConflictCheck(memory, newNode, candidates[0]).catch(() => { });
    }
  },

  async llmConflictCheck(memory, newNode, candidate) {
    try {
      const result = await memory._quickLLMCall(
        'Answer with exactly one word: CONFLICT, SUPERSEDES, SAME, or UNRELATED.\n' +
        'Fact A: ' + candidate.content + '\n' +
        'Fact B: ' + newNode.content + '\n' +
        'Are these facts conflicting (CONFLICT), does B replace A (SUPERSEDES), are they the same fact (SAME), or unrelated (UNRELATED)?'
      );
      const verdict = (result || '').trim().toUpperCase();
      if (verdict.includes('CONFLICT') || verdict.includes('SUPERSEDES')) {
        this.archiveNode(memory, candidate, newNode.id, 'llm_conflict_check');
        this.createEdge(memory, newNode.id, candidate.id, 'supersedes');
        memory._log(`LLM conflict: "${candidate.content.substring(0, 60)}" archived`);
      }
    } catch (_) { }
  },

  archiveNode(memory, node, supersededById, reason) {
    node.status = 'archived';
    node.archived_at = Date.now();
    node.archived_by = supersededById;
    node.archive_reason = reason;
    memory._scheduleSave();
  },

  createEdge(memory, fromId, toId, type) {
    if (memory.edges.find((edge) => edge.from === fromId && edge.to === toId && edge.type === type)) return;
    memory.edges.push({ id: memory._uid(), from: fromId, to: toId, type, created_at: Date.now() });
    memory._scheduleSave();
  },

  classifyTier(memory, node) {
    if (memory.PROTECTED_TYPES.has(node.type)) return 0;
    if ((node.mention_count || 0) > 20) return 0;
    if (node.confidence > 0.7 && (node.mention_count || 0) > 5) return 1;
    if (node.confidence >= 0.4) return 2;
    return 3;
  },

  evictIfNeeded(memory) {
    const active = memory.nodes.filter((node) => node.status === 'active');
    if (active.length <= memory.FACT_CAP) return;

    const candidates = active
      .filter((node) => node.tier >= 2)
      .map((node) => ({
        node,
        score: this.evictionScore(node)
      }))
      .sort((a, b) => b.score - a.score);

    const toEvict = candidates.slice(0, active.length - memory.FACT_CAP + 20);
    for (const { node } of toEvict) {
      node.status = 'evicted';
      node.evicted_at = Date.now();
    }
    if (toEvict.length) memory._log(`Evicted ${toEvict.length} weak facts.`);
  },

  evictionScore(node) {
    const ageDays = (Date.now() - (node.created_at || 0)) / 86400000;
    const recencyBoost = 1 + Math.log(1 + ageDays / 30);
    const mentionWeight = Math.min(1, (node.mention_count || 0) / 20);
    return (1 - node.confidence) * recencyBoost * (1 - mentionWeight);
  },

  findSimilarNode(memory, type, content) {
    const hash = this.contentHash(content);
    const hashHit = memory._contentHashes.get(hash);
    if (hashHit) {
      const node = memory.nodes.find((item) => item.id === hashHit && item.status === 'active');
      if (node) return { node, score: 1.0 };
    }

    let best = null;
    let bestScore = 0;
    for (const node of memory.nodes) {
      if (node.status !== 'active' || node.type !== type) continue;
      const score = this.wordOverlap(node.content, content);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best && bestScore > 0.75 ? { node: best, score: bestScore } : null;
  },

  wordOverlap(a, b) {
    const wa = new Set((a || '').toLowerCase().split(/\W+/).filter((word) => word.length > 3));
    const wb = new Set((b || '').toLowerCase().split(/\W+/).filter((word) => word.length > 3));
    if (!wa.size || !wb.size) return 0;
    let overlap = 0;
    for (const word of wa) if (wb.has(word)) overlap++;
    return overlap / Math.max(wa.size, wb.size);
  },

  contentHash(content) {
    const str = (content || '').trim().toLowerCase();
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  },
};
