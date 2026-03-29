'use strict';
// ── memory.js — Persistent long-term memory for H.E.X. ───────────────────────
//
// Two layers of memory:
//   1. FACTS    — extracted knowledge about the user, system, preferences
//   2. HISTORY  — last N conversation turns, persisted across restarts
//
// Both are stored via hexAPI.setMemory() → main process → disk (memory.json)
// and loaded on every startup via hexAPI.getMemory().

class HexMemory {
  constructor() {
    this.facts    = [];   // [{ id, category, content, ts, confidence }]
    this.history  = [];   // [{ role, content, ts }]  — full persistent log
    this.summary  = '';   // rolling summary of older conversation
    this.MAX_HISTORY_KEEP = 120;  // turns kept on disk
    this.MAX_HISTORY_INJECT = 30; // turns injected into prompt
    this.MAX_FACTS = 200;
    this._dirty   = false;
    this._saveTimer = null;
    this.onLog    = null; // fn(msg)
  }

  // ── Load from disk ────────────────────────────────────────
  async load() {
    try {
      const data = await window.hexAPI.getMemory();
      if (data) {
        this.facts   = data.facts   || [];
        this.history = data.history || [];
        this.summary = data.summary || '';
        this._log(`Memory loaded: ${this.facts.length} facts, ${this.history.length} history turns`);
      } else {
        this._log('No prior memory found. Starting fresh.');
      }
    } catch (e) {
      this._log(`Memory load failed: ${e?.message || String(e)}`);
    }
  }

  // ── Save to disk (debounced) ───────────────────────────────
  _scheduleSave() {
    this._dirty = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), 2000);
  }

  async _flush() {
    if (!this._dirty) return;
    try {
      await window.hexAPI.setMemory({
        facts:   this.facts,
        history: this.history.slice(-this.MAX_HISTORY_KEEP),
        summary: this.summary,
        savedAt: new Date().toISOString()
      });
      this._dirty = false;
    } catch (e) {
      this._log(`Memory save failed: ${e?.message || String(e)}`);
    }
  }

  async forceSave() {
    clearTimeout(this._saveTimer);
    await this._flush();
  }

  // ── Add a conversation turn ────────────────────────────────
  addTurn(role, content) {
    this.history.push({ role, content, ts: Date.now() });
    // Prune in-memory if very long, but keep full log on disk
    if (this.history.length > this.MAX_HISTORY_KEEP * 2) {
      this.history = this.history.slice(-this.MAX_HISTORY_KEEP);
    }
    this._scheduleSave();
  }

  // ── Add / update a fact ───────────────────────────────────
  // Categories: 'user', 'preference', 'system', 'habit', 'task', 'general'
  addFact(category, content, confidence = 1.0) {
    const id = `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    // Avoid near-duplicate facts in same category
    const similar = this.facts.find(f =>
      f.category === category &&
      this._similarity(f.content || '', content || '') > 0.75
    );
    if (similar) {
      // Update existing
      similar.content    = content;
      similar.ts         = Date.now();
      similar.confidence = Math.min(1, (similar.confidence + confidence) / 2 + 0.1);
    } else {
      this.facts.push({ id, category, content, ts: Date.now(), confidence });
      if (this.facts.length > this.MAX_FACTS) {
        // Evict oldest low-confidence facts
        this.facts.sort((a, b) => (b.ts * b.confidence) - (a.ts * a.confidence));
        this.facts = this.facts.slice(0, this.MAX_FACTS);
      }
    }
    this._scheduleSave();
  }

  removeFact(id) {
    this.facts = this.facts.filter(f => f.id !== id);
    this._scheduleSave();
  }

  clearFacts() { this.facts = []; this._scheduleSave(); }
  clearHistory() { this.history = []; this.summary = ''; this._scheduleSave(); }
  clearAll() { this.facts = []; this.history = []; this.summary = ''; this._scheduleSave(); }

  // ── Build context string for system prompt injection ──────
  getContext() {
    const parts = [];

    // Summary of older chats
    if (this.summary) {
      parts.push(`CONVERSATION SUMMARY (older sessions):\n${this.summary}`);
    }

    // Facts grouped by category
    if (this.facts.length > 0) {
      const byCategory = {};
      for (const f of this.facts) {
        if (!byCategory[f.category]) byCategory[f.category] = [];
        byCategory[f.category].push(f.content);
      }
      const factLines = [];
      for (const [cat, items] of Object.entries(byCategory)) {
        factLines.push(`[${cat.toUpperCase()}] ${items.slice(0, 8).join(' | ')}`);
      }
      parts.push(`KNOWN FACTS ABOUT USER & SYSTEM:\n${factLines.join('\n')}`);
    }

    // Recent history (last N turns for context window)
    const recent = this.history.slice(-this.MAX_HISTORY_INJECT);
    if (recent.length > 0) {
      const lines = recent.map(t => {
        const who  = t.role === 'user' ? 'USER' : 'HEX';
        const when = new Date(t.ts).toLocaleString();
        return `[${when}] ${who}: ${(t.content || '').substring(0, 300)}`;
      });
      parts.push(`RECENT CONVERSATION HISTORY:\n${lines.join('\n')}`);
    }

    return parts.join('\n\n');
  }

  // Recent turns for AI history array (role/content only)
  getRecentHistory(n = 20) {
    return this.history
      .slice(-n)
      .map(t => ({ role: t.role || 'user', content: t.content || '' }));
  }

  // ── Extract facts from an AI response ────────────────────
  // Called after each reply — looks for learnable info
  extractFromExchange(userMsg, aiReply) {
    userMsg  = userMsg  || '';
    aiReply  = aiReply  || '';
    const combined = userMsg + ' ' + aiReply;

    // Name extraction
    const nameMatch = userMsg.match(/(?:my name is|i'm|call me|i am)\s+([A-ZА-Я][a-zа-я]{2,20})/i);
    if (nameMatch) this.addFact('user', `User's name is ${nameMatch[1]}`, 0.9);

    // Preference signals
    if (/i (love|like|prefer|enjoy|hate|dislike|don't like)/i.test(userMsg)) {
      this.addFact('preference', (userMsg || '').substring(0, 120).trim(), 0.7);
    }

    // Time-of-day habit
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 4) this.addFact('habit', 'User often works late at night', 0.5);
    if (hour >= 6  && hour <= 9) this.addFact('habit', 'User works in the morning', 0.5);

    // Task completions
    if (/reminder|remind me|set timer/i.test(userMsg)) {
      this.addFact('habit', `User set a reminder: ${(userMsg || '').substring(0,80)}`, 0.6);
    }

    // Project / work mentions
    const projectMatch = userMsg.match(/(?:working on|my project|my app|building|developing)\s+(.{5,60})/i);
    if (projectMatch) this.addFact('task', `Working on: ${projectMatch[1].trim()}`, 0.8);

    // OS/system mentions
    if (/windows|mac|linux|ubuntu/i.test(userMsg)) {
      const os = userMsg.match(/windows|mac(os)?|linux|ubuntu/i);
      if (os) this.addFact('system', `Uses ${os[0]} OS`, 0.9);
    }

    this._scheduleSave();
  }

  // ── Simple word-overlap similarity (0..1) ─────────────────
  _similarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    if (!wordsA.size || !wordsB.size) return 0;
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  _log(msg) { this.onLog?.(msg); }

  // ── Stats for UI ──────────────────────────────────────────
  getStats() {
    return {
      facts:   this.facts.length,
      turns:   this.history.length,
      summary: !!this.summary,
      oldestTurn: this.history[0] ? new Date(this.history[0].ts).toLocaleDateString() : null
    };
  }
}

window.hexMemory = new HexMemory();
