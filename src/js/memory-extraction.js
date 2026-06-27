'use strict';

window.hexMemoryExtraction = {
  detectMood(memory, userMsg) {
    const text = (userMsg || '').toLowerCase();
    const frustrated = /ugh|argh|still not|doesn.t work|why (is|does|won.t)|i.ve been|hours?|nothing works/i.test(text);
    const exploratory = /what if|maybe|could we|alternatively|i wonder|what about/i.test(text);
    const focused = userMsg.length > 200 || /```|function|class |const |def |import /i.test(text);
    if (frustrated) return 'frustrated';
    if (focused) return 'focused';
    if (exploratory) return 'exploratory';
    return memory.working.mood;
  },

  async extractFromExchange(memory, userMsg, aiReply) {
    userMsg = (userMsg || '').trim();
    aiReply = (aiReply || '').trim();

    memory.working.mood = this.detectMood(memory, userMsg);
    memory.working.messageCount++;

    this.extractKeywords(memory, userMsg);

    if (memory.EXTRACTION_ENABLED && window.hexAI?.config?.llm?.provider &&
      window.hexAI.config.llm.provider !== 'none' && !memory._extracting) {
      this.extractWithLLM(memory, userMsg, aiReply).catch((error) =>
        memory._log('Extraction error: ' + (error?.message || ''))
      );
    }

    this.maybeAutoCompress(memory).catch(() => { });
    memory._scheduleSave();
  },

  extractKeywords(memory, userMsg) {
    const msg = userMsg || '';

    const NOT_NAMES = new Set(['still', 'trying', 'going', 'just', 'also', 'here', 'there', 'very', 'really', 'always', 'never', 'actually', 'currently', 'basically', 'simply', 'using', 'working', 'looking', 'having', 'doing', 'making', 'getting', 'being', 'about', 'sorry', 'sure', 'fine', 'good', 'great', 'okay', 'well']);
    const nameM = msg.match(/(?:my name is|call me)\s+([A-ZА-Я][a-zа-я]{2,20})/i);
    if (nameM && !NOT_NAMES.has(nameM[1].toLowerCase())) memory.addNode('user', "User's name is " + nameM[1], 0.95);

    const urlM = msg.match(/(?:my (?:website|site|url|page|blog|portfolio) (?:is|at|:))?\s*(https?:\/\/[^\s]+)/i);
    if (urlM) {
      const url = urlM[1].replace(/[.,;!?]+$/, '');
      const labelM = msg.match(/(?:(?:my|the)\s+)?(\w[\w\s]{2,30}?)(?:\s+(?:is|at|:)\s*https?:)/i);
      const label = labelM ? labelM[1].trim() : 'website';
      memory.addNode('user', `User has a ${label} at ${url}`, 0.95);
    }

    const rememberM = msg.match(/remember\s+(?:that\s+)?(?:my\s+)?(.+?)\s+(?:is|at|=)\s+(https?:\/\/[^\s]+)/i);
    if (rememberM) {
      const alias = rememberM[1].trim();
      const url = rememberM[2].replace(/[.,;!?]+$/, '');
      memory.addNode('user', `User's ${alias} is ${url}`, 0.95);
    }

    const osM = msg.match(/\b(windows\s*1[01]|windows|macos|mac\s*os|linux|ubuntu|debian|arch)\b/i);
    if (osM) memory.addNode('system', 'Uses ' + osM[0] + ' OS', 0.9);

    const appPrefM = msg.match(/(?:i (?:use|prefer|always use|love|open))\s+([\w\s]{3,30}?)(?:\s+(?:for|as|to|instead)|\.|,|$)/i);
    if (appPrefM) memory.addNode('app_preference', 'Prefers ' + appPrefM[1].trim(), 0.7);

    const browserM = msg.match(/\b(chrome|firefox|brave|edge|safari|opera)\b/i);
    if (browserM) memory.addNode('app_preference', 'Uses ' + browserM[1] + ' browser', 0.75, { implicit: true });

    const editorM = msg.match(/\b(vscode|vs code|visual studio code|neovim|vim|nvim|sublime|cursor|jetbrains|rider|pycharm|webstorm|intellij)\b/i);
    if (editorM) memory.addNode('app_preference', 'Uses ' + editorM[1] + ' as code editor', 0.8, { implicit: true });

    const pathM = msg.match(/([A-Z]:\\[\w\\. -]{5,60})/gi);
    if (pathM) {
      for (const path of pathM.slice(0, 3)) {
        memory.addNode('folder', 'Uses path: ' + path.trim(), 0.65, { implicit: true });
      }
    }

    const projM = msg.match(/(?:working on|my project|my app|building|developing)\s+(.{5,60})/i);
    if (projM) memory.addNode('task', 'Working on: ' + projM[1].trim(), 0.8);

    if (/i (love|like|prefer|enjoy|hate|dislike|don.t like)\s+(.{3,60})/i.test(msg)) {
      memory.addNode('preference', msg.substring(0, 120).trim(), 0.65);
    }

    const langM = msg.match(/\b(python|javascript|typescript|rust|go|golang|java|c\+\+|c#|ruby|swift|kotlin|php)\b/i);
    if (langM) memory.addNode('skill', 'Works with ' + langM[1], 0.7, { implicit: true });

    if (/\bgit\b/i.test(msg)) memory.addNode('workflow', 'Uses Git for version control', 0.7, { implicit: true });
    if (/\bdocker\b/i.test(msg)) memory.addNode('workflow', 'Uses Docker containers', 0.7, { implicit: true });
    if (/\bnpm\b|\byarn\b|\bpnpm\b/i.test(msg)) memory.addNode('workflow', 'Works with Node.js/npm', 0.7, { implicit: true });
    if (/\bwsl\b/i.test(msg)) memory.addNode('workflow', 'Uses WSL (Windows Subsystem for Linux)', 0.8, { implicit: true });
    if (/\bvpn\b/i.test(msg)) memory.addNode('workflow', 'Uses a VPN', 0.6, { implicit: true });

    if (/\bsteam\b/i.test(msg)) memory.addNode('app_preference', 'Has Steam installed', 0.9, { implicit: true });
    if (/\bepic\b|\bepic games\b/i.test(msg)) memory.addNode('app_preference', 'Has Epic Games installed', 0.85, { implicit: true });

    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 4) memory.addNode('habit', 'Often active late at night', 0.4, { implicit: true });
    if (hour >= 6 && hour <= 9) memory.addNode('habit', 'Often active in the morning', 0.4, { implicit: true });
  },

  extractActionCorrectionFact(text = '') {
    const raw = String(text || '').trim();
    const pathMatch = raw.match(/["'“”]?([A-Za-z]:\\[^"'“”\n\r]+?\.(?:xspf|m3u8?|pls|wpl|mp3|mp4|mkv|avi|mov|wav|flac|ogg|pdf|docx?|xlsx?|pptx?|txt|md|png|jpe?g|webp|gif))["'“”]?/i);
    if (!pathMatch) return null;
    const correctedPath = pathMatch[1].trim().replace(/[.,;!?]+$/g, '');
    const extension = (correctedPath.match(/\.([^.\\/]+)$/) || [])[1]?.toLowerCase() || '';
    const basename = correctedPath.split(/[\\/]/).pop().replace(/\.[^.]+$/i, '').trim();
    const beforePath = raw.slice(0, pathMatch.index || 0);
    const aliasMatch = beforePath.match(/(?:i\s+said|meant|mean|should\s+(?:open|play)|open|play)\s+(?:the\s+)?(?:playlist\s+)?["'“”]?([\w ._-]{2,80})["'“”]?\s*(?:-|—|:|,|$)/i)
      || beforePath.match(/(?:playlist|file)\s+["'“”]?([\w ._-]{2,80})["'“”]?\s*(?:-|—|:|,|$)/i);
    const alias = (aliasMatch?.[1] || basename)
      .trim()
      .replace(/^(?:the\s+)?(?:open|play|launch|start|playlist|file)\s+/i, '')
      .replace(/[\s\-—:,.]+$/g, '')
      .replace(/["'“”]+/g, '')
      .trim();
    if (!alias || !correctedPath) return null;
    const kind = /^(xspf|m3u8?|pls|wpl)$/i.test(extension) ? 'playlist_alias' : 'file_alias';
    return {
      kind,
      alias,
      path: correctedPath,
      fact: `${kind}:${alias.toLowerCase()}=${correctedPath}`
    };
  },

  recordActionOutcome(memory, actionTag, success, detail = '') {
    const type = 'action_outcome';
    if (success) {
      memory.addNode(type, 'Action succeeds: ' + actionTag, 0.85, { implicit: true });
      return;
    }

    const message = 'Action failed: ' + actionTag + (detail ? ' (' + detail.substring(0, 80) + ')' : '');
    memory.addNode(type, message, 0.8, { implicit: false });
    memory._log('Recorded action failure: ' + actionTag);
  },

  learnFromCorrection(memory, wrongAssumption, correction) {
    if (!wrongAssumption || !correction) return;
    const badNode = memory.nodes.find((node) =>
      node.status === 'active' &&
      memory._wordOverlap(node.content, wrongAssumption) > 0.5
    );
    if (badNode) {
      memory._archiveNode(badNode, 'correction', 'user_correction');
      memory._log('Archived wrong node after correction: ' + badNode.content.substring(0, 60));
    }
    memory.addNode('preference', correction.substring(0, 200), 0.9);
    const actionFact = this.extractActionCorrectionFact(correction);
    if (actionFact) {
      memory.addNode(actionFact.kind, actionFact.fact, 0.97, { alias: actionFact.alias, path: actionFact.path, source: 'user_correction' });
      memory._log('Learned action correction: ' + actionFact.fact.substring(0, 90));
    }
    memory._log('Learned from correction: ' + correction.substring(0, 60));
  },

  async maybeAutoCompress(memory) {
    const AUTO_COMPRESS_EVERY = 30;
    if (memory.history.length > 0 && memory.history.length % AUTO_COMPRESS_EVERY === 0) {
      memory._log('Auto-compressing session at ' + memory.history.length + ' turns...');
      try {
        await memory.compressCurrentSession();
      } catch (error) {
        memory._log('Auto-compress error: ' + (error?.message || ''));
      }
    }
    this.maybeReflect(memory);
  },

  async maybeReflect(memory) {
    const MIN_FACTS_FOR_REFLECTION = 5;
    const activeNodes = memory.nodes.filter((node) => node.status === 'active' && !node._absorbed);
    if (activeNodes.length < MIN_FACTS_FOR_REFLECTION) return;
    if (memory._reflecting) return;

    const now = Date.now();
    if (memory._lastReflection && now - memory._lastReflection < 30 * 60 * 1000) return;

    memory._reflecting = true;
    memory._lastReflection = now;

    try {
      const recentFacts = activeNodes
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, 15)
        .map((node) => `[${node.type}] ${node.content}`);

      const prompt = `You are a reflection engine. Given these facts about a user, synthesize 1-3 higher-level OBSERVATIONS or PATTERNS you notice. These should be insights the user might not have explicitly stated.

FACTS:
${recentFacts.join('\n')}

Respond in JSON:
{
  "observations": [
    { "content": "observation text", "confidence": 0.6, "based_on_types": ["type1","type2"] }
  ],
  "nothing": true/false
}

Rules:
- Observations should be HIGHER LEVEL than individual facts (patterns, tendencies, preferences)
- Maximum 3 observations
- confidence 0.5-0.7 for subtle patterns, 0.8+ for obvious ones
- Return nothing=true if no meaningful patterns emerge`;

      const raw = await memory._quickLLMCall(prompt);
      if (!raw) return;

      let parsed;
      try {
        const clean = raw.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        parsed = JSON.parse(clean);
      } catch (_) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;
        try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { return; }
      }

      if (parsed.nothing || !parsed.observations?.length) return;

      for (const observation of parsed.observations) {
        if (!observation.content || observation.content.length < 10) continue;
        const existing = (memory.reflections || []).find((reflection) =>
          memory._wordOverlap(reflection.content, observation.content) > 0.6
        );
        if (existing) continue;

        const reflection = {
          id: memory._uid(),
          content: observation.content,
          confidence: observation.confidence || 0.6,
          status: 'pending',
          based_on_types: observation.based_on_types || [],
          created_at: Date.now(),
          confirmed_at: null,
          promoted_at: null,
        };
        memory.reflections.push(reflection);
        memory._log(`Reflection: "${observation.content.substring(0, 80)}..." (pending)`);
      }

      for (const node of activeNodes.slice(0, 15)) {
        node._absorbed = true;
      }

      this.autoPromoteReflections(memory);
      memory._scheduleSave();
    } catch (error) {
      memory._log('Reflection error: ' + (error?.message || ''));
    } finally {
      memory._reflecting = false;
    }
  },

  autoPromoteReflections(memory) {
    const AUTO_CONFIRM_DAYS = 3;
    const now = Date.now();
    for (const reflection of memory.reflections || []) {
      if (reflection.status === 'pending' && now - reflection.created_at > AUTO_CONFIRM_DAYS * 86400000) {
        reflection.status = 'confirmed';
        reflection.confirmed_at = now;
        memory._log(`Auto-confirmed reflection: "${reflection.content.substring(0, 60)}"`);
      }
      if (reflection.status === 'confirmed' && now - reflection.confirmed_at > AUTO_CONFIRM_DAYS * 86400000) {
        reflection.status = 'promoted';
        reflection.promoted_at = now;
        memory.addNode('observation', reflection.content, Math.min(0.95, reflection.confidence + 0.15), { temporal: 'current' });
        memory._log(`Promoted reflection to permanent memory: "${reflection.content.substring(0, 60)}"`);
      }
    }

    memory.reflections = (memory.reflections || []).filter((reflection) => {
      if (reflection.status === 'denied' || reflection.status === 'promoted') {
        return now - (reflection.promoted_at || reflection.created_at) < 30 * 86400000;
      }
      return true;
    });
  },

  denyReflection(memory, id) {
    const reflection = (memory.reflections || []).find((item) => item.id === id);
    if (!reflection) return;
    reflection.status = 'denied';
    reflection.denied_at = Date.now();
    memory._log(`User denied reflection: "${reflection.content.substring(0, 60)}"`);
    memory._scheduleSave();
  },

  async extractWithLLM(memory, userMsg, aiReply) {
    if (memory._extracting) return;
    memory._extracting = true;
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

      const raw = await memory._quickLLMCall(extractPrompt);
      if (!raw) return;

      let parsed;
      try {
        const clean = raw.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim();
        parsed = JSON.parse(clean);
      } catch (_) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;
        try { parsed = JSON.parse(jsonMatch[0]); } catch (_) { return; }
      }

      if (parsed.nothing || !parsed.facts?.length) return;

      for (const fact of parsed.facts) {
        if (!fact.content || fact.content.length < 5) continue;
        memory.addNode(fact.type || 'general', fact.content, fact.confidence || 0.6, {
          implicit: fact.implicit || false,
          temporal: fact.temporal || 'current',
        });
      }

      if (parsed.working) {
        if (parsed.working.currentTask) memory.working.currentTask = parsed.working.currentTask;
        if (parsed.working.mood) memory.working.mood = parsed.working.mood;
      }
    } finally {
      memory._extracting = false;
    }
  },
};
