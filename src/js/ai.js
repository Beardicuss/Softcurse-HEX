'use strict';
// ── HexAI: LLM conversation engine ───────────────────────────────────────────
// Providers: Ollama · OpenAI · Anthropic · Google Gemini · Grok (xAI)
//            OpenRouter · Mistral · Cohere · Together AI · Groq

class HexAI {
  constructor() {
    this.config = null;
    this.history = [];
    this.MAX_HISTORY = 20;
  }

  configure(config) { this.config = config; }

  // ── System prompt ─────────────────────────────────────────
  _systemPrompt(state, lang) {
    const langName = { en: 'English', ru: 'Russian', ka: 'Georgian' }[lang] || 'English';
    const now = new Date();

    // Active personality prompt
    const personalityPrompt = (window.hexPersonalities)
      ? window.hexPersonalities.getActivePrompt()
      : 'You are HEX — a cyberpunk AI assistant. You are witty, intelligent, slightly rebellious, and caring.';

    const personalityName = (window.hexPersonalities)
      ? window.hexPersonalities.getActiveName()
      : 'HEX — Default';

    // Long-term memory context
    const memoryCtx = (window.hexMemory) ? window.hexMemory.getContext() : '';
    const memoryBlock = memoryCtx
      ? '\n--- LONG-TERM MEMORY ---\n' + memoryCtx + '\n--- END MEMORY ---'
      : '';

    const systemStateBlock = [
      'CURRENT SYSTEM STATE:',
      '  Time: ' + now.toLocaleTimeString() + ' | Date: ' + now.toLocaleDateString(),
      '  Uptime: ' + (state.uptime || '-') + ' | CPU: ' + (state.cpu || '-') + '% | RAM: ' + (state.ram || '-') + '%',
      '  Active task: ' + (state.activeTask || 'none') + ' | Platform: ' + (state.platform || '-')
    ].join('\n');

    const actionsBlock = [
      'ACTIONS you can invoke (include in response when appropriate):',
      '',
      'SYSTEM TASKS:',
      '[ACTION:run_defrag] [ACTION:run_scan] [ACTION:clear_cache] [ACTION:open_processes]',
      '[ACTION:check_drivers] [ACTION:run_cleanup] [ACTION:run_network_diag]',
      '[ACTION:list_startup] [ACTION:check_updates] [ACTION:check_firewall] [ACTION:run_memory_diag]',
      '',
      'BUTLER / PC CONTROL (use these to interact with the PC directly):',
      '[ACTION:open_app:APP_NAME] — Open any application (e.g. notepad, chrome, calculator, vscode, spotify)',
      '[ACTION:create_file:FILENAME:CONTENT] — Create a text file on Desktop',
      '[ACTION:create_doc:FILENAME:CONTENT] — Create a Word document on Desktop',
      '[ACTION:open_folder:PATH_OR_ALIAS] — Open a folder (aliases: desktop, documents, downloads, pictures, music, videos, home)',
      '[ACTION:open_file:FILEPATH] — Open a file with its default application',
      '[ACTION:empty_trash] — Empty the Recycle Bin (asks user confirmation)',
      '[ACTION:lock_screen] — Lock the workstation',
      '[ACTION:shutdown] — Shut down the computer (asks user confirmation)',
      '[ACTION:restart] — Restart the computer (asks user confirmation)',
      '',
      'UTILITIES:',
      '[ACTION:open_settings] [ACTION:open_url:URL] [ACTION:set_reminder:LABEL:MINUTES]'
    ].join('\n');

    const rules = [
      'RULES:',
      '- Respond ONLY in ' + langName + '.',
      '- Keep responses under 150 words unless detail is asked.',
      '- Use markdown sparingly. Include [ACTION:...] tags when relevant.',
      '- Reference memory naturally (e.g. "last time you mentioned...") — do NOT list memories robotically.',
      '- Be honest. Occasionally check user wellbeing based on system state.'
    ].join('\n');

    return [
      personalityPrompt,
      '',
      'USER: ' + (state.userName || 'Operator') + ' | ACTIVE PERSONALITY: ' + personalityName,
      '',
      systemStateBlock,
      memoryBlock,
      '',
      actionsBlock,
      '',
      rules
    ].join('\n');
  }

  _trim() {
    if (this.history.length > this.MAX_HISTORY * 2)
      this.history = this.history.slice(-this.MAX_HISTORY * 2);
  }

  // ── Main chat entry ───────────────────────────────────────
  async chat(userMsg, systemState, lang = 'ka') {
    // Use persistent memory history if available
    if (window.hexMemory) {
      window.hexMemory.addTurn('user', userMsg);
      this.history = window.hexMemory.getRecentHistory(20);
    } else {
      this.history.push({ role: 'user', content: userMsg });
      this._trim();
    }

    const sysPrompt = this._systemPrompt(systemState, lang);
    let text;

    try {
      const p = this.config && this.config.llm ? this.config.llm.provider : 'none';
      switch (p) {
        case 'ollama': text = await this._ollama(sysPrompt); break;
        case 'openai': text = await this._openai(sysPrompt); break;
        case 'anthropic': text = await this._anthropic(sysPrompt); break;
        case 'gemini': text = await this._gemini(sysPrompt); break;
        case 'grok': text = await this._grok(sysPrompt); break;
        case 'openrouter': text = await this._openrouter(sysPrompt); break;
        case 'mistral': text = await this._mistral(sysPrompt); break;
        case 'groq': text = await this._groq(sysPrompt); break;
        case 'together': text = await this._together(sysPrompt); break;
        case 'cohere': text = await this._cohere(sysPrompt); break;
        default: text = this._offline();
      }
      // Guard: some providers return null content (empty/tool-only responses)
      if (!text || typeof text !== 'string') text = '…';
    } catch (e) {
      console.error('AI error:', e);
      text = 'Neural link disrupted: ' + (e?.message || String(e));
    }

    // Save to persistent memory
    if (window.hexMemory) {
      window.hexMemory.addTurn('assistant', text || '');
      window.hexMemory.extractFromExchange(userMsg || '', text || '');
      this.history = window.hexMemory.getRecentHistory(20);
    } else {
      this.history.push({ role: 'assistant', content: text });
    }

    return { text, actions: this._parseActions(text) };
  }

  // ── Ollama (local) ────────────────────────────────────────
  async _ollama(system) {
    const baseUrl = this.config.llm.baseUrl || 'http://localhost:11434';
    const model = this.config.llm.model || 'llama3';
    const res = await fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        stream: false,
        options: { temperature: 0.75, num_predict: 350 }
      })
    });
    if (!res.ok) throw new Error('Ollama ' + res.status + ': ' + await res.text());
    return ((await res.json())?.message?.content) || '…';
  }

  // ── OpenAI ────────────────────────────────────────────────
  async _openai(system) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('OpenAI ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
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
        max_tokens: 350, system,
        messages: this._msgs()
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Anthropic ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).content?.[0]?.text || '…';
  }

  // ── Google Gemini ─────────────────────────────────────────
  async _gemini(system) {
    const rawModel = this.config.llm.model || '';
    const model = (rawModel && rawModel !== 'gemini') ? rawModel : 'gemini-2.0-flash';
    const apiKey = this.config.llm.apiKey;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
    const contents = [
      { role: 'user', parts: [{ text: '[SYSTEM]\n' + system + '\n[/SYSTEM]\n\nAcknowledge briefly.' }] },
      { role: 'model', parts: [{ text: 'Understood. HEX online.' }] },
      ...this._msgs().map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 350, temperature: 0.75 } })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Gemini ' + res.status + ': ' + (e.error?.message || e.error?.status || JSON.stringify(e.error) || res.statusText)); }
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '…';
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
        max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Grok ' + res.status + ': ' + (e.error?.message || (typeof e.error === 'string' ? e.error : null) || e.message || JSON.stringify(e))); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
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
        max_tokens: 350
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('OpenRouter ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
  }

  // ── Mistral ───────────────────────────────────────────────
  async _mistral(system) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'mistral-small-latest',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Mistral ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
  }

  // ── Groq (ultra-fast inference) ───────────────────────────
  async _groq(system) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Groq ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
  }

  // ── Together AI ────────────────────────────────────────────
  async _together(system) {
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.llm.apiKey },
      body: JSON.stringify({
        model: this.config.llm.model || 'meta-llama/Llama-3-8b-chat-hf',
        messages: [{ role: 'system', content: system }, ...this._msgs()],
        max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Together ' + res.status + ': ' + (e.error && e.error.message)); }
    return (await res.json()).choices?.[0]?.message?.content || '…';
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
        message: lastMsg, max_tokens: 350, temperature: 0.75
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error('Cohere ' + res.status + ': ' + (e?.message || e?.detail || JSON.stringify(e))); }
    return (await res.json()).text || '…';
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

  // ── Helpers ───────────────────────────────────────────────
  _msgs() { return this.history.map(m => ({ role: m.role, content: m.content })); }

  _parseActions(text) {
    const actions = [];
    const re = /\[ACTION:([^\]]+)\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const parts = m[1].split(':');
      actions.push({ type: parts[0], args: parts.slice(1) });
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
      default:
        throw new Error('Model listing not supported for provider: ' + provider);
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
    return transform(await res.json());
  }

  clearHistory() {
    this.history = [];
    if (window.hexMemory) window.hexMemory.clearHistory();
  }
}

window.hexAI = new HexAI();
