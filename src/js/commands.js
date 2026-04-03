'use strict';
// == commands.js == Direct Command Parser ====================================
// Extracted from renderer.js
//  DIRECT COMMAND PARSER
//  Catches unambiguous PC commands before they reach the AI.
//  Returns { handled: true } if executed, { handled: false } otherwise.
// ════════════════════════════════════════════════════════════════════════════════
async function tryDirectCommand(text) {
  const raw = text.trim();
  const t = raw.toLowerCase();

  const do_ = async (type, args, msg) => {
    if (msg) addHexMessage(msg);
    await handleAIAction({ type, args: args || [] });
    return { handled: true };
  };

  // ── Websites ──────────────────────────────────────────────────────────────
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

  // ── Games ─────────────────────────────────────────────────────────────────
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

  // ── Screenshots ───────────────────────────────────────────────────────────
  if (/^(?:take\s+(?:a\s+)?)?screenshot$/.test(t) || t === 'screen shot' ||
    /^capture\s+(?:the\s+)?(?:screen|desktop)$/.test(t)) {
    return do_('screenshot', [], 'Taking a screenshot...');
  }

  // ── Lock / Power ──────────────────────────────────────────────────────────
  if (/^lock\s+(?:the\s+)?(?:screen|pc|computer|workstation)$/.test(t) || t === 'lock') {
    return do_('lock_screen', [], 'Locking the workstation...');
  }

  // ── Folders ───────────────────────────────────────────────────────────────
  const FOLDERS = { desktop: 1, documents: 1, downloads: 1, pictures: 1, music: 1, videos: 1 };
  const folderM = t.match(/^(?:open|show|go\s+to|show\s+me)\s+(?:my\s+)?(\w+)(?:\s+folder)?$/);
  if (folderM && FOLDERS[folderM[1]]) {
    return do_('open_folder', [folderM[1]], 'Opening ' + folderM[1] + ' folder...');
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  const volM = t.match(/^(?:set\s+(?:the\s+)?volume\s+(?:to\s+)?|volume\s+)(\d+)%?$/);
  if (volM) return do_('set_volume', [volM[1]], 'Setting volume to ' + volM[1] + '%...');
  if (t === 'mute') return do_('mute', [], 'Muting audio...');
  if (t === 'unmute') return do_('unmute', [], 'Unmuting audio...');

  // ── System info ───────────────────────────────────────────────────────────
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

  // ── Open app (general) ────────────────────────────────────────────────────
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
