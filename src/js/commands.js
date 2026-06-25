'use strict';
// == commands.js == Direct Command Parser ====================================
// Extracted from renderer.js
//  DIRECT COMMAND PARSER
//  Catches unambiguous PC commands before they reach the AI.
//  Returns { handled: true } if executed, { handled: false } otherwise.
// ════════════════════════════════════════════════════════════════════════════════
async function tryDirectCommand(text) {
  const rawInput = text.trim();
  const raw = rawInput.replace(/[\s.!?]+$/g, '').trim();
  const t = raw.toLowerCase();

  const rememberResolvedReference = (resolved) => {
    if (!resolved || !window.hexContextState?.state) return;
    const surface = resolved.surface || (resolved.source === 'browser' ? 'browser' : 'desktop');
    window.hexContextState.state.lastResolvedReference = {
      ...resolved,
      surface,
      source: resolved.source || (surface === 'browser' ? 'browser' : 'desktop-memory')
    };
    window.hexContextState.persist?.();
  };

  const do_ = async (type, args, msg, resolved = null) => {
    if (resolved) rememberResolvedReference(resolved);
    if (typeof updateSessionContextForAssistant === 'function') {
      updateSessionContextForAssistant(msg || '', [{ type, args: args || [] }]);
    }
    if (msg) addHexMessage(msg);
    await handleAIAction({ type, args: args || [] });
    return { handled: true };
  };

  const isReferenceLikeTarget = (target) => {
    const lower = String(target || '').trim().toLowerCase();
    if (!lower) return false;
    if (/^(it|that|this|them|those|these|one|ones|same one|that one|this one)$/.test(lower)) return true;
    if (/^(the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous)\b/.test(lower)) return true;
    if (/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous)\s+(one|result|video|link|button|file|folder|app|game|window|process)\b/.test(lower)) return true;
    if (/^(the\s+)?(same|previous|next)\s+(result|video|link|button|file|folder|app|game|window|process)\b/.test(lower)) return true;
    if (/^(the\s+)?(file|folder|app|game|window|process|result|video|link|button|page)\b/.test(lower) && lower.split(/\s+/).length <= 4) return true;
    return false;
  };


  const sayLocal = (msg) => {
    addHexMessage?.(msg);
    window.hexVoice?.speak?.(msg);
    return { handled: true };
  };

  if (/^(?:what(?:'s| is)?\s+)?(?:the\s+)?time(?:\s+is\s+it)?$/.test(t) || /^what\s+time\s+is\s+it$/.test(t)) {
    const now = new Date();
    return sayLocal(`It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
  }
  if (/^(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:date|day)(?:\s+is\s+it)?(?:\s+today)?$/.test(t) || /^what\s+day\s+is\s+it$/.test(t)) {
    const now = new Date();
    return sayLocal(`Today is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);
  }
  if (/^(?:who\s+am\s+i|what(?:'s| is)\s+my\s+name)$/.test(t)) {
    const name = window._hexConfig?.userName || 'Dante';
    return sayLocal(`You are ${name}.`);
  }
  if (/^(?:who\s+are\s+you|what\s+are\s+you)$/.test(t)) {
    return sayLocal('I am H.E.X., the Quiet Cardinal. Local brain online and listening.');
  }
  // Voice surface / UI navigation commands. These must stay local and instant.
  if (/^(?:open|show|bring\s+up)\s+(?:hex\s+)?settings$/.test(t) || t === 'settings') {
    window.openSettingsSurface?.();
    return { handled: true };
  }
  if (/^(?:open|show|return\s+to|bring\s+back)\s+(?:the\s+)?(?:chat|main\s+chat|normal\s+interface|default\s+interface)$/.test(t)) {
    window.openChatSurface?.();
    return { handled: true };
  }
  if (/^(?:open|show|return\s+to|bring\s+back|enter|activate)\s+(?:the\s+)?(?:voice\s+mode|agi\s+mode|hologram|ghost\s+deck)$/.test(t) || t === 'ghost deck') {
    window.openVoiceSurface?.();
    return { handled: true };
  }
  if (/^(?:close|exit|disable|turn\s+of+f?|switch\s+of+f?|shut\s+down|stop|deactivate)\s+(?:the\s+)?(?:voice\s+mode|voice\s+surface|agi\s+mode|hologram|ghost\s+deck|command\s+deck)$/.test(t) || /^(?:voice\s+mode|voice\s+surface|agi\s+mode|hologram|ghost\s+deck|command\s+deck)\s+(?:off|offline|down)$/.test(t) || /^(?:return\s+to\s+cockpit|back\s+to\s+cockpit|normal\s+interface)$/.test(t)) {
    window.closeVoiceSurface?.();
    addLog?.('VOICE', 'Voice mode offline. Returning to cockpit.');
    return { handled: true };
  }
  const handleResolvedBrowserTarget = async (resolved, sourceText) => {
    if (!resolved) return null;
    const label = resolved.label || resolved.text || resolved.value || 'that item';
    const isNavigate = /^(open|play|click|select|use|go\s+to)\b/i.test(sourceText);
    if (!isNavigate) return null;
    return do_('web_find_click', [label], 'Opening ' + label + ' in browser...', {
      ...resolved,
      surface: 'browser',
      source: resolved.source || 'browser'
    });
  };
  const handleResolvedDesktopTarget = async (resolved, sourceText) => {
    if (!resolved) return null;
    const resolvedKind = resolved.kind || 'file';
    if (resolvedKind === 'game') {
      return do_('launch_game', [resolved.label], `Opening ${resolved.label}...`, resolved);
    }
    if (resolvedKind === 'app') {
      return do_('open_app', [resolved.label], `Opening ${resolved.label}...`, resolved);
    }
    if (resolvedKind === 'folder') {
      const isReveal = /^(show|reveal|locate)\b/i.test(sourceText);
      const msg = isReveal ? `Opening ${resolved.label}...` : `Opening ${resolved.label}...`;
      return do_('open_folder', [resolved.path || resolved.value || resolved.label], msg, resolved);
    }
    if (resolvedKind === 'window') {
      const verb = /^(close)\b/i.test(sourceText) ? 'close' : 'focus';
      const msg = verb === 'close' ? `Closing ${resolved.label}...` : `Focusing ${resolved.label}...`;
      return do_('window', [verb, resolved.label], msg, resolved);
    }
    if (resolvedKind === 'process') {
      return do_('kill_process', [resolved.label], `Terminating ${resolved.label}...`, resolved);
    }

    if (/^(show|reveal|locate)\b/i.test(sourceText)) {
      const folderPath = String(resolved.path || '')
        .substring(0, Math.max(String(resolved.path || '').lastIndexOf('\\'), String(resolved.path || '').lastIndexOf('/')));
      if (folderPath) {
        return do_('open_folder', [folderPath], `Opening folder for ${resolved.label}...`, resolved);
      }
    }
    return do_('open_file', [resolved.path || resolved.value || resolved.label], `Opening ${resolved.label}...`, resolved);
  };

  const tryMixedReference = async () => {
    if (!window.hexReferenceResolver?.resolveMixedReference) return null;
    if (!window.hexReferenceResolver?.isDesktopReferenceCommand?.(raw)) return null;
    const browserOpen = !!window.hexContextState?.getBrowserSessionState?.()?.open;
    const resolved = window.hexReferenceResolver.resolveMixedReference(raw, browserOpen);
    if (!resolved) return null;
    if (resolved.surface === 'browser' || resolved.source === 'browser') {
      return handleResolvedBrowserTarget(resolved, raw);
    }
    return handleResolvedDesktopTarget(resolved, raw);
  };
  const tryDesktopReference = async () => {
    if (!window.hexReferenceResolver?.isDesktopReferenceCommand?.(raw)) return null;
    const lower = raw.toLowerCase();
    const preferredKind = /\b(process|task|service|pid)\b/.test(lower)
      ? 'process'
      : /\b(window|tab)\b/.test(lower)
        ? 'window'
        : /\b(game|steam|epic)\b/.test(lower)
          ? 'game'
          : /\b(app|program|software|browser)\b/.test(lower)
            ? 'app'
            : /\b(folder|directory|location)\b/.test(lower)
              ? 'folder'
              : null;
    const resolved = window.hexReferenceResolver.resolveDesktopReference(raw, preferredKind);
    return handleResolvedDesktopTarget(resolved, raw);
  };

  const resolvedMixedRef = await tryMixedReference();
  if (resolvedMixedRef) return resolvedMixedRef;

  const resolvedDesktopRef = await tryDesktopReference();
  if (resolvedDesktopRef) return resolvedDesktopRef;

  const naturalDesktopOpen = t.match(/^(?:open|show|reveal|locate|focus|close|run|launch|play|use)\s+(.+)$/);
  if (naturalDesktopOpen) {
    const target = naturalDesktopOpen[1].trim();
    if (isReferenceLikeTarget(target)) {
      const preferredKind = /\bwindow\b/.test(target) ? 'window'
        : /\bprocess\b/.test(target) ? 'process'
          : /\bgame\b/.test(target) ? 'game'
            : /\bapp\b/.test(target) ? 'app'
              : /\bfolder\b/.test(target) ? 'folder'
                : /\bfile\b/.test(target) ? 'file'
                  : null;
      const browserOpen = !!window.hexContextState?.getBrowserSessionState?.()?.open;
      const resolved = window.hexReferenceResolver?.resolveMixedReference?.(target, browserOpen)
        || window.hexReferenceResolver?.resolveDesktopReference?.(target, preferredKind);
      const handled = resolved?.surface === 'browser' || resolved?.source === 'browser'
        ? await handleResolvedBrowserTarget(resolved, raw)
        : await handleResolvedDesktopTarget(resolved, raw);
      if (handled) return handled;
    }
  }

  // ── Learn ─────────────────────────────────────────────────────────────────
  const learnM = t.match(/^(?:hex\s+)?(?:learn|study)\s+(.+)$/);
  if (learnM) {
    const topic = learnM[1].trim();
    if (topic.length > 1 && !/^(nothing|me|more|better|faster)$/i.test(topic)) {
      (async () => {
        addHexMessage(`**Initiating knowledge acquisition sequence...**\nScanning data lattice for: **${topic}**\nThis will take a moment — stand by.`);
        try {
          if (!window.hexLearn) throw new Error('Learn module not loaded.');
          const result = await window.hexLearn.learnTopic(topic);
          const pathLine = result.finetunePath
            ? `\nTraining data: \`${result.finetunePath}\` (+${result.pairs} pairs)`
            : '';
          const provLine = result.provider ? ` via **${result.provider}**` : '';
          addHexMessage(
            `**Knowledge acquisition complete.**\n` +
            `Topic: **${result.topic}**${provLine}\n` +
            `Memory nodes retained: **${result.stored}**\n` +
            `Fine-tune pairs written: **${result.pairs}**${pathLine}\n\n` +
            (result.summary ? `> ${result.summary}\n\n` : '') +
            `All data written to long-term memory and fine-tune dataset. I will apply this knowledge automatically in future exchanges.`
          );
        } catch (err) {
          addHexMessage(`**Learning sequence failed.**\nFault: ${err.message}`);
        }
      })();
      return { handled: true };
    }
  }

  const SITES = {
    'facebook': 'https://facebook.com', 'fb': 'https://facebook.com',
    'instagram': 'https://instagram.com', 'insta': 'https://instagram.com',
    'youtube': 'https://youtube.com', 'yt': 'https://youtube.com',
    'google': 'https://google.com',
    'twitter': 'https://twitter.com', 'x': 'https://x.com',
    'reddit': 'https://reddit.com',
    'gmail': 'https://mail.google.com',
    'github': 'https://github.com',
    'netflix': 'https://netflix.com',
    'twitch': 'https://twitch.tv',
    'amazon': 'https://amazon.com',
    'wikipedia': 'https://wikipedia.org',
    'linkedin': 'https://linkedin.com',
    'tiktok': 'https://tiktok.com',
    'whatsapp': 'https://web.whatsapp.com',
    'chatgpt': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
    'perplexity': 'https://perplexity.ai',
    'gemini': 'https://gemini.google.com',
  };

  const siteSearchM = t.match(/^(?:open|go\s+to|visit|browse\s+to)\s+([a-z0-9 ._-]+?)\s+(?:and\s+)?(?:search|find|look\s+for)\s+(?:for\s+)?(.+)$/i);
  if (siteSearchM) {
    const siteName = siteSearchM[1].trim().replace(/^the\s+/, '');
    const query = siteSearchM[2].trim().replace(/^the\s+/, '');
    if (SITES[siteName] && query) {
      return do_('web_search', [SITES[siteName], query], 'Opening ' + siteName + ' and searching for ' + query + '...');
    }
  }

  const openM = t.match(/^(?:open|go\s+to|show\s+me|visit|browse\s+to)\s+(.+)$/);
  if (openM) {
    const target = openM[1].trim();
    if (SITES[target]) return do_('open_url', [SITES[target]], 'Opening ' + target + '...');
    if (/^[a-z0-9-]+\.(com|org|net|io|dev|app|co|tv|gg|ai|me)/i.test(target) ||
      /^https?:\/\//i.test(target) || /^www\./i.test(target)) {
      const url = /^https?:\/\//i.test(target) ? target : 'https://' + target.replace(/^www\./, '');
      return do_('open_url', [url], 'Opening ' + url + '...');
    }
  }
  if (/^(https?:\/\/|www\.)[^\s]+$/i.test(t)) {
    const url = /^https?:\/\//i.test(t) ? raw : 'https://' + raw;
    return do_('open_url', [url], 'Opening ' + url + '...');
  }

  const gameM = t.match(/^(?:launch|play|start|run)\s+(.+)$/);
  if (gameM) {
    const target = gameM[1].trim();
    const GAME_NAMES = ['minecraft', 'roblox', 'gta', 'cs2', 'csgo', 'pubg', 'fortnite', 'valorant',
      'overwatch', 'elden ring', 'hogwarts', 'cyberpunk', 'witcher', 'fallout', 'skyrim', 'sims',
      'dota', 'tf2', 'halo', 'destiny', 'diablo', 'rocket league', 'among us', 'terraria', 'stardew',
      'celeste', 'hollow knight', 'portal', 'half-life', 'bioshock', 'dark souls', 'sekiro',
      'god of war', 'red dead', 'total war', 'civilization', 'cities skylines'];
    const GAME_WORDS = ['ring', 'souls', 'craft', 'wars', 'legend', 'duty', 'strike', 'fort', 'apex',
      'dota', 'rust', 'ark', 'war', 'saga', 'quest', 'blade', 'hero', 'dragon', 'knight', 'empire'];
    const looksLikeGame = GAME_NAMES.some(function (g) { return target.includes(g); }) ||
      GAME_WORDS.some(function (w) { return target.includes(w); });
    if (looksLikeGame) {
      return do_('launch_game', [target], 'Searching for ' + target + ' in your game libraries...');
    }
  }

  if (/^(?:take\s+(?:a\s+)?)?screenshot$/.test(t) || t === 'screen shot' ||
    /^capture\s+(?:the\s+)?(?:screen|desktop)$/.test(t)) {
    return do_('screenshot', [], 'Taking a screenshot...');
  }

  if (/^lock\s+(?:the\s+)?(?:screen|pc|computer|workstation)$/.test(t) || t === 'lock') {
    return do_('lock_screen', [], 'Locking the workstation...');
  }

  const FOLDERS = { desktop: 1, documents: 1, downloads: 1, pictures: 1, music: 1, videos: 1 };
  const folderM = t.match(/^(?:open|show|go\s+to|show\s+me)\s+(?:my\s+)?(\w+)(?:\s+folder)?$/);
  if (folderM && FOLDERS[folderM[1]]) {
    return do_('open_folder', [folderM[1]], 'Opening ' + folderM[1] + ' folder...');
  }

  const volM = t.match(/^(?:set\s+(?:the\s+)?volume\s+(?:to\s+)?|volume\s+)(\d+)%?$/);
  if (volM) return do_('set_volume', [volM[1]], 'Setting volume to ' + volM[1] + '%...');
  if (t === 'mute') return do_('mute', [], 'Muting audio...');
  if (t === 'unmute') return do_('unmute', [], 'Unmuting audio...');

  if (/^(?:show\s+)?(?:system\s+info|sysinfo|system\s+information)$/.test(t))
    return do_('sys_info', [], 'Fetching system info...');
  if (/^(?:show\s+)?(?:disk\s+usage|disk\s+space|storage)$/.test(t))
    return do_('disk_usage', [], 'Checking disk usage...');
  if (/^(?:what.s\s+my\s+ip|show\s+ip|my\s+ip|what\s+is\s+my\s+ip)$/.test(t))
    return do_('get_ip', [], 'Looking up your IP addresses...');
  if (/^(?:show\s+)?(?:running\s+)?processes?$/.test(t) || t === 'what is running')
    return do_('list_processes', [], 'Fetching running processes...');
  if (/^(?:list|show)\s+(?:my\s+)?games?$/.test(t))
    return do_('list_games', [], 'Scanning your game libraries...');
  if (/^(?:show|get)\s+clipboard$/.test(t) || t === 'what is in clipboard')
    return do_('get_clipboard', [], 'Reading clipboard...');
  if (/^empty\s+(?:the\s+)?(?:trash|recycle\s*bin)$/.test(t))
    return do_('empty_trash', [], 'Emptying the Recycle Bin...');

  const appM = t.match(/^(?:open|launch|start|run)\s+(.+)$/);
  if (appM) {
    const name = appM[1].trim();
    const words = name.split(/\s+/);
    const BAD = new Set(['a', 'an', 'the', 'my', 'some', 'file', 'folder', 'browser',
      'desktop', 'documents', 'downloads', 'pictures', 'music', 'videos', 'settings']);
    if (!BAD.has(name) && words.length <= 3 && !/[?!]/.test(name) &&
      !/\b(can|could|would|should|please|and|or)\b/.test(name)) {
      if (SITES[name]) return do_('open_url', [SITES[name]], 'Opening ' + name + '...');
      const cleanName = name.replace(/[.!?,;]+$/, '').trim();
      return do_('open_app', [cleanName], 'Opening ' + cleanName + '...');
    }
  }

  return { handled: false };
}
