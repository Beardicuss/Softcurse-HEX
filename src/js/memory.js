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
    };

    // ── Config ────────────────────────────────────────────────────────────
    this.MAX_HISTORY_KEEP = 120;
    this.MAX_HISTORY_INJECT = 20;
    this.FACT_CAP = 500;
    this.EXTRACTION_ENABLED = true;   // LLM extraction (requires configured AI)

    this._dirty = false;
    this._saveTimer = null;
    this._extracting = false;   // prevent concurrent extraction
    this.onLog = null;

    // ── Tier definitions ──────────────────────────────────────────────────
    this.PROTECTED_TYPES = new Set(['user', 'health', 'system', 'action_outcome']);
    this.TIER_LABELS = { 0: 'protected', 1: 'high', 2: 'active', 3: 'weak' };
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  LOAD / SAVE
  // ════════════════════════════════════════════════════════════════════════════════
  async load() {
    try {
      window.hexTaskBus?.push('Loading memory from disk...');
      const data = await window.hexAPI.getMemory();
      if (data) {
        if (data.schema_version === '2.0') {
          // Native v2 format
          this.nodes = data.nodes || [];
          this.edges = data.edges || [];
          this.clusters = data.clusters || [];
          this.episodes = data.episodes || [];
          this.history = data.history || [];
          this.summary = data.summary || '';
          this.selfKnowledge = data.selfKnowledge || null;
        } else {
          // Migrate from v1 flat facts
          this._migrateLegacy(data);
        }
        this._log(`Memory loaded: ${this.nodes.length} nodes, ${this.history.length} turns, ${this.episodes.length} sessions`);
        this._updateSelfKnowledge();
      } else {
        this._log('No prior memory. Starting fresh.');
      }
    } catch (e) {
      this._log('Memory load failed: ' + (e?.message || String(e)));
    }
  }

  _migrateLegacy(data) {
    const legacyFacts = data.facts || [];
    this.history = data.history || [];
    this.summary = data.summary || '';
    for (const f of legacyFacts) {
      this.nodes.push({
        id: f.id || this._uid(),
        type: f.category || 'general',
        content: f.content || '',
        confidence: f.confidence || 0.7,
        created_at: f.ts || Date.now(),
        last_confirmed_at: f.ts || Date.now(),
        mention_count: 1,
        status: 'active',
        tier: this._classifyTier({ type: f.category, confidence: f.confidence || 0.7, mention_count: 1, created_at: f.ts || Date.now() }),
        temporal: 'current',
        implicit: false,
        migrated: true,
      });
    }
    this._log(`Migrated ${legacyFacts.length} legacy facts to v2 nodes.`);
  }

  _scheduleSave() {
    this._dirty = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), 2000);
  }

  async _flush() {
    if (!this._dirty) return;
    try {
      window.hexTaskBus?.push('Flushing memory to disk...');
      await window.hexAPI.setMemory({
        schema_version: '2.0',
        saved_at: new Date().toISOString(),
        nodes: this.nodes,
        edges: this.edges,
        clusters: this.clusters,
        episodes: this.episodes,
        history: this.history.slice(-this.MAX_HISTORY_KEEP),
        summary: this.summary,
        selfKnowledge: this.selfKnowledge,
      });
      this._dirty = false;
    } catch (e) {
      this._log('Memory save failed: ' + (e?.message || String(e)));
    }
  }

  async forceSave() {
    clearTimeout(this._saveTimer);
    await this._flush();
  }

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

  _detectMood(userMsg) {
    const t = (userMsg || '').toLowerCase();
    const frustrated = /ugh|argh|still not|doesn.t work|why (is|does|won.t)|i.ve been|hours?|nothing works/i.test(t);
    const exploratory = /what if|maybe|could we|alternatively|i wonder|what about/i.test(t);
    const focused = userMsg.length > 200 || /```|function|class |const |def |import /i.test(t);
    if (frustrated) return 'frustrated';
    if (focused) return 'focused';
    if (exploratory) return 'exploratory';
    return this.working.mood;
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  KNOWLEDGE GRAPH — NODES
  // ════════════════════════════════════════════════════════════════════════════════
  addNode(type, content, confidence = 0.7, opts = {}) {
    content = (content || '').trim();
    if (!content) return null;

    // Check for existing similar node
    const similar = this._findSimilarNode(type, content);

    if (similar && similar.score > 0.75) {
      // Update existing — boost confidence and mention count
      similar.node.content = content;  // take newer phrasing
      similar.node.last_confirmed_at = Date.now();
      similar.node.mention_count = (similar.node.mention_count || 1) + 1;
      similar.node.confidence = Math.min(1, similar.node.confidence + 0.05);
      similar.node.tier = this._classifyTier(similar.node);
      this._scheduleSave();
      return similar.node;
    }

    const node = {
      id: this._uid(),
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
      source_session_id: this.working.sessionId || null,
    };
    node.tier = this._classifyTier(node);

    this.nodes.push(node);

    // Async conflict check (non-blocking)
    this._checkConflictsAsync(node);

    this._evictIfNeeded();
    this._scheduleSave();
    return node;
  }

  // Backward-compatible API used by older code
  addFact(category, content, confidence = 0.7) {
    return this.addNode(category, content, confidence);
  }

  removeFact(id) {
    const node = this.nodes.find(n => n.id === id);
    if (node) {
      node.status = 'deleted';
      this.nodes = this.nodes.filter(n => n.id !== id);
    }
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    this._scheduleSave();
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  CONFLICT DETECTION
  // ════════════════════════════════════════════════════════════════════════════════
  async _checkConflictsAsync(newNode) {
    // Find candidates — same type, word overlap > 0.3
    const candidates = this.nodes.filter(n =>
      n.id !== newNode.id &&
      n.status === 'active' &&
      n.type === newNode.type &&
      this._wordOverlap(n.content, newNode.content) > 0.3
    );
    if (!candidates.length) return;

    // Quick heuristic: if the candidate says one thing and new says opposite
    const OPPOSITION_PAIRS = [
      ['prefer dark', 'prefer light'], ['dark mode', 'light mode'],
      ['love', 'hate'], ['like', 'dislike'], ['use windows', 'use mac'],
      ['use mac', 'use linux'], ['working on', 'finished'],
    ];
    for (const candidate of candidates) {
      for (const [a, b] of OPPOSITION_PAIRS) {
        const cn = candidate.content.toLowerCase();
        const nn = newNode.content.toLowerCase();
        if ((cn.includes(a) && nn.includes(b)) || (cn.includes(b) && nn.includes(a))) {
          this._archiveNode(candidate, newNode.id, 'contradiction_heuristic');
          this._log(`Conflict resolved: "${candidate.content}" → archived, superseded by "${newNode.content}"`);
          return;
        }
      }
    }

    // If we have AI configured, do a smarter check for high-confidence conflicts
    if (window.hexAI && window.hexAI.config && candidates.length > 0 && candidates[0].confidence > 0.6) {
      this._llmConflictCheck(newNode, candidates[0]).catch(() => { });
    }
  }

  async _llmConflictCheck(newNode, candidate) {
    try {
      const result = await this._quickLLMCall(
        'Answer with exactly one word: CONFLICT, SUPERSEDES, SAME, or UNRELATED.\n' +
        'Fact A: ' + candidate.content + '\n' +
        'Fact B: ' + newNode.content + '\n' +
        'Are these facts conflicting (CONFLICT), does B replace A (SUPERSEDES), are they the same fact (SAME), or unrelated (UNRELATED)?'
      );
      const verdict = (result || '').trim().toUpperCase();
      if (verdict.includes('CONFLICT') || verdict.includes('SUPERSEDES')) {
        this._archiveNode(candidate, newNode.id, 'llm_conflict_check');
        this._createEdge(newNode.id, candidate.id, 'supersedes');
        this._log(`LLM conflict: "${candidate.content.substring(0, 60)}" archived`);
      }
    } catch (_) { }
  }

  _archiveNode(node, supersededById, reason) {
    node.status = 'archived';
    node.archived_at = Date.now();
    node.archived_by = supersededById;
    node.archive_reason = reason;
    this._scheduleSave();
  }

  _createEdge(fromId, toId, type) {
    // Avoid duplicates
    if (this.edges.find(e => e.from === fromId && e.to === toId && e.type === type)) return;
    this.edges.push({ id: this._uid(), from: fromId, to: toId, type, created_at: Date.now() });
    this._scheduleSave();
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  TIERED EVICTION
  // ════════════════════════════════════════════════════════════════════════════════
  _classifyTier(node) {
    if (this.PROTECTED_TYPES.has(node.type)) return 0;           // always protected
    if ((node.mention_count || 0) > 20) return 0;               // heavily referenced
    if (node.confidence > 0.7 && (node.mention_count || 0) > 5) return 1;  // high
    if (node.confidence >= 0.4) return 2;                        // active
    return 3;                                                     // weak
  }

  _evictIfNeeded() {
    const active = this.nodes.filter(n => n.status === 'active');
    if (active.length <= this.FACT_CAP) return;

    // Only evict weak (tier 3) and active (tier 2) nodes
    const candidates = active
      .filter(n => n.tier >= 2)
      .map(n => ({
        node: n,
        score: this._evictionScore(n)
      }))
      .sort((a, b) => b.score - a.score);

    const toEvict = candidates.slice(0, active.length - this.FACT_CAP + 20);
    for (const { node } of toEvict) {
      node.status = 'evicted';
      node.evicted_at = Date.now();
    }
    if (toEvict.length) this._log(`Evicted ${toEvict.length} weak facts.`);
  }

  _evictionScore(node) {
    const agedays = (Date.now() - (node.created_at || 0)) / 86400000;
    const recencyBoost = 1 + Math.log(1 + agedays / 30);
    const mentionWeight = Math.min(1, (node.mention_count || 0) / 20);
    return (1 - node.confidence) * recencyBoost * (1 - mentionWeight);
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  ASYNC LLM EXTRACTION ENGINE
  // ════════════════════════════════════════════════════════════════════════════════
  async extractFromExchange(userMsg, aiReply) {
    userMsg = (userMsg || '').trim();
    aiReply = (aiReply || '').trim();

    // Update working memory mood
    this.working.mood = this._detectMood(userMsg);
    this.working.messageCount++;

    // Legacy keyword extraction (fast, no LLM needed)
    this._extractKeywords(userMsg);

    // Async LLM extraction — runs after response sent, non-blocking
    if (this.EXTRACTION_ENABLED && window.hexAI?.config?.llm?.provider &&
      window.hexAI.config.llm.provider !== 'none' && !this._extracting) {
      this._extractWithLLM(userMsg, aiReply).catch(e =>
        this._log('Extraction error: ' + (e?.message || ''))
      );
    }

    // Auto-compress session every N turns (non-blocking)
    this.maybeAutoCompress().catch(() => { });

    this._scheduleSave();
  }

  _extractKeywords(userMsg) {
    const msg = userMsg || '';

    // ── Identity ───────────────────────────────────────────────────────────
    const nameM = msg.match(/(?:my name is|i'm|call me|i am)\s+([A-ZА-Я][a-zа-я]{2,20})/i);
    if (nameM) this.addNode('user', "User's name is " + nameM[1], 0.95);

    // ── OS & platform ──────────────────────────────────────────────────────
    const osM = msg.match(/\b(windows\s*1[01]|windows|macos|mac\s*os|linux|ubuntu|debian|arch)\b/i);
    if (osM) this.addNode('system', 'Uses ' + osM[0] + ' OS', 0.9);

    // ── Preferred apps ─────────────────────────────────────────────────────
    const appPrefM = msg.match(/(?:i (?:use|prefer|always use|love|open))\s+([\w\s]{3,30}?)(?:\s+(?:for|as|to|instead)|\.|,|$)/i);
    if (appPrefM) this.addNode('app_preference', 'Prefers ' + appPrefM[1].trim(), 0.7);

    const browserM = msg.match(/\b(chrome|firefox|brave|edge|safari|opera)\b/i);
    if (browserM) this.addNode('app_preference', 'Uses ' + browserM[1] + ' browser', 0.75, { implicit: true });

    const editorM = msg.match(/\b(vscode|vs code|visual studio code|neovim|vim|nvim|sublime|cursor|jetbrains|rider|pycharm|webstorm|intellij)\b/i);
    if (editorM) this.addNode('app_preference', 'Uses ' + editorM[1] + ' as code editor', 0.8, { implicit: true });

    // ── File paths & folders ───────────────────────────────────────────────
    const pathM = msg.match(/([A-Z]:\\[\w\\. -]{5,60})/gi);
    if (pathM) {
      for (const p of pathM.slice(0, 3)) {
        this.addNode('folder', 'Uses path: ' + p.trim(), 0.65, { implicit: true });
      }
    }

    // ── Project context ────────────────────────────────────────────────────
    const projM = msg.match(/(?:working on|my project|my app|building|developing)\s+(.{5,60})/i);
    if (projM) this.addNode('task', 'Working on: ' + projM[1].trim(), 0.8);

    // ── Language preferences (explicit) ────────────────────────────────────
    if (/i (love|like|prefer|enjoy|hate|dislike|don.t like)\s+(.{3,60})/i.test(msg)) {
      const m = msg.match(/i (love|like|prefer|enjoy|hate|dislike|don.t like)\s+(.{3,60})/i);
      if (m) this.addNode('preference', msg.substring(0, 120).trim(), 0.65);
    }

    // ── Programming languages (implicit from mention) ──────────────────────
    const langM = msg.match(/\b(python|javascript|typescript|rust|go|golang|java|c\+\+|c#|ruby|swift|kotlin|php)\b/i);
    if (langM) this.addNode('skill', 'Works with ' + langM[1], 0.7, { implicit: true });

    // ── Workflow signals ───────────────────────────────────────────────────
    if (/\bgit\b/i.test(msg)) this.addNode('workflow', 'Uses Git for version control', 0.7, { implicit: true });
    if (/\bdocker\b/i.test(msg)) this.addNode('workflow', 'Uses Docker containers', 0.7, { implicit: true });
    if (/\bnpm\b|\byarn\b|\bpnpm\b/i.test(msg)) this.addNode('workflow', 'Works with Node.js/npm', 0.7, { implicit: true });
    if (/\bwsl\b/i.test(msg)) this.addNode('workflow', 'Uses WSL (Windows Subsystem for Linux)', 0.8, { implicit: true });
    if (/\bvpn\b/i.test(msg)) this.addNode('workflow', 'Uses a VPN', 0.6, { implicit: true });

    // ── Gaming signals ─────────────────────────────────────────────────────
    if (/\bsteam\b/i.test(msg)) this.addNode('app_preference', 'Has Steam installed', 0.9, { implicit: true });
    if (/\bepic\b|\bepic games\b/i.test(msg)) this.addNode('app_preference', 'Has Epic Games installed', 0.85, { implicit: true });

    // ── Active time patterns ───────────────────────────────────────────────
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 4) this.addNode('habit', 'Often active late at night', 0.4, { implicit: true });
    if (hour >= 6 && hour <= 9) this.addNode('habit', 'Often active in the morning', 0.4, { implicit: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTION OUTCOME RECORDING — HEX learns from success and failure
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call this after an action is executed to record its outcome.
   * @param {string} actionTag  e.g. 'open_app:spotify'
   * @param {boolean} success   true if the action worked
   * @param {string} [detail]   optional detail (error message, result summary)
   */
  recordActionOutcome(actionTag, success, detail = '') {
    const type = 'action_outcome';
    if (success) {
      // Reinforce: this action works on this PC
      this.addNode(type, 'Action succeeds: ' + actionTag, 0.85, { implicit: true });
    } else {
      // Record failure so HEX can warn next time
      const msg = 'Action failed: ' + actionTag + (detail ? ' (' + detail.substring(0, 80) + ')' : '');
      this.addNode(type, msg, 0.8, { implicit: false });
      this._log('Recorded action failure: ' + actionTag);
    }
  }

  /**
   * Call this when a user explicitly corrects HEX.
   * @param {string} wrongAssumption  what HEX got wrong
   * @param {string} correction       what the user said is correct
   */
  learnFromCorrection(wrongAssumption, correction) {
    if (!wrongAssumption || !correction) return;
    // Archive the wrong assumption if it exists as a node
    const badNode = this.nodes.find(n =>
      n.status === 'active' &&
      this._wordOverlap(n.content, wrongAssumption) > 0.5
    );
    if (badNode) {
      this._archiveNode(badNode, 'correction', 'user_correction');
      this._log('Archived wrong node after correction: ' + badNode.content.substring(0, 60));
    }
    // Store the correct fact at high confidence
    this.addNode('preference', correction.substring(0, 200), 0.9);
    this._log('Learned from correction: ' + correction.substring(0, 60));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  AUTO-COMPRESSION — triggers automatically after N turns
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Call this after each exchange. Auto-compresses every AUTO_COMPRESS_EVERY turns.
   */
  async maybeAutoCompress() {
    const AUTO_COMPRESS_EVERY = 30; // turns
    if (this.history.length > 0 && this.history.length % AUTO_COMPRESS_EVERY === 0) {
      this._log('Auto-compressing session at ' + this.history.length + ' turns...');
      try {
        await this.compressCurrentSession();
      } catch (e) {
        this._log('Auto-compress error: ' + (e?.message || ''));
      }
    }
  }

  async _extractWithLLM(userMsg, aiReply) {
    if (this._extracting) return;
    this._extracting = true;
    try {
      const extractPrompt = `You are a memory extraction engine for HEX, a personal PC assistant AI.
Analyze ONLY the user message below and extract durable facts about THIS SPECIFIC USER and their PC setup.

USER MESSAGE: "${userMsg.substring(0, 400)}"

Return ONLY valid JSON, no other text:
{
  "facts": [
    {
      "type": "user|preference|habit|task|system|skill|app_preference|folder|workflow|action_outcome|belief",
      "content": "clear fact in third person starting with 'User' (e.g. 'User prefers Brave browser')",
      "confidence": 0.0-1.0,
      "implicit": true or false,
      "temporal": "current|past|future|unknown"
    }
  ],
  "working": {
    "currentTask": "brief description of what user is doing right now, or null",
    "mood": "neutral|focused|frustrated|exploratory"
  },
  "nothing": true or false
}

Type guide:
- user           : name, identity, personal info
- preference     : likes/dislikes, opinions
- habit          : recurring behavior or time pattern
- task           : current project or ongoing work
- system         : OS, hardware, PC configuration
- skill          : programming languages, tools, expertise areas
- app_preference : preferred apps, browsers, editors, games
- folder         : file paths, working directories, project locations
- workflow       : dev tools, processes, methodologies they follow
- action_outcome : whether a specific action or app worked or failed
- belief         : strongly held opinions or values

Rules:
- Extract ONLY facts about this user and their specific PC setup
- Set implicit=true when inferred, not explicitly stated
- Be conservative: prefer confidence 0.5-0.7 for implicit facts, 0.8-0.95 for explicit
- Return nothing=true if the message contains no extractable user facts
- Maximum 5 facts per message
- Prefer specific facts over vague ones`;

      const raw = await this._quickLLMCall(extractPrompt);
      if (!raw) return;

      // Parse JSON response
      let parsed;
      try {
        const clean = raw.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        parsed = JSON.parse(clean);
      } catch (_) {
        // Try to extract JSON from response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;
        try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { return; }
      }

      if (parsed.nothing || !parsed.facts?.length) return;

      for (const fact of parsed.facts) {
        if (!fact.content || fact.content.length < 5) continue;
        this.addNode(fact.type || 'general', fact.content, fact.confidence || 0.6, {
          implicit: fact.implicit || false,
          temporal: fact.temporal || 'current',
        });
      }

      if (parsed.working) {
        if (parsed.working.currentTask) this.working.currentTask = parsed.working.currentTask;
        if (parsed.working.mood) this.working.mood = parsed.working.mood;
      }

    } finally {
      this._extracting = false;
    }
  }

  // Minimal single-turn LLM call — reuses existing AI config
  async _quickLLMCall(prompt) {
    if (!window.hexAI?.config) return null;
    const cfg = window.hexAI.config.llm;
    const prov = cfg?.provider;
    if (!prov || prov === 'none') return null;

    const msgs = [{ role: 'user', content: prompt }];

    try {
      if (prov === 'ollama') {
        const res = await fetch((cfg.baseUrl || 'http://localhost:11434') + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model || 'llama3', messages: msgs, stream: false, options: { temperature: 0.1, num_predict: 400 } })
        });
        if (!res.ok) return null;
        return (await res.json())?.message?.content || null;
      }
      if (prov === 'openai' || prov === 'grok' || prov === 'groq' || prov === 'mistral' || prov === 'together' || prov === 'openrouter') {
        const urls = { openai: 'https://api.openai.com/v1', grok: 'https://api.x.ai/v1', groq: 'https://api.groq.com/openai/v1', mistral: 'https://api.mistral.ai/v1', together: 'https://api.together.xyz/v1', openrouter: 'https://openrouter.ai/api/v1' };
        const url = (urls[prov] || urls.openai) + '/chat/completions';
        const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey };
        if (prov === 'openrouter') { hdrs['HTTP-Referer'] = 'https://softcurse-hex.local'; hdrs['X-Title'] = 'HEX-Memory'; }
        const model = prov === 'groq' ? (cfg.model || 'llama-3.1-8b-instant') : (cfg.model || 'gpt-4o-mini');
        const res = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify({ model, messages: msgs, max_tokens: 400, temperature: 0.1 }) });
        if (!res.ok) return null;
        return (await res.json())?.choices?.[0]?.message?.content || null;
      }
      if (prov === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: cfg.model || 'claude-haiku-4-5-20251001', max_tokens: 400, messages: msgs })
        });
        if (!res.ok) return null;
        return (await res.json())?.content?.[0]?.text || null;
      }
      if (prov === 'gemini') {
        const model = cfg.model || 'gemini-2.0-flash';
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + cfg.apiKey;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 400, temperature: 0.1 } }) });
        if (!res.ok) return null;
        return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    } catch (_) { }
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  EPISODIC SESSION COMPRESSION
  // ════════════════════════════════════════════════════════════════════════════════
  async compressCurrentSession() {
    const recentTurns = this.history.slice(-40);
    if (recentTurns.length < 4) return;

    const transcript = recentTurns.map(t =>
      (t.role === 'user' ? 'User: ' : 'HEX: ') + (t.content || '').substring(0, 200)
    ).join('\n');

    const summary = await this._quickLLMCall(
      'Summarize this conversation in 3-5 sentences. Focus on: what the user was working on, any problems encountered, outcomes or decisions made, and anything learned about the user.\n\n' + transcript.substring(0, 3000)
    );

    if (!summary) return;

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
  _updateSelfKnowledge() {
    const activeNodes = this.nodes.filter(n => n.status === 'active');
    const byType = {};
    for (const n of activeNodes) {
      if (!byType[n.type]) byType[n.type] = [];
      byType[n.type].push(n);
    }

    const known_well = Object.entries(byType).filter(([, v]) => v.length >= 3).map(([k]) => k);
    const known_partially = Object.entries(byType).filter(([, v]) => v.length >= 1 && v.length < 3).map(([k]) => k);
    const recent_changes = this.nodes
      .filter(n => Date.now() - n.last_confirmed_at < 7 * 86400000 && n.status === 'active')
      .slice(-5)
      .map(n => n.content.substring(0, 60));

    this.selfKnowledge = {
      total_nodes: activeNodes.length,
      known_well,
      known_partially,
      recent_changes,
      oldest_fact_date: activeNodes.reduce((min, n) => Math.min(min, n.created_at || Date.now()), Date.now()),
      session_count: this.episodes.length,
      last_updated: Date.now(),
    };
  }

  getHealthReport() {
    this._updateSelfKnowledge();
    const sk = this.selfKnowledge;
    if (!sk) return 'No memory data yet.';
    const lines = [
      'Facts stored: ' + sk.total_nodes,
      'Know well: ' + (sk.known_well.join(', ') || 'none yet'),
      'Know partially: ' + (sk.known_partially.join(', ') || 'none'),
      'Sessions remembered: ' + sk.session_count,
    ];
    if (sk.recent_changes.length) lines.push('Recent additions: ' + sk.recent_changes.slice(0, 3).join('; '));
    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  HYBRID RETRIEVAL — relevance-scored context injection
  // ════════════════════════════════════════════════════════════════════════════════
  getContext(currentMessage) {
    const parts = [];
    const activeNodes = this.nodes.filter(n => n.status === 'active');

    // 1. Working memory — highest priority, always injected
    const wm = this.working;
    const wmLines = [];
    if (wm.currentTask) wmLines.push('Current task: ' + wm.currentTask);
    if (wm.currentEntities.length) wmLines.push('Active entities: ' + wm.currentEntities.join(', '));
    if (wm.sessionPreferences.length) wmLines.push('Session preferences: ' + wm.sessionPreferences.join(', '));
    if (wm.mood && wm.mood !== 'neutral') wmLines.push('Mood this session: ' + wm.mood);
    if (wm.hypotheses.length) {
      const hyp = wm.hypotheses.slice(0, 2).map(h => h.belief + ' (' + Math.round(h.confidence * 100) + '%)');
      wmLines.push('Working hypotheses: ' + hyp.join('; '));
    }
    if (wmLines.length) parts.push('[SESSION CONTEXT]\n' + wmLines.join('\n'));

    // 2. Relevant facts — grouped by type for cleaner prompt structure
    if (activeNodes.length > 0) {
      const scored = activeNodes.map(n => ({
        node: n,
        score: this._relevanceScore(n, currentMessage || '')
      })).sort((a, b) => b.score - a.score).slice(0, 24);

      // Group by type
      const groups = {};
      for (const { node } of scored) {
        const t = node.type || 'general';
        if (!groups[t]) groups[t] = [];
        const conf = node.confidence;
        const qual = conf > 0.8 ? '' : conf > 0.5 ? ' (likely)' : ' (uncertain)';
        groups[t].push(node.content + qual);
      }

      // Emit in priority order
      const typeOrder = ['user', 'system', 'app_preference', 'folder', 'workflow', 'skill', 'preference', 'habit', 'task', 'action_outcome', 'belief', 'general'];
      const factLines = [];
      for (const t of typeOrder) {
        if (groups[t]) factLines.push(...groups[t].map(c => '[' + t + '] ' + c));
      }
      // Any remaining types not in the order list
      for (const t of Object.keys(groups)) {
        if (!typeOrder.includes(t)) factLines.push(...groups[t].map(c => '[' + t + '] ' + c));
      }

      if (factLines.length) parts.push('[KNOWN FACTS ABOUT USER]\n' + factLines.join('\n'));
    }

    // 3. Failed actions — surface these prominently so HEX doesn't repeat mistakes
    const failures = activeNodes.filter(n => n.type === 'action_outcome' && n.content.startsWith('Action failed:'));
    if (failures.length) {
      parts.push('[KNOWN FAILURES — avoid repeating]\n' + failures.map(n => n.content).join('\n'));
    }

    // 4. Relevant episodic recall
    if (currentMessage && this.episodes.length > 0) {
      const relevantEpisode = this._findRelevantEpisode(currentMessage);
      if (relevantEpisode) {
        parts.push('[RELEVANT PAST SESSION]\n' + relevantEpisode.summary);
      }
    }

    // 5. Legacy summary fallback
    if (this.summary) {
      parts.push('[CONVERSATION SUMMARY]\n' + this.summary);
    }

    return parts.join('\n\n');
  }

  _relevanceScore(node, message) {
    const msg = message.toLowerCase();
    const cont = node.content.toLowerCase();

    // Word overlap with current message
    const msgWords = new Set(msg.split(/\W+/).filter(w => w.length > 3));
    const contWords = new Set(cont.split(/\W+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of contWords) if (msgWords.has(w)) overlap++;
    const textScore = msgWords.size ? overlap / msgWords.size : 0;

    // Recency score (0-1, recent = higher)
    const ageDays = (Date.now() - (node.last_confirmed_at || node.created_at || 0)) / 86400000;
    const recency = Math.max(0, 1 - ageDays / 180);

    // Mention weight
    const mention = Math.min(1, (node.mention_count || 0) / 10);

    // Tier bonus — protected facts always surface
    const tierBonus = node.tier === 0 ? 0.3 : node.tier === 1 ? 0.1 : 0;

    return (0.5 * textScore) + (0.25 * recency) + (0.15 * node.confidence) + (0.1 * mention) + tierBonus;
  }

  _findRelevantEpisode(message) {
    if (!this.episodes.length) return null;
    const msgWords = new Set(message.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    let best = null, bestScore = 0;
    for (const ep of this.episodes.slice(-20)) {
      const epWords = new Set((ep.summary + ' ' + ep.topics.join(' ')).toLowerCase().split(/\W+/).filter(w => w.length > 3));
      let overlap = 0;
      for (const w of epWords) if (msgWords.has(w)) overlap++;
      const score = epWords.size ? overlap / epWords.size : 0;
      if (score > bestScore && score > 0.15) { bestScore = score; best = ep; }
    }
    return best;
  }

  // ════════════════════════════════════════════════════════════════════════════════
  //  CONVERSATION HISTORY
  // ════════════════════════════════════════════════════════════════════════════════
  addTurn(role, content) {
    this.history.push({ role, content: (content || '').substring(0, 600), ts: Date.now() });
    if (this.history.length > this.MAX_HISTORY_KEEP * 2) {
      this.history = this.history.slice(-this.MAX_HISTORY_KEEP);
    }
    this._scheduleSave();
  }

  getRecentHistory(n = 20) {
    return this.history.slice(-n).map(t => ({ role: t.role || 'user', content: t.content || '' }));
  }

  clearFacts() { this.nodes = this.edges = this.clusters = []; this._scheduleSave(); }
  clearHistory() { this.history = []; this.summary = ''; this._scheduleSave(); }
  clearAll() { this.nodes = this.edges = this.clusters = this.episodes = []; this.history = []; this.summary = ''; this.selfKnowledge = null; this._scheduleSave(); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════════════════════════
  _findSimilarNode(type, content) {
    let best = null, bestScore = 0;
    for (const n of this.nodes) {
      if (n.status !== 'active' || n.type !== type) continue;
      const score = this._wordOverlap(n.content, content);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best && bestScore > 0.75 ? { node: best, score: bestScore } : null;
  }

  _wordOverlap(a, b) {
    const wa = new Set((a || '').toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const wb = new Set((b || '').toLowerCase().split(/\W+/).filter(w => w.length > 3));
    if (!wa.size || !wb.size) return 0;
    let overlap = 0;
    for (const w of wa) if (wb.has(w)) overlap++;
    return overlap / Math.max(wa.size, wb.size);
  }

  _uid() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  _log(msg) { this.onLog?.(msg); }

  // ════════════════════════════════════════════════════════════════════════════════
  //  STATS FOR UI
  // ════════════════════════════════════════════════════════════════════════════════
  getStats() {
    const active = this.nodes.filter(n => n.status === 'active');
    const archived = this.nodes.filter(n => n.status === 'archived');
    const byTier = [0, 1, 2, 3].map(t => active.filter(n => n.tier === t).length);
    this._updateSelfKnowledge();
    return {
      facts: active.length,
      archived: archived.length,
      turns: this.history.length,
      sessions: this.episodes.length,
      edges: this.edges.length,
      summary: !!this.summary,
      tierCounts: { protected: byTier[0], high: byTier[1], active: byTier[2], weak: byTier[3] },
      oldestTurn: this.history[0] ? new Date(this.history[0].ts).toLocaleDateString() : null,
      workingMemory: this.working,
      selfKnowledge: this.selfKnowledge,
    };
  }

  // For memory tab — expose active nodes grouped by type
  get facts() {
    return this.nodes
      .filter(n => n.status === 'active')
      .map(n => ({ ...n, category: n.type }));  // alias for legacy UI code
  }
}

window.hexMemory = new HexMemory();