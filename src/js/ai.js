'use strict';
// ── HexAI: LLM conversation engine ───────────────────────────────────────────
// Providers: Ollama · OpenAI · Anthropic · Google Gemini · Grok (xAI)
//            OpenRouter · Mistral · Cohere · Together AI · Groq

class HexAI {
  constructor() {
    this.config = null;
    this.history = [];
    this.MAX_HISTORY = 20;
    // Complexity-aware routing: fast models for simple queries
    this.FAST_MODELS = {
      ollama: 'qwen2.5:7b',  // default local model (overridden by user config)
      openai: 'gpt-4o-mini',
      anthropic: 'claude-haiku-4-5-20251001',
      gemini: 'gemini-2.0-flash-lite',
      grok: 'grok-3-mini-fast',
      openrouter: 'meta-llama/llama-3-8b-instruct',
      mistral: 'mistral-small-latest',
      groq: 'llama-3.1-8b-instant',
      together: 'meta-llama/Llama-3-8b-chat-hf',
      cohere: 'command-light',
      hf: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    };
    this.COMPLEXITY_THRESHOLD = 0.4;  // below this → use fast model
  }

  configure(config) { this.config = config; }

  // ── System prompt ─────────────────────────────────────────
  _systemPrompt(state, lang) {
    return window.buildHexSystemPrompt(state, lang, window._lastUserMsg || '');
  }

  _trim() {
    if (this.history.length > this.MAX_HISTORY * 2)
      this.history = this.history.slice(-this.MAX_HISTORY * 2);
  }

  // ── Main chat entry ───────────────────────────────────────
  async chat(userMsg, systemState, lang = 'ka', visionData = null, maxTokens = 800) {
    this._maxTokens = maxTokens;
    window._lastUserMsg = userMsg;
    // Use persistent memory history if available
    if (window.hexMemory) {
      window.hexTaskBus?.push('Saving user message to memory...');
      window.hexMemory.addTurn('user', userMsg);
      // Update working memory mood immediately (before LLM call)
      window.hexMemory.working.mood = window.hexMemory._detectMood(userMsg);
      this.history = window.hexMemory.getRecentHistory(20);
    } else {
      this.history.push({ role: 'user', content: userMsg });
      this._trim();
    }

    window.hexTaskBus?.push('Building system prompt...');
    const sysPrompt = this._systemPrompt(systemState, lang);
    let text;

    try {
      const p = this.config && this.config.llm ? this.config.llm.provider : 'none';
      const origKey = this.config?.llm?.apiKey;
      const origModel = this.config?.llm?.model;

      // ── Complexity-aware routing ─────────────────────────────
      const complexity = this._scoreComplexity(userMsg);
      if (complexity < this.COMPLEXITY_THRESHOLD && this.FAST_MODELS[p] && this.config?.llm?.model) {
        const fast = this.FAST_MODELS[p];
        if (fast !== this.config.llm.model) {
          this.config.llm.model = fast;
          window.hexTaskBus?.push(`Simple query (${(complexity * 100).toFixed(0)}%) → fast model: ${fast}`);
        }
      }
      window.hexTaskBus?.push(`Querying ${p} model...`);

      let routeProvider = p;
      const fallbackKey = this.config?.llm?.visionApiKey;
      if (visionData && p === 'ollama' && fallbackKey) {
        routeProvider = 'gemini';
        window.hexTaskBus?.push('Delegating visual payload to Gemini Vision API...');
      }

      // ── Multi-Provider Auto Fallback Queue (PHASE 13) ───────────────
      // Fetch the LIVE valid keys mapped by the background hunter script
      const liveKeysFallbackRes = await window.hexAPI.getLiveKeys();
      const liveKeys = liveKeysFallbackRes.success ? liveKeysFallbackRes.keys : {};

      // Strict cascade order per Phase 13 requirements:
      const PRIORITY = ['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate'];

      // Smart fallback: if the user's chosen provider has no live key AND isn't local (ollama),
      // auto-route to the first provider in the cascade that HAS keys.
      const providerQueue = [];

      // Check if user's selected provider has a live key or is local
      const selectedHasKey = routeProvider === 'ollama' || (liveKeys[routeProvider] && liveKeys[routeProvider].length > 0);

      if (selectedHasKey) {
        providerQueue.push(routeProvider);
      } else if (routeProvider !== 'none') {
        window.hexTaskBus?.push(`No key for ${routeProvider}. Smart fallback activating...`);
      }

      // Build the backup pipeline by picking the highest priority providers that HAVE known valid keys
      for (const pri of PRIORITY) {
        if (!providerQueue.includes(pri) && liveKeys[pri] && liveKeys[pri].length > 0) {
          providerQueue.push(pri);
        }
      }

      // If queue is completely empty, still try ollama as last resort
      if (providerQueue.length === 0) {
        providerQueue.push(routeProvider !== 'none' ? routeProvider : 'ollama');
      }

      let success = false;
      let lastErr = null;
      let allErrors = [];

      for (const currProvider of providerQueue) {
        // Build an array of keys to test for this provider
        let keysToTry = [];
        if (currProvider === 'ollama') {
          keysToTry = [null]; // No API key required
        } else if (liveKeys[currProvider] && liveKeys[currProvider].length > 0) {
          keysToTry = [...liveKeys[currProvider]]; // Inject ALL hunted keys
        } else if (currProvider === routeProvider && origKey) {
          keysToTry = [origKey]; // User's manual key
        } else {
          continue; // Cannot test this provider, no keys
        }

        // Exhaust every key before giving up on the provider
        for (let i = 0; i < keysToTry.length; i++) {
          const testKey = keysToTry[i];
          try {
            if (testKey) this.config.llm.apiKey = testKey;

            if (currProvider !== routeProvider) {
              window.hexTaskBus?.push(`Fallback: Auto-routing to ${currProvider}... ${keysToTry.length > 1 ? `(Key ${i + 1}/${keysToTry.length})` : ''}`);
              if (window.hexAudio && i === 0) window.hexAudio.play('reroute', 0.9);
              this.config.llm.model = this.FAST_MODELS[currProvider] || '';
            } else {
              if (keysToTry.length > 1 && i > 0) {
                window.hexTaskBus?.push(`Cycling ${currProvider} keys... (Key ${i + 1}/${keysToTry.length})`);
              } else if (!this.config.llm.model && this.FAST_MODELS[currProvider]) {
                this.config.llm.model = this.FAST_MODELS[currProvider];
              }
            }

            switch (currProvider) {
              case 'ollama': text = await this._ollama(sysPrompt, visionData); break;
              case 'openai': text = await this._openai(sysPrompt); break;
              case 'anthropic': text = await this._anthropic(sysPrompt); break;
              case 'gemini': {
                if (currProvider === 'gemini' && p === 'ollama') {
                  const tempKey = this.config.llm.apiKey;
                  this.config.llm.apiKey = fallbackKey || testKey || tempKey;
                  try { text = await this._gemini(sysPrompt, visionData, 'gemini-2.5-flash'); }
                  finally { this.config.llm.apiKey = tempKey; }
                } else {
                  text = await this._gemini(sysPrompt, visionData);
                }
                break;
              }
              case 'grok': text = await this._grok(sysPrompt); break;
              case 'openrouter': text = await this._openrouter(sysPrompt); break;
              case 'mistral': text = await this._mistral(sysPrompt); break;
              case 'groq': text = await this._groq(sysPrompt); break;
              case 'together': text = await this._together(sysPrompt); break;
              case 'cohere': text = await this._cohere(sysPrompt); break;
              case 'hf': text = await this._hf(sysPrompt); break;
              case 'replicate': text = await this._replicate(sysPrompt); break;
              default: text = this._offline(); break;
            }

            if (text && typeof text === 'string') {
              success = true;
              break; // Break inner key loop!
            }
          } catch (err) {
            lastErr = err;
            allErrors.push(`[${currProvider.toUpperCase()}] ${err.message}`);
            console.warn(`Softcurse LLM: ${currProvider} [Key ${i + 1}] failed:`, err.message);
          }
        } // end key loop

        if (success) break; // Break outer provider loop!
      }

      if (!success) {
        let msg = 'All available LLM auto-fallback providers failed. Full trace:\n' + allErrors.join('\n');
        throw new Error(msg);
      }

      // Guard: some providers return null content
      if (!text || typeof text !== 'string') text = '…';

      // Restore original config parameters
      if (this.config && this.config.llm) {
        this.config.llm.apiKey = origKey;
        this.config.llm.model = origModel;
      }
    } catch (e) {
      console.error('AI error:', e);
      text = 'Neural link disrupted: ' + (e?.message || String(e));
    }

    // Save to persistent memory
    if (window.hexMemory) {
      window.hexTaskBus?.push('Extracting facts from response...');
      window.hexMemory.addTurn('assistant', text || '');
      window.hexMemory.extractFromExchange(userMsg || '', text || '');
      this.history = window.hexMemory.getRecentHistory(20);
    } else {
      this.history.push({ role: 'assistant', content: text });
    }

    return { text, actions: this._parseActions(text) };
  }

  // ── Ollama (local) ────────────────────────────────────────
  async _ollama(system, visionData = null) {
    const baseUrl = this.config.llm.baseUrl || 'http://localhost:11434';
    const model = this.config.llm.model || 'qwen2.5:7b';

    // Inject image into the latest user message for multimodal Ollama models (llava, minicpm-v, etc.)
    const msgs = this._msgs();
    const historyParts = msgs.map((m, i) => {
      const part = { role: m.role, content: m.content };
      if (i === msgs.length - 1 && visionData) {
        const b64 = visionData.includes(',') ? visionData.split(',')[1] : visionData;
        part.images = [b64];
      }
      return part;
    });

    const res = await fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...historyParts],
        stream: false,
        options: { temperature: 0.75, num_predict: this._maxTokens || 800 }
      })
    });
    if (!res.ok) throw new Error('Ollama ' + res.status + ': ' + await res.text());
    return ((await this._safeJson(res))?.message?.content) || '…';
  }

  // ── OpenAI ────────────────────────────────────────────────
  async _openai(system) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('OpenAI ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── Anthropic ─────────────────────────────────────────────
  async _anthropic(system) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.llm.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.config.llm.model || 'claude-haiku-4-5-20251001',
        max_tokens: this._maxTokens || 800, system,
        messages: this._msgs()
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Anthropic ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).content?.[0]?.text || '…';
  }

  // ── Google Gemini ─────────────────────────────────────────
  async _gemini(system, visionData = null, overrideModel = null) {
    const rawModel = overrideModel || this.config.llm.model || '';
    let model = (rawModel && rawModel !== 'gemini') ? rawModel.trim().split(/\s+/)[0] : 'gemini-2.5-flash';
    if (model.includes('gemini-1.5')) model = 'gemini-2.5-flash'; // Avoid unsupported 1.5 versions
    const apiKey = this.config.llm.apiKey;

    // Map history and inject visionData into the very last user message if present
    const msgs = this._msgs();
    const historyParts = msgs.map((m, i) => {
      const parts = [{ text: m.content }];
      if (i === msgs.length - 1 && visionData) {
        const mimeMatch = visionData.match(/^data:(image\/\w+);base64,(.*)$/);
        if (mimeMatch) parts.push({ inlineData: { mimeType: mimeMatch[1], data: mimeMatch[2] } });
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });

    const contents = [
      { role: 'user', parts: [{ text: '[SYSTEM]\n' + system + '\n[/SYSTEM]\n\nAcknowledge briefly.' }] },
      { role: 'model', parts: [{ text: 'Understood. HEX online.' }] },
      ...historyParts
    ];

    const payload = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: this._maxTokens || 800, temperature: 0.75 } })
    };

    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, payload);
    if (!res.ok) {
      let e = await this._safeJson(res).catch(() => ({}));
      if ((res.status === 404 || res.status === 429 || res.status === 400) && model !== 'gemini-2.5-flash') {
        window.hexTaskBus?.push(`Gemini ${res.status} on ${model}. Rerouting to gemini-2.5-flash...`);
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, payload);
        if (!res.ok) e = await this._safeJson(res).catch(() => ({}));
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${e.error?.message || e.error?.status || JSON.stringify(e.error) || res.statusText}`);
    }

    const finalData = await this._safeJson(res);
    return finalData.candidates?.[0]?.content?.parts?.[0]?.text || '…';
  }

  // ── Grok (xAI) ────────────────────────────────────────────
  async _grok(system) {
    const rawModel = this.config.llm.model || '';
    const model = (rawModel && rawModel !== 'grok') ? rawModel : 'grok-3-mini';
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Grok ' + res.status + ': ' + (e.error?.message || (typeof e.error === 'string' ? e.error : null) || e.message || JSON.stringify(e))); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── OpenRouter (100+ models) ──────────────────────────────
  async _openrouter(system) {
    const rawModel = this.config.llm.model || '';
    // If model has no slash (not a real openrouter model id), use a known free default
    const model = rawModel.includes('/') ? rawModel : 'meta-llama/llama-3.1-8b-instruct:free';
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.config.llm.apiKey,
        'HTTP-Referer': 'https://softcurse-hex.local',
        'X-Title': 'Softcurse H.E.X.'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('OpenRouter ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── Mistral ───────────────────────────────────────────────
  async _mistral(system) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'mistral-small-latest',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Mistral ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── Groq (ultra-fast inference) ───────────────────────────
  async _groq(system) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Groq ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── Together AI ────────────────────────────────────────────
  async _together(system) {
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'meta-llama/Llama-3-8b-chat-hf',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Together ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await this._safeJson(res)).choices?.[0]?.message?.content || '…';
  }

  // ── Cohere ────────────────────────────────────────────────
  async _cohere(system) {
    const hist = this._msgs();
    const chatHistory = [];
    for (let i = 0; i < hist.length - 1; i++) {
      chatHistory.push({ role: hist[i].role === 'user' ? 'USER' : 'CHATBOT', message: hist[i].content });
    }
    const lastMsg = hist.length ? hist[hist.length - 1].content : '';
    const res = await fetch('https://api.cohere.com/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'command-r-plus',
        preamble: system, chat_history: chatHistory,
        message: lastMsg, max_tokens: this._maxTokens || 800, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('Cohere ' + res.status + ': ' + (e?.message || e?.detail || JSON.stringify(e))); }
    return (await this._safeJson(res)).text || '…';
  }

  // ── Hugging Face ──────────────────────────────────────────
  async _hf(system) {
    const defaultModel = 'mistralai/Mixtral-8x7B-Instruct-v0.1'; // HF free inference api default
    const res = await fetch(`https://api-inference.huggingface.co/models/${this.config.llm.model || defaultModel}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        inputs: system + '\n\n' + this.history.map(m => m.role + ': ' + m.content).join('\n') + '\n\nAssistant:',
        parameters: { max_new_tokens: this._maxTokens || 800, temperature: 0.7 }
      })
    });
    if (!res.ok) { const e = await this._safeJson(res); throw new Error('HF ' + res.status + ': ' + (e?.error?.message || (typeof e?.error === 'string' ? e.error : JSON.stringify(e)))); }
    const out = await this._safeJson(res);
    return out[0]?.generated_text || out?.generated_text || '…';
  }

  // ── Replicate ─────────────────────────────────────────────
  async _replicate(system) {
    throw new Error('Replicate API connection not yet fully implemented for synchronous single-pass fallback.');
  }

  // ── Fallback ──────────────────────────────────────────────
  _offline() {
    const pool = [
      'AI core offline. Configure an LLM in Settings to unlock full neural capacity.',
      'No model connected. Open Settings and choose a provider.',
      'Running on fallback mode. System tasks still operational.'
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Safe JSON Parser ──────────────────────────────────────
  async _safeJson(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      // Return a mocked error object with the first 200 chars of the HTML payload
      return { error: { message: text.substring(0, 200) + '... (Invalid JSON)' } };
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  _msgs() {
    const raw = this.history.map(m => ({ role: m.role, content: m.content }));

    // ── Memory Reminder Injection ──────────────────────────────
    // Small models (Llama 3.1 8B) suffer from "lost in the middle" —
    // they ignore facts buried deep in the system prompt. Injecting a
    // compact memory summary as a system message right before the user's
    // latest message ensures it lands in the model's attention window.
    const reminder = this._buildMemoryReminder();
    if (reminder) {
      // Insert right before the last user message
      const lastUserIdx = raw.length - 1;
      if (lastUserIdx >= 0 && raw[lastUserIdx].role === 'user') {
        raw.splice(lastUserIdx, 0, { role: 'system', content: reminder });
      } else {
        raw.push({ role: 'system', content: reminder });
      }
    }

    return raw;
  }

  /**
   * Build compact memory summary for injection into conversation history.
   * Only includes the most important facts — keeps token count low (~200 tokens).
   */
  _buildMemoryReminder() {
    if (!window.hexMemory) return null;
    const nodes = window.hexMemory.nodes;
    if (!nodes || !nodes.length) return null;

    const active = nodes.filter(n => n.status === 'active');
    if (!active.length) return null;

    // Pick the top facts by tier (protected first) and confidence
    const top = active
      .sort((a, b) => (a.tier - b.tier) || (b.confidence - a.confidence))
      .slice(0, 15)
      .map(n => '• ' + n.content);

    if (!top.length) return null;

    return [
      '[MEMORY RECALL — these are REAL facts YOU saved about this user]',
      ...top,
      '',
      'USE these facts when answering. NEVER say you have no memory or cannot remember.',
      'If the user asks about something listed above, answer directly from these facts.',
      'If the user says "open my website", find the URL above and use [ACTION:open_url:THE_URL].'
    ].join('\n');
  }

  _parseActions(text) {
    const actions = [];
    const re = /\[ACTION:([^\]]+)\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const inner = m[1].trim();
      const colonIdx = inner.indexOf(':');
      if (colonIdx === -1) {
        actions.push({ type: inner, args: [] });
        continue;
      }
      const type = inner.slice(0, colonIdx).trim();
      const rest = inner.slice(colonIdx + 1);
      // Args split on | for paths, otherwise on :
      let rawArgs;
      if (rest.includes('|')) {
        rawArgs = rest.split('|');
      } else if (/^https?:\/\//i.test(rest)) {
        // URL present — extract scheme://authority[/path] then split remainder
        const urlMatch = rest.match(/^(https?:\/\/[^/:]+(?::\d+)?(?:\/[^:]*)?)(:.+)?$/i);
        if (urlMatch && urlMatch[2]) {
          // Has text after the URL portion, e.g. "https://youtube.com:search query"
          rawArgs = [urlMatch[1], ...urlMatch[2].slice(1).split(':')];
        } else {
          rawArgs = [rest]; // Pure URL, no extra args
        }
      } else {
        rawArgs = rest.split(':');
      }
      // Clean each arg: trim whitespace AND trailing punctuation that bleeds from AI sentences
      const args = rawArgs.map(function (a) { return a.trim().replace(/[.!?,;]+$/, ''); });
      actions.push({ type, args });
    }
    return actions;
  }


  // ── List available models from provider API ───────────────
  // Returns array of { id, free } objects
  async fetchModels(provider, apiKey, baseUrl) {
    const headers = { 'Content-Type': 'application/json' };
    let url, transform;

    // Known free Gemini models (no billing required)
    const FREE_GEMINI = [
      'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash',
      'gemini-1.5-flash-8b', 'gemini-2.5-flash-preview-04-17'
    ];
    // Known free Grok models
    const FREE_GROK = ['grok-3-mini'];
    // Known free Mistral models
    const FREE_MISTRAL = ['mistral-small-3.1-24b-instruct', 'devstral-small-2505'];

    switch (provider) {
      case 'gemini':
        url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
        transform = d => (d.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => {
            const id = m.name.replace('models/', '');
            return { id, free: FREE_GEMINI.some(f => id.startsWith(f)) };
          });
        break;
      case 'grok':
        url = 'https://api.x.ai/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (d.data || []).map(m => ({
          id: m.id,
          free: FREE_GROK.includes(m.id) || (m.pricing && String(m.pricing.prompt) === '0')
        }));
        break;
      case 'openai':
        url = 'https://api.openai.com/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (d.data || [])
          .filter(m => m.id.startsWith('gpt'))
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(m => ({ id: m.id, free: false }));
        break;
      case 'anthropic':
        url = 'https://api.anthropic.com/v1/models';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
        transform = d => (d.data || []).map(m => ({ id: m.id, free: false }));
        break;
      case 'groq':
        url = 'https://api.groq.com/openai/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        // Groq free tier: all models free up to rate limits
        transform = d => (d.data || []).sort((a, b) => a.id.localeCompare(b.id))
          .map(m => ({ id: m.id, free: true }));
        break;
      case 'mistral':
        url = 'https://api.mistral.ai/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (d.data || []).sort((a, b) => a.id.localeCompare(b.id))
          .map(m => ({
            id: m.id,
            free: FREE_MISTRAL.some(f => m.id.includes(f))
          }));
        break;
      case 'openrouter':
        url = 'https://openrouter.ai/api/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (d.data || [])
          .map(m => ({
            id: m.id,
            free: m.id.endsWith(':free') ||
              (m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0')
          }))
          .filter(m => m.free)   // ONLY show free models by default
          .sort((a, b) => a.id.localeCompare(b.id));
        break;
      case 'together':
        url = 'https://api.together.xyz/v1/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (Array.isArray(d) ? d : (d.data || []))
          .filter(m => m.type === 'chat' || m.display_type === 'chat')
          .map(m => ({
            id: m.id,
            free: m.pricing ? (parseFloat(m.pricing.input) === 0) : false
          }))
          .sort((a, b) => a.id.localeCompare(b.id));
        break;
      case 'ollama':
        url = (baseUrl || 'http://localhost:11434') + '/api/tags';
        transform = d => (d.models || []).map(m => ({ id: m.name, free: true }));
        break;
      case 'cohere':
        url = 'https://api.cohere.com/v2/models';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => (d.models || [])
          .filter(m => m.endpoints && m.endpoints.includes('chat'))
          .map(m => ({ id: m.name, free: false }))
          .sort((a, b) => a.id.localeCompare(b.id));
        break;
      case 'hf':
        // HF Inference API — list recommended models
        url = 'https://api-inference.huggingface.co/framework/text-generation-inference';
        headers['Authorization'] = 'Bearer ' + apiKey;
        transform = d => {
          // HF returns an array of model objects
          if (Array.isArray(d)) return d.map(m => ({ id: m.id || m.modelId || m, free: true })).slice(0, 50);
          return [
            { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', free: true },
            { id: 'meta-llama/Meta-Llama-3-8B-Instruct', free: true },
            { id: 'microsoft/Phi-3-mini-4k-instruct', free: true },
            { id: 'google/gemma-2-2b-it', free: true },
          ];
        };
        break;
      default:
        throw new Error('Model listing not supported for provider: ' + provider);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
    return transform(await this._safeJson(res));
  }

  clearHistory() {
    this.history = [];
    if (window.hexMemory) window.hexMemory.clearHistory();
  }

  // ── Complexity scorer (0.0 = trivial, 1.0 = very complex) ──
  _scoreComplexity(msg) {
    if (!msg) return 0;
    const m = msg.toLowerCase().trim();
    const words = m.split(/\s+/);
    let score = 0;

    // Length factor (0-0.3)
    score += Math.min(0.3, words.length / 50);

    // Simple query indicators (reduce score)
    const SIMPLE = /^(hi|hello|hey|yo|thanks|thank you|good morning|good night|bye|ok|sup|what time|what's the time|what day)/i;
    if (SIMPLE.test(m)) return 0.1;
    if (words.length <= 3 && !m.includes('?')) return 0.15;

    // Complex query indicators (increase score)
    const COMPLEX_KEYWORDS = ['debug', 'error', 'fix', 'code', 'script', 'implement', 'build', 'create',
      'analyze', 'compare', 'explain how', 'step by step', 'architecture', 'refactor', 'optimize',
      'configure', 'install', 'deploy', 'migrate', 'automate', 'schedule', 'multi', 'workflow'];
    for (const kw of COMPLEX_KEYWORDS) {
      if (m.includes(kw)) { score += 0.15; break; }
    }

    // Question complexity
    const questionWords = (m.match(/\b(how|why|what if|could you|can you|would|explain)\b/gi) || []).length;
    score += Math.min(0.2, questionWords * 0.1);

    // Code/technical indicators
    if (/[{}<>()\[\]=;]/.test(m) || /```/.test(m)) score += 0.2;

    // Multi-step indicators
    if (/\b(then|after that|also|and then|next|finally|first|second)\b/i.test(m)) score += 0.15;

    return Math.min(1, score);
  }
}

window.hexAI = new HexAI();