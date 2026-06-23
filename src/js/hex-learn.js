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

  async function _llmCall(prompt) {
    const cfg = window.hexAI?.config?.llm || {};
    const capabilities = await window.hexAPI.getProviderCapabilities();
    const active = String(cfg.provider || '').toLowerCase();
    const ranked = capabilities?.capabilities?.providers || Object.values(capabilities?.providers || {});
    const queue = ranked
      .filter((item) => item?.status === 'ready' && Number(item.validKeys || 0) > 0)
      .map((item) => item.provider);

    let lastError = null;
    for (const provider of queue) {
      try {
        window.hexTaskBus?.push('Learn: trying ' + provider + '...');
        const result = await window.hexAPI.executeProvider({
          provider,
          model: provider === active ? (cfg.model || '') : '',
          system: 'You are HEX knowledge extraction. Return only accurate structured JSON. Do not invent facts.',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 1200
        });
        if (result?.success && result.text) {
          _llmCall._usedProvider = provider;
          return result.text;
        }
        throw new Error(result?.error || (provider + ' returned no content'));
      } catch (error) {
        lastError = error;
        console.warn('[HexLearn] ' + provider + ' failed: ' + error.message);
      }
    }

    if (active === 'ollama') {
      try {
        const response = await fetch((cfg.baseUrl || 'http://localhost:11434') + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: cfg.model || 'qwen2.5:7b',
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            options: { temperature: 0.2, num_predict: 1200 }
          })
        });
        if (!response.ok) throw new Error('Ollama HTTP ' + response.status);
        _llmCall._usedProvider = 'ollama';
        return (await response.json())?.message?.content || null;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('No usable AI provider is available for learning.');
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
