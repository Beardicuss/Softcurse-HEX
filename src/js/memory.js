'use strict';
// ── memory.js — H.E.X. Intelligent Memory System v2.0 ────────────────────────
//
// Architecture:
//   Layer 1 — Knowledge Graph  (nodes + edges, temporal, tiered)
//   Layer 2 — Working Memory   (in-RAM session context, cleared on restart)
//   Layer 3 — Episodic Store   (compressed session summaries)
//   Layer 4 — Meta-Memory      (self-knowledge index)
//
// Extraction: async LLM-powered after each exchange (non-blocking)
// Retrieval:  relevance-scored, not dump-all
// Eviction:   tiered — Protected / High / Active / Weak
// Conflicts:  detected and archived, never silently overwritten

class HexMemory {
  constructor() {
    // ── Core storage ──────────────────────────────────────────────────────
    this.nodes = [];   // knowledge graph nodes
    this.edges = [];   // relationships between nodes
    this.clusters = [];  // auto-generated summary clusters
    this.episodes = [];  // compressed session summaries
    this.reflections = []; // Tier 2: LLM-synthesized observations
    this.summary = '';  // legacy rolling summary (kept for compat)
    this.history = [];  // conversation turns
    this.selfKnowledge = null;  // meta-memory index

    // ── Working memory (session-only, not persisted) ──────────────────────
    this.working = {
      currentTask: null,
      currentEntities: [],
      sessionPreferences: [],
      hypotheses: [],
      pendingFacts: [],
      sessionStarted: Date.now(),
      messageCount: 0,
      mood: 'neutral',  // neutral / focused / frustrated / exploratory
      lastLiveSessionSummary: '',
      lastLiveSessionAt: null
    };

    // ── Config ────────────────────────────────────────────────────────────
    this.MAX_HISTORY_KEEP = 120;
    this.MAX_HISTORY_INJECT = 20;
    this.FACT_CAP = 500;
    this.EXTRACTION_ENABLED = true;   // LLM extraction (requires configured AI)

    this._dirty = false;
    this._saveTimer = null;
    this._extracting = false;   // prevent concurrent extraction
    this._reflecting = false;   // prevent concurrent reflection
    this._lastReflection = null;  // cooldown timestamp
    this.onLog = null;

    // ── Prompt shaping (session-scoped) ──────────────────────────────────
    this._sessionMentions = new Map();  // nodeId → mention count this session
    this.SUPPRESS_THRESHOLD = 9999;     // continuity > anti-repeat for assistant memory
    this.SUPPRESS_WINDOW_MS = 5 * 60 * 60 * 1000;
    this.MAX_CONTEXT_FACTS = 24;
    this.MAX_CONTEXT_CHARS = 3200;

    // ── Content hash index (fast dedup) ──────────────────────────────────
    this._contentHashes = new Map();  // hash → nodeId (built on load)

    // ── Tier definitions ──────────────────────────────────────────────────
    this.PROTECTED_TYPES = new Set(['user', 'health', 'system', 'action_outcome']);
    this.TIER_LABELS = { 0: 'protected', 1: 'high', 2: 'active', 3: 'weak' };
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  LOAD / SAVE
  // ════════════════════════════════════════════════════════════════════════════════
  async load() { return window.hexMemoryStorage.load(this); }

  _migrateLegacy(data) { return window.hexMemoryStorage.migrateLegacy(this, data); }

  _scheduleSave() { return window.hexMemoryStorage.scheduleSave(this); }

  async _flush() { return window.hexMemoryStorage.flush(this); }

  async forceSave() { return window.hexMemoryStorage.forceSave(this); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  WORKING MEMORY
  // ════════════════════════════════════════════════════════════════════════════════
  updateWorking(updates) {
    if (updates.currentTask) this.working.currentTask = updates.currentTask;
    if (updates.currentEntities) this.working.currentEntities = updates.currentEntities;
    if (updates.sessionPreferences) this.working.sessionPreferences = [...this.working.sessionPreferences, ...updates.sessionPreferences];
    if (updates.hypotheses) this.working.hypotheses = updates.hypotheses;
    if (updates.pendingFacts) this.working.pendingFacts = [...this.working.pendingFacts, ...updates.pendingFacts];
    if (updates.mood) this.working.mood = updates.mood;
  }

  _detectMood(userMsg) { return window.hexMemoryExtraction.detectMood(this, userMsg); }

  promoteLiveSession(state) { return window.hexMemorySession?.promoteLiveSession?.(this, state); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  KNOWLEDGE GRAPH — NODES
  // ════════════════════════════════════════════════════════════════════════════════
  addNode(type, content, confidence = 0.7, opts = {}) { return window.hexMemoryGraph.addNode(this, type, content, confidence, opts); }

  // Backward-compatible API used by older code
  addFact(category, content, confidence = 0.7) {
    return this.addNode(category, content, confidence);
  }

  removeFact(id) { return window.hexMemoryGraph.removeFact(this, id); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  CONFLICT DETECTION
  // ════════════════════════════════════════════════════════════════════════════════
  async _checkConflictsAsync(newNode) { return window.hexMemoryGraph.checkConflictsAsync(this, newNode); }

  async _llmConflictCheck(newNode, candidate) { return window.hexMemoryGraph.llmConflictCheck(this, newNode, candidate); }

  _archiveNode(node, supersededById, reason) { return window.hexMemoryGraph.archiveNode(this, node, supersededById, reason); }

  _createEdge(fromId, toId, type) { return window.hexMemoryGraph.createEdge(this, fromId, toId, type); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  TIERED EVICTION
  // ════════════════════════════════════════════════════════════════════════════════
  _classifyTier(node) { return window.hexMemoryGraph.classifyTier(this, node); }

  _evictIfNeeded() { return window.hexMemoryGraph.evictIfNeeded(this); }

  _evictionScore(node) { return window.hexMemoryGraph.evictionScore(node); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  ASYNC LLM EXTRACTION ENGINE
  // ════════════════════════════════════════════════════════════════════════════════
  async extractFromExchange(userMsg, aiReply) { return window.hexMemoryExtraction.extractFromExchange(this, userMsg, aiReply); }

  _extractKeywords(userMsg) { return window.hexMemoryExtraction.extractKeywords(this, userMsg); }

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTION OUTCOME RECORDING — HEX learns from success and failure
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call this after an action is executed to record its outcome.
   * @param {string} actionTag  e.g. 'open_app:spotify'
   * @param {boolean} success   true if the action worked
   * @param {string} [detail]   optional detail (error message, result summary)
   */
  recordActionOutcome(actionTag, success, detail = '') { return window.hexMemoryExtraction.recordActionOutcome(this, actionTag, success, detail); }

  /**
   * Call this when a user explicitly corrects HEX.
   * @param {string} wrongAssumption  what HEX got wrong
   * @param {string} correction       what the user said is correct
   */
  learnFromCorrection(wrongAssumption, correction) { return window.hexMemoryExtraction.learnFromCorrection(this, wrongAssumption, correction); }

  // ══════════════════════════════════════════════════════════════════════════
  //  AUTO-COMPRESSION — triggers automatically after N turns
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call this after each exchange. Auto-compresses every AUTO_COMPRESS_EVERY turns.
   */
  async maybeAutoCompress() { return window.hexMemoryExtraction.maybeAutoCompress(this); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  REFLECTION ENGINE — Tier 2 Memory (Facts → Observations)
  // ════════════════════════════════════════════════════════════════════════════════
  /**
   * Synthesizes clusters of related facts into higher-level observations.
   * Observations start as "pending" and auto-promote to "confirmed" after 3 days
   * if the user doesn't deny them.
   */
  async maybeReflect() { return window.hexMemoryExtraction.maybeReflect(this); }

  /**
   * Auto-promote reflections that have been pending for 3+ days without denial.
   */
  _autoPromoteReflections() { return window.hexMemoryExtraction.autoPromoteReflections(this); }

  denyReflection(id) { return window.hexMemoryExtraction.denyReflection(this, id); }

  async _extractWithLLM(userMsg, aiReply) { return window.hexMemoryExtraction.extractWithLLM(this, userMsg, aiReply); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  EPISODIC SESSION COMPRESSION
  // ════════════════════════════════════════════════════════════════════════════════
  async compressCurrentSession() {
    const recentTurns = this.history.slice(-40);
    if (recentTurns.length < 4) {
      throw new Error(`Need at least 4 messages to compress (currently have ${recentTurns.length}).`);
    }

    const transcript = recentTurns.map(t =>
      (t.role === 'user' ? 'User: ' : 'HEX: ') + (t.content || '').substring(0, 200)
    ).join('\n');

    const summary = await this._quickLLMCall(
      'Summarize this conversation in 3-5 sentences. Focus on: what the user was working on, any problems encountered, outcomes or decisions made, and anything learned about the user.\n\n' + transcript.substring(0, 3000)
    );

    if (!summary) {
      throw new Error(`AI failed to generate a summary. Check connection and AI provider configuration in Settings.`);
    }

    const episode = {
      id: this._uid(),
      session_id: 'sess_' + Date.now(),
      started_at: this.working.sessionStarted,
      ended_at: Date.now(),
      turn_count: recentTurns.length,
      topics: this._extractTopics(transcript),
      summary,
      new_node_ids: this.nodes.filter(n => n.created_at >= this.working.sessionStarted).map(n => n.id),
    };
    this.episodes.push(episode);

    // Keep last 50 episodes
    if (this.episodes.length > 50) this.episodes = this.episodes.slice(-50);

    this._log('Session compressed into episodic memory: ' + episode.topics.join(', '));
    this._scheduleSave();
    return episode;
  }

  _extractTopics(text) {
    const topics = [];
    const patterns = [
      /(?:working on|setting up|configuring|debugging|building)\s+(.{3,40})/gi,
      /\b(docker|nginx|python|react|git|ssh|api|database|css|javascript|rust|go)\b/gi,
    ];
    for (const pat of patterns) {
      const matches = [...text.matchAll(pat)];
      for (const m of matches.slice(0, 3)) {
        const topic = (m[1] || m[0]).trim().toLowerCase();
        if (!topics.includes(topic)) topics.push(topic);
      }
    }
    return topics.slice(0, 5);
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  META-MEMORY — SELF-KNOWLEDGE
  // ════════════════════════════════════════════════════════════════════════════════
  _updateSelfKnowledge() { return window.hexMemoryRetrieval.updateSelfKnowledge(this); }

  getHealthReport() { return window.hexMemoryRetrieval.getHealthReport(this); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  HYBRID RETRIEVAL — relevance-scored context injection
  // ════════════════════════════════════════════════════════════════════════════════
  getContext(currentMessage, options = {}) { return window.hexMemoryRetrieval.getContext(this, currentMessage, options); }

  getConversationDigest(n = 8, maxChars = 900) { return window.hexMemoryRetrieval.getConversationDigest(this, n, maxChars); }

  _relevanceScore(node, message) { return window.hexMemoryRetrieval.relevanceScore(this, node, message); }

  _findRelevantEpisode(message) { return window.hexMemoryRetrieval.findRelevantEpisode(this, message); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  CONVERSATION HISTORY
  // ════════════════════════════════════════════════════════════════════════════════
  addTurn(role, content) { return window.hexMemoryRetrieval.addTurn(this, role, content); }

  getRecentHistory(n = 20) { return window.hexMemoryRetrieval.getRecentHistory(this, n); }

  clearFacts() { this.nodes = this.edges = this.clusters = []; this._scheduleSave(); }
  clearHistory() { this.history = []; this.summary = ''; this._scheduleSave(); }
  clearAll() { this.nodes = this.edges = this.clusters = this.episodes = []; this.reflections = []; this.history = []; this.summary = ''; this.selfKnowledge = null; this._scheduleSave(); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════════════════════════
  _findSimilarNode(type, content) { return window.hexMemoryGraph.findSimilarNode(this, type, content); }

  _wordOverlap(a, b) { return window.hexMemoryGraph.wordOverlap(a, b); }

  _contentHash(content) { return window.hexMemoryGraph.contentHash(content); }

  _rebuildHashIndex() { return window.hexMemoryStorage.rebuildHashIndex(this); }

  _uid() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  async _quickLLMCall(prompt, maxTokens = 400) {
    if (!prompt || !window.hexAI?.chat || !window.hexAI?.config?.llm || window.hexAI.config.llm.provider === 'none') {
      return null;
    }

    try {
      const systemState = window.hexAI._lastSystemState
        || (typeof window.buildAIContextState === 'function'
          ? await window.buildAIContextState('[memory-internal]', {
            config: window._hexConfig || {},
            sysStats: window.sysStats || {},
            skipUserUpdate: true
          })
          : {});

      const lang = window._hexConfig?.language || 'en';
      const result = await window.hexAI.chat(
        prompt,
        systemState,
        lang,
        null,
        maxTokens,
        { persistUser: false, persistAssistant: false, extractFacts: false }
      );

      const text = String(result?.text || '').trim();
      if (!text || text === '…' || /^Neural link disrupted:/i.test(text)) return null;
      return text;
    } catch (_) {
      return null;
    }
  }

  _log(msg) { this.onLog?.(msg); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  STATS FOR UI
  // ════════════════════════════════════════════════════════════════════════════════
  getStats() { return window.hexMemoryRetrieval.getStats(this); }

  // For memory tab — expose active nodes grouped by type
  get facts() {
    return this.nodes
      .filter(n => n.status === 'active')
      .map(n => ({ ...n, category: n.type }));  // alias for legacy UI code
  }
}

window.hexMemory = new HexMemory();



