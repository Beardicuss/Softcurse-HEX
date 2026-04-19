'use strict';
// ── browser.js — Renderer-side browser interaction layer ──────────────────────
// Handles URL launching, web search dispatch, and maintains a
// short navigation history for context display in the terminal.

class HexBrowser {
  constructor() {
    this.history     = [];   // [{ url, ts, title }]
    this.MAX_HISTORY = 50;
    this.onLog       = null; // fn(source, msg)
    this.SEARCH_ENGINES = {
      google:    q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      duckduckgo:q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
      bing:      q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      youtube:   q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      github:    q => `https://github.com/search?q=${encodeURIComponent(q)}`,
    };
    this.defaultEngine = 'google';
  }

  // ── Open a URL in the system default browser ──────────────
  async open(url) {
    // Normalize URL — add https:// if no scheme
    const normalized = this._normalizeUrl(url);
    try {
      const result = await window.hexAPI.browser.open(normalized);
      if (result.success) {
        this._addHistory(normalized);
        this._log(`Opened: ${normalized}`);
      }
      return result;
    } catch (e) {
      this._log(`Failed to open ${normalized}: ${e.message}`, true);
      return { success: false, error: e.message };
    }
  }

  // ── Web search ────────────────────────────────────────────
  async search(query, engine = null) {
    const eng = engine || this.defaultEngine;
    const builder = this.SEARCH_ENGINES[eng] || this.SEARCH_ENGINES.google;
    const url = builder(query);
    this._log(`Search [${eng}]: "${query}"`);
    return this.open(url);
  }

  // ── Parse intent from natural language ───────────────────
  // Returns { type: 'url'|'search'|'none', value, engine? }
  parseIntent(text) {
    const lower = text.toLowerCase().trim();

    // Direct URL patterns
    if (/^https?:\/\//i.test(text))   return { type: 'url', value: text };
    if (/^www\./i.test(text))          return { type: 'url', value: text };
    if (/^[a-z0-9-]+\.(com|org|net|io|dev|app|co|uk|de|fr|jp|ru|ge)(\/.*)?$/i.test(text))
      return { type: 'url', value: text };

    // "open [url/site]"
    const openMatch = text.match(/open\s+(https?:\/\/\S+|www\.\S+|[a-z0-9-]+\.\S+)/i);
    if (openMatch) return { type: 'url', value: openMatch[1] };

    // "go to [url]"
    const gotoMatch = text.match(/(?:go to|navigate to|visit)\s+(\S+)/i);
    if (gotoMatch) return { type: 'url', value: gotoMatch[1] };

    // "search [engine] for [query]"
    const searchWithEngine = text.match(/search\s+(google|bing|duckduckgo|youtube|github)\s+(?:for\s+)?(.+)/i);
    if (searchWithEngine) return { type: 'search', engine: searchWithEngine[1].toLowerCase(), value: searchWithEngine[2] };

    // "search for [query]"
    const searchFor = text.match(/search\s+(?:for\s+)?(.+)/i);
    if (searchFor) return { type: 'search', value: searchFor[1] };

    // "find [query] on youtube/github/etc"
    const findOn = text.match(/find\s+(.+)\s+on\s+(google|bing|duckduckgo|youtube|github)/i);
    if (findOn) return { type: 'search', value: findOn[1], engine: findOn[2].toLowerCase() };

    return { type: 'none' };
  }

  // ── Handle a command from chat or AI ─────────────────────
  async handleCommand(text) {
    const intent = this.parseIntent(text);
    if (intent.type === 'url')    return this.open(intent.value);
    if (intent.type === 'search') return this.search(intent.value, intent.engine);
    return { success: false, notBrowser: true };
  }

  // ── Quick launchers ───────────────────────────────────────
  async openGitHub()    { return this.open('https://github.com'); }
  async openYouTube()   { return this.open('https://youtube.com'); }
  async openSettings()  { return this.open('https://settings'); } // placeholder

  // ── History ───────────────────────────────────────────────
  getHistory() { return [...this.history]; }

  clearHistory() { this.history = []; }

  // ── Internal ──────────────────────────────────────────────
  _normalizeUrl(url) {
    const s = url.trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^www\./i.test(s)) return `https://${s}`;
    // If looks like a domain
    if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
    // Otherwise treat as search
    return this.SEARCH_ENGINES[this.defaultEngine](s);
  }

  _addHistory(url) {
    this.history.unshift({ url, ts: Date.now() });
    if (this.history.length > this.MAX_HISTORY) this.history.pop();
    HexSystem.emit('browser:nav', { url });
  }

  _log(msg, isError = false) {
    if (this.onLog) this.onLog('BROWSER', msg, isError ? 'error' : 'info');
    HexSystem.emit('browser:log', { msg, isError });
  }

  // ── Available search engines list ─────────────────────────
  get engines() { return Object.keys(this.SEARCH_ENGINES); }
}

window.hexBrowser = new HexBrowser();
