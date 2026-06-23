'use strict';
// ── HexAI: LLM conversation engine ───────────────────────────────────────────
// Providers: Ollama · OpenAI · Anthropic · Google Gemini · Grok (xAI)
//            OpenRouter · Mistral · Cohere · Together AI · Groq

class HexAI {
  constructor() {
    this.config = null;
    this.history = [];
    this._transientMessages = null;
    this._lastSystemState = null;
    this.MAX_HISTORY = 20;
    this.REQUEST_TIMEOUT_MS = 20000;
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
      cohere: 'command-r',
      hf: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    };
    this.COMPLEXITY_THRESHOLD = 0.4;  // below this → use fast model
  }

  configure(config) {
    this.config = config;
  }

  // ── System prompt ─────────────────────────────────────────
  _systemPrompt(state, lang) {
    const builder = this._shouldUseCompactPrompt()
      ? (window.buildHexCompactSystemPrompt || window.buildHexSystemPrompt)
      : window.buildHexSystemPrompt;
    return builder(state, lang, window._lastUserMsg || '');
  }

  _trim() {
    if (this.history.length > this.MAX_HISTORY * 2)
      this.history = this.history.slice(-this.MAX_HISTORY * 2);
  }

  // ── Main chat entry ───────────────────────────────────────
  async chat(userMsg, systemState, lang = 'ka', visionData = null, maxTokens = 800, options = {}) {
    this._maxTokens = maxTokens;
    this._lastSystemState = systemState || null;
    window._lastUserMsg = userMsg;
    const persistUser = options.persistUser !== false;
    const persistAssistant = options.persistAssistant !== false;
    const extractFacts = options.extractFacts !== false;
    let messageHistory = [];

    // Use persistent memory history if available
    if (window.hexMemory) {
      if (persistUser) {
        window.hexTaskBus?.push('Saving user message to memory...');
        window.hexMemory.addTurn('user', userMsg);
        // Update working memory mood immediately (before LLM call)
        window.hexMemory.working.mood = window.hexMemory._detectMood(userMsg);
      }
      this.history = window.hexMemory.getRecentHistory(40);
      messageHistory = persistUser
        ? this.history
        : this.history.concat({ role: 'user', content: userMsg });
    } else {
      if (persistUser) {
        this.history.push({ role: 'user', content: userMsg });
        this._trim();
      }
      messageHistory = persistUser
        ? this.history
        : this.history.concat({ role: 'user', content: userMsg });
    }

    let text;
    const brainRoute = await window.hexBrainRouter?.route?.({ userMsg, systemState, lang, options });
    if (brainRoute?.hints) {
      systemState = { ...(systemState || {}), brainRoute: brainRoute.hints };
      this._lastSystemState = systemState;
      window.hexBrainTelemetry?.sync?.({
        phase: 'route',
        user: userMsg,
        route: brainRoute.hints.route,
        reason: brainRoute.hints.reason || brainRoute.reason,
        confidence: brainRoute.hints.confidence,
        actionDomain: brainRoute.hints.actionPlan?.domain,
        actionSurface: brainRoute.hints.actionPlan?.suggestedSurface,
        actionUrgency: brainRoute.hints.actionPlan?.urgency,
        providerRequired: brainRoute.hints.providerRequired,
        serverPacket: brainRoute.hints.serverPacket,
        serverMemoryHits: brainRoute.hints.serverMemoryHits,
        sources: brainRoute.hints.sources || []
      });
    }
    if (brainRoute?.mode && brainRoute.mode !== 'provider' && brainRoute.mode !== 'server-context-provider') {
      window.hexTaskBus?.push('Brain Router: ' + brainRoute.mode + ' (' + (brainRoute.reason || 'local') + ')');
      text = brainRoute.text || window.hexBrainCore?.survivalReply?.({ userMsg, lang }) || this._offline();
      this._transientMessages = null;
    }

    if (!text) {
      if (brainRoute?.mode) {
        window.hexTaskBus?.push('Brain Router: ' + brainRoute.mode + ' (' + (brainRoute.reason || 'model') + ')');
      }
      window.hexTaskBus?.push('Building system prompt...');
      const sysPrompt = this._systemPrompt(systemState, lang);
      this._transientMessages = messageHistory;

      try {
      const p = this.config && this.config.llm ? this.config.llm.provider : 'none';
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
      if (visionData && p === 'ollama') {
        routeProvider = 'gemini';
        window.hexTaskBus?.push('Delegating visual payload to Gemini Vision API...');
      }

      // G��G�� Multi-Provider Auto Fallback Queue (PHASE 13 + CLOUD ORCHESTRATION) G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��
      const capabilityRes = await Promise.race([
        window.hexAPI.getProviderCapabilities(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Provider capability lookup timeout after 5s')), 5000);
        })
      ]);
      const liveKeys = Object.fromEntries(
        Object.entries(capabilityRes?.providers || {}).map(([provider, capability]) => [
          provider,
          Number(capability?.validKeys || 0) > 0 ? [true] : []
        ])
      );

      const orchestration = capabilityRes?.capabilities || null;
      const providerQueue = this._buildProviderQueue({
        routeProvider,
        liveKeys,
        orchestration
      });

      if (orchestration?.providers?.length) {
        const active = orchestration.activeProvider || providerQueue[0] || 'none';
        window.hexTaskBus?.push('Cloud orchestration active: ' + active + ' ranked first.');
      }

      if (providerQueue.length === 0) {
        const emergencyProvider = routeProvider !== 'none' ? routeProvider : 'ollama';
        providerQueue.push(emergencyProvider);
      }

      let success = false;
      let lastErr = null;
      const allErrors = [];
      const providerSummaries = [];
      const permanentProviderFailures = new Set();

      for (const currProvider of providerQueue) {
        if (permanentProviderFailures.has(currProvider)) continue;
        // Build an array of keys to test for this provider
        let keysToTry = [];
        let usingLivePool = false;
        if (currProvider === 'ollama') {
          keysToTry = [null]; // No API key required
        } else if (liveKeys[currProvider] && liveKeys[currProvider].length > 0) {
          keysToTry = [null]; // Main process owns and cycles provider keys
          usingLivePool = true;
        } else {
          continue; // Cannot test this provider, no keys
        }

        // Exhaust every key before giving up on the provider
        const providerFailures = [];
        let providerSucceeded = false;
        for (let i = 0; i < keysToTry.length; i++) {
          try {

            if (currProvider !== routeProvider) {
              window.hexTaskBus?.push(`Fallback: Auto-routing to ${currProvider}... ${keysToTry.length > 1 ? `(Key ${i + 1}/${keysToTry.length})` : ''}`);
              if (window.hexAudio && i === 0) window.hexAudio.play('reroute', 0.9);
              this.config.llm.model = this._preferredModelForProvider(currProvider, this.config.llm.model);
            } else {
              if (keysToTry.length > 1 && i > 0) {
                window.hexTaskBus?.push(`Cycling ${currProvider} keys... (Key ${i + 1}/${keysToTry.length})`);
              }
              this.config.llm.model = this._preferredModelForProvider(currProvider, this.config.llm.model);
            }

            switch (currProvider) {
              case 'ollama': text = await this._ollama(sysPrompt, visionData); break;
              case 'openai':
              case 'anthropic':
              case 'gemini':
              case 'grok':
              case 'openrouter':
              case 'mistral':
              case 'groq':
              case 'together':
              case 'cohere':
              case 'hf':
                text = await this._executeRemoteProvider(currProvider, sysPrompt, visionData);
                break;
              case 'replicate': text = await this._replicate(sysPrompt); break;
              default: text = this._offline(); break;
            }

            if (text && typeof text === 'string') {
              success = true;
              providerSucceeded = true;
              break; // Break inner key loop!
            }
          } catch (err) {
            lastErr = err;
            const summary = this._classifyProviderError(currProvider, err);
            providerFailures.push(summary);
            allErrors.push(`[${currProvider.toUpperCase()}] ${summary.raw}`);
            console.warn(`Softcurse LLM: ${currProvider} [Key ${i + 1}] failed:`, summary.raw);
            const hasMoreKeys = i < keysToTry.length - 1;
            const shouldKeepCyclingKeys = usingLivePool && hasMoreKeys;
            if (summary.skipRemainingKeys && !shouldKeepCyclingKeys) {
              permanentProviderFailures.add(currProvider);
                await this._reportProviderOutcome(currProvider, { ok: false, summary, preferredProvider: routeProvider });
              break;
            }
            if (summary.skipRemainingKeys && shouldKeepCyclingKeys) {
              window.hexTaskBus?.push(`${currProvider.toUpperCase()} key ${i + 1} rejected. Trying next live key...`);
            }
          }
        } // end key loop

        if (!providerSucceeded && providerFailures.length > 0) {
          const allPermanent = providerFailures.length >= keysToTry.length
            && providerFailures.every((item) => item.skipRemainingKeys);
          if (allPermanent) {
            permanentProviderFailures.add(currProvider);
            const lastFailure = providerFailures[providerFailures.length - 1];
            await this._reportProviderOutcome(currProvider, { ok: false, summary: lastFailure, preferredProvider: routeProvider });
          }
          providerSummaries.push(this._summarizeProviderFailures(currProvider, providerFailures));
        } else if (providerSucceeded) {
            await this._reportProviderOutcome(currProvider, { ok: true, preferredProvider: routeProvider });
        }
        if (success) break; // Break outer provider loop!
      }

      if (!success) {
        const mergedSummaries = providerSummaries;
        window._hexLastProviderFailures = mergedSummaries;
        const compact = mergedSummaries.length > 0
          ? mergedSummaries.map((item) => `- ${item.label}: ${item.reason}`).join('\n')
          : allErrors.join('\n');
        const providerError = new Error('All available LLM auto-fallback providers failed.\n\nProvider status:\n' + compact);
        text = window.hexBrainCore?.survivalReply
          ? window.hexBrainCore.survivalReply({ userMsg, lang, error: providerError, providerSummaries: mergedSummaries })
          : this._offline();
        success = true;
        window.hexTaskBus?.push('Provider layer unavailable. Local Brain Core survival response used.');
      }

      window._hexLastProviderFailures = [];

      // Guard: some providers return null content
      if (!text || typeof text !== 'string') text = '…';

      // Restore original config parameters
      if (this.config && this.config.llm) {
        this.config.llm.model = origModel;
      }
    } catch (e) {
      console.error('AI error:', e);
      text = window.hexBrainCore?.survivalReply
        ? window.hexBrainCore.survivalReply({ userMsg, lang, error: e })
        : ('Neural link disrupted: ' + (e?.message || String(e)));
      window.hexTaskBus?.push('Neural layer error caught. Local Brain Core survival response used.');
    } finally {
      this._transientMessages = null;
    }
    }

    // Save to persistent memory
    if (window.hexMemory) {
      if (persistAssistant) window.hexMemory.addTurn('assistant', text || '');
      if (persistUser && extractFacts) {
        window.hexTaskBus?.push('Extracting facts from response...');
        window.hexMemory.extractFromExchange(userMsg || '', text || '');
      }
      this.history = window.hexMemory.getRecentHistory(40);
    } else {
      if (persistAssistant) {
        this.history.push({ role: 'assistant', content: text });
        this._trim();
      }
    }

    return { text, actions: this._parseActions(text), brainRoute: brainRoute?.hints || null };
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

    const res = await this._fetchWithTimeout(baseUrl + '/api/chat', {
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


  async _executeRemoteProvider(provider, system, visionData = null) {
    const result = await window.hexAPI.executeProvider({
      provider,
      model: this.config?.llm?.model || '',
      system,
      messages: this._msgs(),
      visionData,
      maxTokens: this._maxTokens || 800
    });
    if (!result?.success) throw new Error(result?.error || (provider + ' request failed'));
    return result.text || '...';
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
  }  async _fetchWithTimeout(url, options = {}, timeoutMs = this.REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }



  // ── Helpers ───────────────────────────────────────────────
  _msgs() {
    const source = this._transientMessages || this.history;
    const historyWindow = this._historyWindowForCurrentModel();
    const raw = source.slice(-historyWindow).map(m => ({ role: m.role, content: m.content }));

    const reminderParts = [this._buildMemoryReminder(), this._buildContinuityReminder()].filter(Boolean);
    const reminder = reminderParts.join('\n\n');
    if (reminder) {
      const lastUserIdx = [...raw].reverse().findIndex((m) => m.role === 'user');
      if (lastUserIdx !== -1) {
        const idx = raw.length - 1 - lastUserIdx;
        raw[idx] = {
          ...raw[idx],
          content: `[SESSION MEMORY]\n${reminder}\n\n[CURRENT USER MESSAGE]\n${raw[idx].content}`
        };
      } else {
        raw.push({ role: 'user', content: `[SESSION MEMORY]\n${reminder}` });
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
      .slice(0, this._shouldUseCompactPrompt() ? 8 : 12)
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

  _buildContinuityReminder() {
    const state = this._lastSystemState || {};
    const session = state.sessionContext || {};
    const browser = state.browserSession || {};
    const desktop = state.desktopContext || {};
    const recentTurns = Array.isArray(state.recentTurns) ? state.recentTurns : [];
    const lines = [];

    const hasContext = !!(
      session.primaryGoal ||
      session.lastActionSummary ||
      session.lastSystemDataSummary ||
      session.lastUserWasFollowUp ||
      browser.open ||
      (desktop.recent && desktop.recent.length) ||
      (desktop.windowCandidates && desktop.windowCandidates.length) ||
      (desktop.processCandidates && desktop.processCandidates.length) ||
      (desktop.appCandidates && desktop.appCandidates.length) ||
      (desktop.fileCandidates && desktop.fileCandidates.length) ||
      (desktop.gameCandidates && desktop.gameCandidates.length) ||
      (desktop.promotedRecent && desktop.promotedRecent.length) ||
      (desktop.entityMatches && desktop.entityMatches.length)
    );
    if (!hasContext) return null;

    lines.push('[LIVE SESSION CONTINUITY — do NOT start fresh]');
    if (session.primaryGoal) lines.push('Current ongoing goal: ' + session.primaryGoal);
    if (session.lastUserMessage) lines.push('Latest real user message: ' + session.lastUserMessage);
    if (session.lastUserWasFollowUp) {
      lines.push('The latest user message is a FOLLOW-UP to the active session unless the user explicitly changed topics.');
    }
    if (session.lastActionSummary) lines.push('Last planned/executed actions: ' + session.lastActionSummary);
    if (session.lastSystemDataSummary) lines.push('Recent real system/browser data: ' + session.lastSystemDataSummary);
    if (browser.open) {
      lines.push(`Active browser session: OPEN | ${browser.title || 'Untitled page'} | ${browser.url || 'unknown URL'}`);
      lines.push('If the user refers to page items by ordinal or reference words (first, second, third, that video, this button, open it), stay in this browser session.');
      lines.push('Prefer controlled browser actions like [ACTION:web_find_click:VISIBLE TEXT], [ACTION:web_read], [ACTION:web_back], or [ACTION:web_refresh] instead of opening a new site.');
    } else {
      lines.push('Active browser session: CLOSED');
    }
    if (desktop.recentSummary && desktop.recentSummary !== 'none') lines.push('Recent desktop target: ' + desktop.recentSummary);
    if (desktop.windowCandidates?.length) lines.push('Open windows in focus context: ' + desktop.windowCandidates.join(' | '));
    if (desktop.processCandidates?.length) lines.push('Process context: ' + desktop.processCandidates.join(' | '));
    if (desktop.appCandidates?.length) lines.push('App context: ' + desktop.appCandidates.join(' | '));
    if (desktop.fileCandidates?.length) lines.push('File context: ' + desktop.fileCandidates.join(' | '));
    if (desktop.folderCandidates?.length) lines.push('Folder context: ' + desktop.folderCandidates.join(' | '));
    if (desktop.gameCandidates?.length) lines.push('Game context: ' + desktop.gameCandidates.join(' | '));
    if (desktop.promotedRecent?.length) lines.push('Promoted desktop targets: ' + desktop.promotedRecent.join(' | '));
    if (desktop.inventorySummary) lines.push('Desktop inventory summary: ' + desktop.inventorySummary);
    if (desktop.inventoryHighlights?.length) lines.push('Desktop inventory highlights: ' + desktop.inventoryHighlights.join(' | '));
    if (desktop.entityMatches?.length) lines.push('Desktop entity matches for this message: ' + desktop.entityMatches.join(' | '));
    if (desktop.inventoryAgeMinutes != null) lines.push('Desktop inventory cached age: ' + desktop.inventoryAgeMinutes + ' min');
    if (desktop.recentSummary && desktop.recentSummary !== 'none') {
      lines.push('If the user says open it, close that, launch the second one, focus that window, or kill that process, resolve it against this desktop context before treating it as a new request.');
      lines.push('If entity matches are present for the current message, prefer those known PC entities before broad scanning or guessing.');
    }
    if (recentTurns.length > 0) {
      lines.push('Recent turns:');
      recentTurns.slice(-(this._shouldUseCompactPrompt() ? 4 : 3)).forEach((turn) => {
        lines.push('- ' + turn.role.toUpperCase() + ': ' + String(turn.content || '').substring(0, 140));
      });
    }

    return lines.join('\n');
  }

  _shouldUseCompactPrompt() {
    const provider = this.config?.llm?.provider || 'none';
    const model = String(this.config?.llm?.model || '').toLowerCase();
    return provider === 'ollama' ||
      provider === 'hf' ||
      /(7b|8b|mini|small|instant|haiku|flash-lite|command-r)/i.test(model);
  }

  _historyWindowForCurrentModel() {
    return this._shouldUseCompactPrompt() ? 14 : 24;
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
  async fetchModels(provider, _apiKey, baseUrl) {
    if (provider !== 'ollama') {
      throw new Error('Remote model inventory is supplied by Hunter capabilities.');
    }
    const response = await fetch((baseUrl || 'http://localhost:11434') + '/api/tags');
    if (!response.ok) throw new Error('Ollama HTTP ' + response.status);
    const data = await this._safeJson(response);
    return (data.models || []).map((model) => ({ id: model.name, free: true }));
  }
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


  _buildProviderQueue({ routeProvider, liveKeys, orchestration }) {
    const queue = [];
    const ranked = Array.isArray(orchestration?.providers)
      ? orchestration.providers.filter((item) => item?.status === 'ready')
      : [];

    const addProvider = (provider) => {
      const normalized = String(provider || '').trim().toLowerCase();
      if (!normalized || normalized === 'none' || queue.includes(normalized)) return;
      if (normalized === 'ollama' || liveKeys[normalized]?.length > 0) queue.push(normalized);
    };

    const selected = ranked.find((item) => item.provider === routeProvider);
    if (routeProvider === 'ollama' || selected?.status === 'ready') {
      addProvider(routeProvider);
    } else if (routeProvider !== 'none') {
      window.hexTaskBus?.push('Provider ' + routeProvider + ' is not ready. Server-ranked fallback activating...');
    }

    ranked.forEach((item) => addProvider(item.provider));
    return queue;
  }
  async _reportProviderOutcome(provider, payload = {}) {
    try {
      if (!window.hexAPI?.cloud?.hunterReportProvider) return;
      const summary = payload.summary || null;
      await window.hexAPI.cloud.hunterReportProvider({
        provider,
        ok: payload.ok === true,
        preferredProvider: payload.preferredProvider || '',
        reason: summary?.reason || '',
        error: summary?.raw || summary?.reason || '',
        cooldownMs: summary?.kind === 'rate_limit' ? 2 * 60 * 1000 : undefined
      });
    } catch (_) {
      // Cloud orchestration reporting should never break chat fallback.
    }
  }


  _preferredModelForProvider(provider, currentModel) {
    const model = String(currentModel || '').trim();
    const lower = model.toLowerCase();
    if (!model) return this.FAST_MODELS[provider] || '';

    if (provider === 'cohere' && /command-light/.test(lower)) return this.FAST_MODELS[provider] || 'command-r';
    if (provider === 'openai' && /claude|gemini|mistral|grok|command-r/.test(lower)) return this.FAST_MODELS[provider] || 'gpt-4o-mini';
    if (provider === 'anthropic' && /gpt-|gemini|mistral|grok|command-r/.test(lower)) return this.FAST_MODELS[provider] || 'claude-haiku-4-5-20251001';
    if (provider === 'mistral' && /command-light|command-r|gpt-|claude|gemini/.test(lower)) return this.FAST_MODELS[provider] || 'mistral-small-latest';
    if (provider === 'grok' && /gpt-|claude|gemini|mistral|command-r/.test(lower)) return this.FAST_MODELS[provider] || 'grok-3-mini-fast';
    if (provider === 'gemini' && /gpt-|claude|mistral|grok|command-r/.test(lower)) return this.FAST_MODELS[provider] || 'gemini-2.0-flash-lite';
    return model;
  }

  _classifyProviderError(provider, err) {
    const raw = String(err?.message || err || 'Unknown error');
    const lower = raw.toLowerCase();

    if (provider === 'anthropic' && /401|invalid x-api-key|authentication/i.test(lower)) {
      return { raw, reason: 'invalid API key', skipRemainingKeys: true, demoteForSession: true, kind: 'invalid_key' };
    }
    if (provider === 'openai' && /401|incorrect api key|invalid api key/i.test(lower)) {
      return { raw, reason: 'invalid API key', skipRemainingKeys: true, demoteForSession: true, kind: 'invalid_key' };
    }
    if (provider === 'mistral' && /401|unauthorized|forbidden/i.test(lower)) {
      return { raw, reason: 'invalid or unauthorized API key', skipRemainingKeys: true, demoteForSession: true, kind: 'invalid_key' };
    }
    if (provider === 'grok' && /403|no credits|licenses/i.test(lower)) {
      return { raw, reason: 'account has no credits or license', skipRemainingKeys: true, demoteForSession: true, kind: 'billing' };
    }
    if (provider === 'gemini' && /403|api has not been used|disabled|blocked/i.test(lower)) {
      return { raw, reason: 'API disabled or blocked in Google project', skipRemainingKeys: true, demoteForSession: true, kind: 'api_disabled' };
    }
    if (provider === 'cohere' && /404|removed|model/i.test(lower)) {
      return { raw, reason: 'configured model is unavailable', skipRemainingKeys: true, demoteForSession: true, kind: 'model_removed' };
    }
    if (provider === 'hf' && /failed to fetch|fetch/i.test(lower)) {
      return { raw, reason: 'network or provider fetch failure', skipRemainingKeys: true, demoteForSession: false, kind: 'network' };
    }
    if (/429|rate limit|too many requests/i.test(lower)) {
      return { raw, reason: 'rate limited', skipRemainingKeys: true, demoteForSession: false, kind: 'rate_limit' };
    }

    return { raw, reason: raw, skipRemainingKeys: false, demoteForSession: false, kind: 'unknown' };
  }

  _summarizeProviderFailures(provider, failures) {
    const first = failures[0] || { reason: 'unknown failure' };
    return {
      provider,
      label: provider.toUpperCase(),
      reason: first.reason,
      attempts: failures.length
    };
  }


}

window.hexAI = new HexAI();
