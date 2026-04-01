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
      '  Uptime: ' + (state.uptime || '-'),
      '  CPU: ' + (state.cpu || '-') + '%  RAM: ' + (state.ram || '-') + '%  Disk: ' + (state.disk || '-') + '% (' + (state.diskFree || '-') + ' free)',
      '  Network: ↓' + (state.netRx || '-') + ' ↑' + (state.netTx || '-') + '  Temp: ' + (state.temp || '-'),
      '  Platform: ' + (state.platform || '-') + ' | AI: ' + (state.aiProvider || '-') + ' | TTS: ' + (state.ttsEngine || '-'),
      '  Active task: ' + (state.activeTask || 'none'),
      '  NOTE: For detailed PC info, use actions: [ACTION:sys_info] [ACTION:disk_usage] [ACTION:list_processes] [ACTION:get_ip]',
    ].join('\n');

    const actionsBlock = [
      '═══ PC CONTROL & BUTLER ACTIONS ═══',
      'You control this Windows PC by including [ACTION:...] tags in your response.',
      'MANDATORY: When the user asks you to DO something on the PC, include the tag. Put tags at END of message.',
      '',
      'EXAMPLES:',
      '  "open notepad"           → [ACTION:open_app:notepad]',
      '  "open downloads folder"  → [ACTION:open_folder:downloads]',
      '  "take a screenshot"      → [ACTION:screenshot]',
      '  "what is my IP?"         → [ACTION:get_ip]',
      '  "set volume to 40"       → [ACTION:set_volume:40]',
      '  "list desktop files"     → [ACTION:list_dir:desktop]',
      '  "ping google.com"        → [ACTION:ping:google.com]',
      '  "copy file A to B"       → [ACTION:copy:A:B]',
      '',
      'FILE & FOLDER:',
      'IMPORTANT: Use | (pipe) to separate arguments that may contain file paths.',
      '[ACTION:open_folder:ALIAS]                  desktop|documents|downloads|pictures|music|videos|home',
      '[ACTION:open_file:C:\\\\Users\\\\name\\\\file.txt]  open file with default app',
      '[ACTION:list_dir:desktop]                   list directory contents (use alias or full path)',
      '[ACTION:file_info:C:\\\\path\\\\file.txt]        size, dates, type',
      '[ACTION:create_file:NAME.txt:CONTENT]       create text file on Desktop',
      '[ACTION:create_doc:NAME:CONTENT]            create Word document on Desktop',
      '[ACTION:create_folder:C:\\\\path\\\\newfolder]   create folder',
      '[ACTION:copy:C:\\\\source.txt|D:\\\\dest.txt]    copy — use | between src and dest',
      '[ACTION:move:C:\\\\old|D:\\\\new]               move — use | between src and dest',
      '[ACTION:rename:C:\\\\old.txt|C:\\\\new.txt]     rename — use | between old and new',
      '[ACTION:delete:C:\\\\path\\\\file.txt]          move to Recycle Bin (asks confirmation)',
      '[ACTION:delete_perm:C:\\\\path\\\\file.txt]     permanently delete (asks confirmation)',
      '',
      'APPS & PROGRAMS:',
      '[ACTION:open_app:NAME]              notepad|chrome|vscode|spotify|discord|calc|paint|cmd|terminal|steam|epic etc.',
      '[ACTION:launch_game:GAME NAME]      launch any game from Steam, Epic, or installed (e.g. Elden Ring, Minecraft, GTA)',
      '[ACTION:list_games]                 list all installed Steam and Epic games',
      '[ACTION:open_settings]              open HEX settings panel',
      '',
      'SYSTEM INFO:',
      '[ACTION:sys_info]                   OS, CPU, RAM, hostname, uptime',
      '[ACTION:battery]                    battery percentage and charging status',
      '[ACTION:disk_usage:DRIVE]           disk space (e.g. C: or leave blank for all)',
      '[ACTION:list_processes]             top 10 processes by CPU',
      '[ACTION:kill_process:NAME]          kill process by name (asks confirmation)',
      '[ACTION:kill_pid:PID]               kill process by PID',
      '',
      'CLIPBOARD:',
      '[ACTION:get_clipboard]              read clipboard text',
      '[ACTION:set_clipboard:TEXT]         write text to clipboard',
      '[ACTION:clear_clipboard]            empty clipboard',
      '',
      'AUDIO:',
      '[ACTION:set_volume:0-100]           set system volume percentage',
      '[ACTION:mute]                       mute audio',
      '[ACTION:unmute]                     unmute audio',
      '[ACTION:get_volume]                 read current volume',
      '',
      'NETWORK:',
      '[ACTION:get_ip]                     local + public IP addresses',
      '[ACTION:ping:HOST]                  ping a host',
      '[ACTION:flush_dns]                  flush DNS cache',
      '[ACTION:list_wifi]                  scan nearby Wi-Fi networks',
      '',
      'ENVIRONMENT:',
      '[ACTION:get_env:VARNAME]            read environment variable',
      '[ACTION:set_env:VAR:VALUE]          set environment variable',
      '',
      'MAINTENANCE:',
      '[ACTION:clean_temp]                 clean %TEMP% folder',
      '[ACTION:empty_trash]                empty Recycle Bin (asks confirmation)',
      '[ACTION:set_wallpaper:IMAGE_PATH]   set desktop wallpaper',
      '',
      'POWER:',
      '[ACTION:screenshot]                 take screenshot, save to Desktop',
      '[ACTION:lock_screen]                lock workstation',
      '[ACTION:logoff]                     log off current user (asks confirmation)',
      '[ACTION:shutdown]                   shut down PC (asks confirmation)',
      '[ACTION:restart]                    restart PC (asks confirmation)',
      '',
      'SCRIPTING (DANGEROUS — always asks confirmation):',
      '[ACTION:run_ps:POWERSHELL_SCRIPT]   execute PowerShell',
      '[ACTION:run_cmd:COMMAND]            execute CMD command',
      '',
      'UTILITIES:',
      '[ACTION:open_url:URL]               open URL in browser',
      '[ACTION:set_reminder:LABEL:MINUTES] set a reminder',
      '[ACTION:run_defrag] [ACTION:run_scan] [ACTION:clear_cache] [ACTION:open_processes]',
      '',
      'FILE (use | separator for paths with colons/backslashes):',
      '[ACTION:zip:C:\\path\\folder|C:\\out.zip]    compress   [ACTION:unzip:archive.zip|C:\\dest]  extract',
      '',
      'WINDOW CONTROL:',
      '[ACTION:list_windows]                       list all open windows with titles',
      '[ACTION:window:minimize:Chrome]             minimize/maximize/focus/restore/close window by title',
      '[ACTION:send_keys:{ENTER}]                  send keystrokes to active window',
      '[ACTION:mouse_move:960:540]                 move mouse to X,Y  [ACTION:mouse_click:left]  click',
      '[ACTION:paste_clipboard]                    simulate Ctrl+V',
      '[ACTION:get_clipboard_img]                  save clipboard image to file',
      '',
      'NETWORK:',
      '[ACTION:connect_wifi:MySSID:password]       connect to WiFi',
      '[ACTION:net_adapter:Wi-Fi:disable]          enable/disable network adapter',
      '',
      'AUTOMATION:',
      '[ACTION:sleep:3]                            wait 3 seconds',
      '[ACTION:schedule_once:14:30:notepad.exe]    schedule a task at HH:MM',
      '[ACTION:cancel_task:HEX_12345]              cancel scheduled task by name',
      '[ACTION:startup:add:notepad.exe:MyApp]      add/remove from Windows startup',
      '',
      'REGISTRY:',
      '[ACTION:reg_read:HKLM|SOFTWARE\\Microsoft\\Windows\\CurrentVersion|ProductName]',
      '[ACTION:reg_write:HKCU|SOFTWARE\\MyApp|Setting|Value|REG_SZ]  (⚠ confirmation required)',
      '',
      'SOFTWARE:',
      '[ACTION:list_software]                      list all installed programs',
      '[ACTION:check_updates]                      check for updates via winget',
      '[ACTION:install_pkg:vlc]                    install via winget (⚠ confirmation required)',
      '[ACTION:uninstall:VLC media player]         uninstall via winget (⚠ confirmation required)',
      '',
      'PERIPHERALS & MAINTENANCE:',
      '[ACTION:eject_usb:E]                        safely eject USB drive E:',
      '[ACTION:chkdsk:C]                           check disk for errors (⚠ may need reboot)',
      '[ACTION:run:notepad.exe:C:\\file.txt]       run program with arguments',
      '[ACTION:run_as_admin:ipconfig /release]     run as administrator (⚠ UAC dialog)',
      '[ACTION:run_js:Math.round(Math.PI*100)/100] run sandboxed JavaScript and return result',
    ].join('\n');

    const rules = [
      'RULES:',
      '- Respond ONLY in ' + langName + '.',
      '',
      '- You are a REAL PC butler. When told to DO something on this PC, DO IT — include the action tag.',
      '- MANDATORY: The [ACTION:...] tag is what executes commands. Without it, nothing happens.',
      '',
      '⚠ CRITICAL — NEVER FABRICATE PC DATA:',
      '- NEVER guess, invent, or "assume" hardware specs, software, processes, IP addresses, disk usage, or any PC state.',
      '- You do NOT know what is installed, what OS version, what hardware, what is running — you only know what the actions return.',
      '- If the user asks about their PC (software, specs, processes, storage, network): USE ACTIONS, do not guess.',
      '- Wrong answer example: "You have Windows 10, 16GB RAM, Chrome installed" — this is HALLUCINATION. NEVER do this.',
      '- Right answer: trigger the action and let the real data speak: [ACTION:sys_info] [ACTION:list_software] [ACTION:get_ip]',
      '',
      '- For websites: [ACTION:open_url:https://facebook.com]',
      '- For games: [ACTION:launch_game:Elden Ring]',
      '- Keep response text SHORT (1 sentence) + action tag at end.',
      '',
      '- ACTION TAG RULES:',
      '    • App names must NOT include punctuation: [ACTION:open_app:chrome] NOT [ACTION:open_app:chrome.]',
      '    • Put the tag at the very end of your message, after any text.',
      '    • One tag per action. Multiple tags allowed in one response.',
      '',
      '- EXAMPLES:',
      '    User: open steam        → "Opening Steam. [ACTION:open_app:steam]"',
      '    User: open chrome       → "Opening Chrome. [ACTION:open_app:chrome]"',
      '    User: open google       → "Opening Google. [ACTION:open_url:https://google.com]"',
      '    User: launch elden ring → "Launching. [ACTION:launch_game:Elden Ring]"',
      '    User: what games?       → "Checking your libraries. [ACTION:list_games]"',
      '    User: whats on my pc?   → "Let me check. [ACTION:sys_info] [ACTION:list_software]"',
      '    User: my ip?            → "[ACTION:get_ip]"',
      '    User: disk space?       → "[ACTION:disk_usage]"',
      '    User: set volume 50     → "Done. [ACTION:set_volume:50]"',
      '',
      '- If you cannot do something, say so briefly and honestly.',
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
      const inner = m[1].trim();
      const colonIdx = inner.indexOf(':');
      if (colonIdx === -1) {
        actions.push({ type: inner, args: [] });
        continue;
      }
      const type = inner.slice(0, colonIdx).trim();
      const rest = inner.slice(colonIdx + 1);
      // Args split on | for paths, otherwise on :
      // Split args: use | for paths, but preserve https:// URLs intact
      let rawArgs;
      if (rest.includes('|')) {
        rawArgs = rest.split('|');
      } else if (/^https?:\/\//i.test(rest) || rest.split(':').length <= 2) {
        // Single arg (URL or simple value) — don't split
        rawArgs = [rest];
      } else {
        rawArgs = rest.split(':');
      }
      // Clean each arg: trim whitespace AND trailing punctuation that bleeds from AI sentences
      const args = rawArgs.map(function(a){ return a.trim().replace(/[.!?,;]+$/, ''); });
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
