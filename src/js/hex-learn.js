'use strict';
// == hex-learn.js == HEX Active Learning Engine ==============================
// When the user orders "Hex learn [topic]", this module:
//   1. Calls the configured AI with a structured study prompt
//   2. Parses the returned facts into typed, confidence-scored objects
//   3. Injects them directly into HexMemory as persistent knowledge nodes
//   4. Reports back to the user what was retained
//
// Learning sessions are also stored as special "learned_topic" nodes so HEX
// can report what it has already studied.
// ============================================================================

window.hexLearn = (function () {

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Resolve API key: checks direct apiKey first, then the multi-provider apiKeys map
  function _resolveKey(cfg, prov) {
    if (cfg.provider === prov && cfg.apiKey) return cfg.apiKey;
    return cfg.apiKeys?.[prov] || cfg.apiKey || '';
  }

  // Read a failed HTTP response and throw a human-readable error
  async function _httpError(res, label) {
    let detail = res.statusText;
    try {
      const b = await res.json();
      detail = b?.error?.message || b?.error?.status || b?.message || JSON.stringify(b?.error || b);
    } catch (_) {}
    throw new Error(`${label} HTTP ${res.status}: ${detail}`);
  }

  // ── Per-provider call (throws on failure, returns text on success) ─────────

  const OPENAI_BASE = {
    openai:     'https://api.openai.com/v1',
    grok:       'https://api.x.ai/v1',
    groq:       'https://api.groq.com/openai/v1',
    mistral:    'https://api.mistral.ai/v1',
    together:   'https://api.together.xyz/v1',
    openrouter: 'https://openrouter.ai/api/v1',
  };

  // Default model used when config model is blank or just the provider name
  const LEARN_MODEL = {
    gemini:     'gemini-2.5-flash',   // free
    grok:       'grok-3-mini',        // has free tier
    openrouter: 'openai/gpt-4o-mini', // cheap
    openai:     'gpt-4o',             // use exactly what the user configured
    groq:       'llama-3.1-8b-instant',
    mistral:    'mistral-small-latest',
    together:   'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    anthropic:  'claude-haiku-4-5-20251001',
    cohere:     'command-r-plus',
  };

  async function _callProvider(prov, cfg, msgs) {
    const key = _resolveKey(cfg, prov);
    if (!key && prov !== 'ollama') throw new Error(`No API key for "${prov}"`);

    // ── Ollama ──────────────────────────────────────────────────────────────
    if (prov === 'ollama') {
      const model = cfg.model || 'qwen2.5:7b';
      const res = await fetch((cfg.baseUrl || 'http://localhost:11434') + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs, stream: false, options: { temperature: 0.2, num_predict: 1200 } }),
      });
      if (!res.ok) await _httpError(res, 'Ollama');
      return (await res.json())?.message?.content || null;
    }

    // ── Gemini ──────────────────────────────────────────────────────────────
    if (prov === 'gemini') {
      const model = (cfg.model && cfg.model !== 'gemini') ? cfg.model.split(/\s+/)[0] : LEARN_MODEL.gemini;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: msgs[0].content }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
          }),
        }
      );
      if (!res.ok) await _httpError(res, 'Gemini');
      return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    // ── Anthropic ───────────────────────────────────────────────────────────
    if (prov === 'anthropic') {
      const model = (cfg.model && cfg.model !== 'anthropic') ? cfg.model : LEARN_MODEL.anthropic;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1200, messages: msgs }),
      });
      if (!res.ok) await _httpError(res, 'Anthropic');
      return (await res.json())?.content?.[0]?.text || null;
    }

    // ── Cohere ──────────────────────────────────────────────────────────────
    if (prov === 'cohere') {
      const model = (cfg.model && cfg.model !== 'cohere') ? cfg.model : LEARN_MODEL.cohere;
      const res = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, messages: msgs, max_tokens: 1200, temperature: 0.2 }),
      });
      if (!res.ok) await _httpError(res, 'Cohere');
      return (await res.json())?.message?.content?.[0]?.text || null;
    }

    // ── OpenAI-compatible (openai, grok, groq, mistral, together, openrouter) ──
    if (OPENAI_BASE[prov]) {
      const model = (cfg.model && cfg.model !== prov) ? cfg.model : (LEARN_MODEL[prov] || 'gpt-4o-mini');
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
      if (prov === 'openrouter') {
        hdrs['HTTP-Referer'] = 'https://softcurse-hex.local';
        hdrs['X-Title'] = 'HEX-Learn';
      }
      const res = await fetch(OPENAI_BASE[prov] + '/chat/completions', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ model, messages: msgs, max_tokens: 1200, temperature: 0.2 }),
      });
      if (!res.ok) await _httpError(res, prov);
      return (await res.json())?.choices?.[0]?.message?.content || null;
    }

    throw new Error(`Provider "${prov}" is not supported.`);
  }

  // ── Smart provider fallback ───────────────────────────────────────────────
  //
  // Priority order for the learn engine (free / cheapest first):
  //   1. gemini     — free tier, excellent JSON output
  //   2. grok       — free tier
  //   3. openrouter — pay-per-use but very cheap (gpt-4o-mini default)
  //   4. openai     — uses your exact configured model (e.g. gpt-4o)
  //   5. groq       — free but rate-limited
  //   6. ollama     — local, always free
  //   7. active provider — whatever is set in HEX settings (last resort)
  //
  // A provider is only tried if it has an API key configured.
  // If all fail, the last error is surfaced to the user.

  const LEARN_PRIORITY = ['gemini', 'grok', 'openrouter', 'openai', 'groq', 'ollama',
                           'mistral', 'together', 'anthropic', 'cohere', 'openrouter'];

  async function _llmCall(prompt) {
    if (!window.hexAI?.config) throw new Error('HEX AI engine not initialised.');
    const cfg = window.hexAI.config.llm;
    if (!cfg) throw new Error('No AI provider configured. Set one in Settings → AI.');

    const msgs = [{ role: 'user', content: prompt }];
    const activeProv = cfg.provider || 'none';

    // Build the ordered list of providers to try:
    // Start with priority list, append active provider at the end as final fallback,
    // deduplicate so we never call the same provider twice.
    const seen = new Set();
    const queue = [...LEARN_PRIORITY, activeProv].filter(p => {
      if (!p || p === 'none' || seen.has(p)) return false;
      seen.add(p);
      // Skip providers with no key (except ollama which is local)
      if (p !== 'ollama' && !_resolveKey(cfg, p)) return false;
      return true;
    });

    if (queue.length === 0) {
      throw new Error('No AI provider with a configured API key found. Add at least one key in Settings → AI.');
    }

    let lastError = null;
    for (const prov of queue) {
      try {
        window.hexTaskBus?.push(`Learn: trying ${prov}...`);
        const result = await _callProvider(prov, cfg, msgs);
        if (result) {
          // Tag which provider was used so the caller can report it
          _llmCall._usedProvider = prov;
          return result;
        }
      } catch (e) {
        lastError = e;
        console.warn(`[HexLearn] ${prov} failed: ${e.message}`);
        // Continue to next provider
      }
    }

    throw lastError || new Error('All configured providers failed to respond.');
  }
  _llmCall._usedProvider = null;

  // ── Build the study prompt ──────────────────────────────────────────────
  function _buildStudyPrompt(topic) {
    return `You are a knowledge extraction engine. Your task is to study the topic below and return a structured JSON object that will be stored as long-term memory for an AI assistant called HEX.

TOPIC: "${topic}"

Return ONLY a valid JSON object — no markdown fences, no extra text.

Schema:
{
  "topic": "<canonical topic name>",
  "summary": "<2-3 sentence overview HEX can cite>",
  "facts": [
    {
      "type": "<one of: concept, definition, principle, technique, tool, history, warning, best_practice, example>",
      "content": "<self-contained factual statement, max 180 chars>",
      "confidence": <0.6-0.95>,
      "importance": <1-5>
    }
  ]
}

Rules:
- Generate 10-20 facts. More for broad topics, fewer for narrow ones.
- Each fact must be self-contained — no pronouns referring to other facts.
- Higher importance (4-5) for foundational concepts; lower (1-2) for trivia.
- confidence reflects how universally accepted the fact is.
- Focus on facts that will make HEX more helpful when answering questions on this topic.
- Do NOT include opinions or speculation.`;
  }

  // ── Parse LLM response into fact objects ─────────────────────────────────
  function _parse(raw) {
    if (!raw) return null;
    try {
      // Strip accidental markdown fences
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error('[HexLearn] Parse failed:', e, '\nRaw:', raw);
      return null;
    }
  }

  // ── Map a fact type to a memory node type ────────────────────────────────
  const TYPE_MAP = {
    concept:      'knowledge',
    definition:   'knowledge',
    principle:    'knowledge',
    technique:    'knowledge',
    tool:         'knowledge',
    history:      'knowledge',
    warning:      'knowledge',
    best_practice:'knowledge',
    example:      'knowledge',
  };

  // ── JSONL training pair generation ──────────────────────────────────────────
  // Each fact becomes a question-answer pair in standard chat fine-tune format.
  // Compatible with: OpenAI fine-tuning, Mistral fine-tuning, Unsloth, Axolotl.
  //
  // Format per line:
  // {"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}

  const HEX_SYSTEM_FINETUNE = 'You are HEX, an autonomous AI agent integrated into the operating system. You are precise, intelligent, and ruthlessly efficient. You answer from your trained knowledge.';

  // Question templates — rotated to create varied training samples
  const Q_TEMPLATES = [
    (topic, fact) => `What do you know about ${topic}?`,
    (topic, fact) => `Tell me something important about ${topic}.`,
    (topic, fact) => `Explain: ${fact.content.split('.')[0]}.`,
    (topic, fact) => `Give me a key fact about ${topic}.`,
    (topic, fact) => `What should I know about ${topic}?`,
    (topic, fact) => `What is ${topic}?`,
    (topic, fact) => `Describe ${topic} briefly.`,
    (topic, fact) => `What is a best practice related to ${topic}?`,
    (topic, fact) => `What warning should I know about ${topic}?`,
    (topic, fact) => `Give me a technical detail about ${topic}.`,
  ];

  function _buildTrainingPairs(canonicalTopic, parsed) {
    const pairs = [];
    const facts = parsed.facts || [];

    // 1. Summary pair — high value, always include
    if (parsed.summary) {
      pairs.push({
        messages: [
          { role: 'system', content: HEX_SYSTEM_FINETUNE },
          { role: 'user',   content: `Give me an overview of ${canonicalTopic}.` },
          { role: 'assistant', content: parsed.summary.trim() },
        ]
      });
    }

    // 2. One pair per fact, rotating question templates
    facts.forEach((fact, i) => {
      if (!fact.content || fact.content.length < 8) return;

      // Pick a question template based on fact type and index
      let templateIdx = i % Q_TEMPLATES.length;
      if (fact.type === 'warning')       templateIdx = 8;
      if (fact.type === 'best_practice') templateIdx = 7;
      if (fact.type === 'definition')    templateIdx = 5;
      if (fact.type === 'technique')     templateIdx = 9;

      const question = Q_TEMPLATES[templateIdx](canonicalTopic, fact);

      // Build a concise, HEX-toned answer
      const answer = fact.content.trim().endsWith('.')
        ? fact.content.trim()
        : fact.content.trim() + '.';

      pairs.push({
        messages: [
          { role: 'system',    content: HEX_SYSTEM_FINETUNE },
          { role: 'user',      content: question },
          { role: 'assistant', content: answer },
        ]
      });
    });

    // 3. "What have you studied?" awareness pair
    pairs.push({
      messages: [
        { role: 'system',    content: HEX_SYSTEM_FINETUNE },
        { role: 'user',      content: `Have you studied ${canonicalTopic}?` },
        { role: 'assistant', content: `Affirmative. ${canonicalTopic} is indexed in my knowledge base. ${parsed.summary ? parsed.summary.split('.')[0] + '.' : ''}` },
      ]
    });

    return pairs;
  }

  async function _writeJSONL(pairs) {
    if (!window.hexAPI?.appendFinetune) return { success: false, error: 'API not available' };
    const lines = pairs.map(p => JSON.stringify(p));
    return await window.hexAPI.appendFinetune(lines);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * learnTopic(topic)
   * Main entry point. Called by the command parser.
   * Returns { stored, pairs, topic, summary, finetunePath } on success, or throws.
   */
  async function learnTopic(topic) {
    if (!window.hexMemory) throw new Error('Memory system not initialised.');

    const prompt = _buildStudyPrompt(topic);
    // _llmCall now throws descriptive errors on failure — no null-check needed
    const raw = await _llmCall(prompt);
    if (!raw) throw new Error('AI returned an empty response. Try again or check your provider quota.');

    const parsed = _parse(raw);
    if (!parsed || !Array.isArray(parsed.facts) || parsed.facts.length === 0) {
      throw new Error('AI returned an unexpected format. Could not parse knowledge.');
    }

    const canonicalTopic = (parsed.topic || topic).trim();
    let stored = 0;

    // ── 1. Store summary memory node ─────────────────────────────────────────
    if (parsed.summary) {
      window.hexMemory.addNode(
        'knowledge',
        `[${canonicalTopic}] SUMMARY: ${parsed.summary.trim()}`,
        0.92,
        { temporal: 'permanent', implicit: false }
      );
      stored++;
    }

    // ── 2. Store individual fact nodes ───────────────────────────────────────
    for (const fact of parsed.facts) {
      if (!fact.content || fact.content.length < 8) continue;
      const nodeType = TYPE_MAP[fact.type] || 'knowledge';
      const content = `[${canonicalTopic}] ${fact.content.trim()}`;
      const confidence = Math.max(0.55, Math.min(0.95, fact.confidence || 0.7));
      window.hexMemory.addNode(nodeType, content, confidence, {
        temporal: 'permanent',
        implicit: false,
      });
      stored++;
    }

    // ── 3. Record the learning session log node ──────────────────────────────
    window.hexMemory.addNode(
      'learned_topic',
      `HEX has studied: "${canonicalTopic}" (${stored} knowledge nodes retained, learned on ${new Date().toLocaleDateString()})`,
      0.99,
      { temporal: 'permanent', implicit: false }
    );

    // ── 4. Save memory to disk immediately ──────────────────────────────────
    await window.hexMemory.forceSave();

    // ── 5. Generate and append JSONL fine-tuning training pairs ─────────────
    const pairs = _buildTrainingPairs(canonicalTopic, parsed);
    let finetunePath = null;
    let finetuneWritten = 0;
    try {
      const writeResult = await _writeJSONL(pairs);
      if (writeResult?.success) {
        finetunePath = writeResult.path;
        finetuneWritten = pairs.length;
      } else {
        console.warn('[HexLearn] JSONL write failed:', writeResult?.error);
      }
    } catch (e) {
      console.warn('[HexLearn] JSONL write exception:', e);
    }

    return {
      topic: canonicalTopic,
      summary: parsed.summary || '',
      stored,
      pairs: finetuneWritten,
      finetunePath,
      provider: _llmCall._usedProvider || 'unknown',
    };
  }

  /**
   * getLearnedTopics()
   * Returns a list of topics HEX has studied (for display or querying).
   */
  function getLearnedTopics() {
    if (!window.hexMemory) return [];
    return (window.hexMemory.nodes || [])
      .filter(n => n.type === 'learned_topic' && n.status === 'active')
      .map(n => n.content);
  }

  /**
   * getFinetunePath()
   * Returns where hex-finetune.jsonl is stored (the app install folder).
   */
  async function getFinetunePath() {
    if (!window.hexAPI?.getFinetunePath) return null;
    const result = await window.hexAPI.getFinetunePath();
    return result?.path || null;
  }

  return { learnTopic, getLearnedTopics, getFinetunePath };

})();
