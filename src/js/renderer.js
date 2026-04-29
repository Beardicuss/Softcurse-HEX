'use strict';
// ════════════════════════════════════════════════════════════════════════════════
//  Softcurse H.E.X. — Renderer Logic
// ════════════════════════════════════════════════════════════════════════════════
// ── State ─────────────────────────────────────────────────────
let config = null;
let sysStats = { cpu: 0, ram: 0, disk: 0 };
let taskState = {}; // taskId → { status, startTime }
let prevAlerts = {}; // prevent duplicate proactive alerts
let currentMode = 'hex'; // 'hex' or 'cardinal'
window.hexSessionContext = {
  primaryGoal: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  lastUserWasFollowUp: false,
  lastActionTypes: [],
  lastActionSummary: '',
  lastSystemDataSummary: '',
  activeSurface: 'chat',
  lastTouchedAt: null
};

function getLocalizedUserName(name = config?.userName) {
  return window.i18n?.getLocalizedUserName
    ? window.i18n.getLocalizedUserName(name || 'Operator')
    : (name || 'Operator');
}

function getLocalizedUnitName(mode = currentMode, style = 'short') {
  if (window.i18n?.getAssistantName) {
    return window.i18n.getAssistantName(mode, style);
  }
  if (mode === 'cardinal') return 'CARDINAL';
  return style === 'display' ? 'H.E.X.' : 'HEX';
}

function refreshIdentityUI() {
  const label = document.getElementById('mode-label');
  if (label) label.textContent = getLocalizedUnitName(currentMode, 'short');
  document.title = 'Softcurse ' + getLocalizedUnitName(currentMode, 'display');
  buildModeLogo(currentMode);
}

function isLikelyFollowUpMessage(text) {
  const raw = (text || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  if (/^(and|also|then|now|again|next|continue|go on|keep going)\b/.test(lower)) return true;
  if (/^(open|play|click|read|scroll|focus|select|choose|use|try)\s+(it|that|this|them|those|these|one|ones|first|second|third|fourth|fifth|last|next|previous)\b/.test(lower)) return true;
  if (/^(open|play|click|read)\s+(the\s+)?(first|second|third|fourth|fifth|last|next)\b/.test(lower)) return true;
  if (/^(go back|back|forward|refresh|reload|scroll down|scroll up|read the page|close it|click it|open it|play it)$/.test(lower)) return true;
  if (words.length <= 6 && /\b(it|that|this|them|those|these|one|ones|first|second|third|fourth|fifth|last|next|previous|same|there)\b/.test(lower)) return true;
  return false;
}

function extractSessionEntities(text) {
  const source = String(text || '');
  const entities = [];
  const seen = new Set();

  const pushEntity = (value) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(clean);
  };

  (source.match(/https?:\/\/[^\s]+/gi) || []).forEach(pushEntity);
  (source.match(/"([^"]+)"/g) || []).forEach((value) => pushEntity(value.slice(1, -1)));
  (source.match(/\b[A-Z][a-z0-9_-]{2,}\b/g) || []).forEach(pushEntity);

  if (entities.length === 0) {
    const stop = new Set(['open', 'play', 'click', 'read', 'show', 'the', 'this', 'that', 'with', 'from', 'into', 'then', 'also', 'please']);
    source.toLowerCase().split(/[^a-z0-9]+/).forEach((word) => {
      if (word.length >= 4 && !stop.has(word)) pushEntity(word);
    });
  }

  return entities.slice(0, 8);
}

function summarizeActionPlan(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return '';
  return actions.map((action) => {
    const argText = Array.isArray(action.args) && action.args.length > 0
      ? ':' + action.args.join(':')
      : '';
    return action.type + argText;
  }).join(' | ').substring(0, 400);
}

function updateSessionContextForUser(text, browserStatus) {
  const ctx = window.hexSessionContext;
  const followUp = isLikelyFollowUpMessage(text) && (!!ctx.primaryGoal || !!browserStatus?.open);
  const baseGoal = followUp && ctx.primaryGoal ? ctx.primaryGoal : text;

  ctx.lastUserMessage = text;
  ctx.lastUserWasFollowUp = followUp;
  ctx.lastTouchedAt = Date.now();
  ctx.activeSurface = browserStatus?.open ? 'browser' : 'chat';
  if (!followUp || !ctx.primaryGoal) ctx.primaryGoal = text;

  if (window.hexMemory) {
    const taskLine = followUp && ctx.primaryGoal
      ? `${ctx.primaryGoal} | follow-up: ${text}`
      : text;
    window.hexMemory.updateWorking({
      currentTask: taskLine,
      currentEntities: extractSessionEntities(browserStatus?.open
        ? `${baseGoal} ${text} ${browserStatus.title || ''} ${browserStatus.url || ''}`
        : `${baseGoal} ${text}`)
    });
  }
}

function updateSessionContextForAssistant(text, actions) {
  const ctx = window.hexSessionContext;
  ctx.lastAssistantMessage = String(text || '').substring(0, 400);
  ctx.lastActionTypes = Array.isArray(actions) ? actions.map((action) => action.type) : [];
  ctx.lastActionSummary = summarizeActionPlan(actions);
  if (ctx.lastActionTypes.some((type) => type.startsWith('web_') || type.startsWith('browser_'))) {
    ctx.activeSurface = 'browser';
  }
  ctx.lastTouchedAt = Date.now();
}

function updateSessionContextForSystemData(infoResults) {
  const ctx = window.hexSessionContext;
  ctx.lastSystemDataSummary = (infoResults || []).join('\n').substring(0, 700);
  ctx.lastTouchedAt = Date.now();
}

async function getBrowserSessionState() {
  try {
    if (!window.hexAPI?.browser?.status) return { open: false, url: null, title: null };
    const status = await window.hexAPI.browser.status();
    return {
      open: !!status?.open,
      url: status?.url || null,
      title: status?.title || null
    };
  } catch (_) {
    return { open: false, url: null, title: null };
  }
}

async function buildAIContextState(userText) {
  const browserSession = await getBrowserSessionState();
  updateSessionContextForUser(userText, browserSession);

  const recentTurns = window.hexMemory
    ? window.hexMemory.getRecentHistory(4)
    : window.hexAI.history.slice(-4);
  const working = window.hexMemory?.working || {};

  return {
    cpu: sysStats.cpu,
    ram: sysStats.ram,
    disk: sysStats.disk,
    diskUsed: sysStats.diskUsed,
    diskFree: sysStats.diskFree,
    netRx: sysStats.netRx,
    netTx: sysStats.netTx,
    temp: sysStats.temp,
    platform: navigator.platform,
    uptime: document.getElementById('v-uptime')?.textContent,
    userName: getLocalizedUserName(config.userName),
    activeTask: getActiveTask(),
    ttsEngine: config.voice?.ttsEngine || 'os',
    aiProvider: config.llm?.provider || 'none',
    browserSession,
    sessionContext: { ...window.hexSessionContext },
    workingMemory: {
      currentTask: working.currentTask || null,
      currentEntities: Array.isArray(working.currentEntities) ? [...working.currentEntities] : [],
      mood: working.mood || 'neutral'
    },
    recentTurns: recentTurns.map((turn) => ({
      role: turn.role || 'user',
      content: String(turn.content || '').substring(0, 180)
    }))
  };
}

// ── Mode Switcher ─────────────────────────────────────────────
function switchMode(mode) {
  if (mode === 'toggle') mode = currentMode === 'hex' ? 'cardinal' : 'hex';
  if (mode !== 'hex' && mode !== 'cardinal') return;
  if (mode === currentMode) return;
  currentMode = mode;

  const body = document.body;
  const wakeInput = document.getElementById('cfg-wakeword');

  if (mode === 'cardinal') {
    body.classList.add('mode-cardinal');
    if (window.hexVoice) window.hexVoice.wakeWord = 'hey cardinal';
    if (wakeInput) wakeInput.value = 'hey cardinal';
  } else {
    body.classList.remove('mode-cardinal');
    if (window.hexVoice) window.hexVoice.wakeWord = 'hey hex';
    if (wakeInput) wakeInput.value = 'hey hex';
  }
  refreshIdentityUI();

  // Auto-swap personality to match mode
  if (window.hexPersonalities) {
    window.hexPersonalities.activeId = mode === 'cardinal' ? 'cardinal_default' : 'hex_default';
    if (window.hexPersonalities.onUpdate) window.hexPersonalities.onUpdate();
  }

  // Persist mode to config
  if (config) {
    config.mode = mode;
    try { window.hexAPI.setConfig(config); } catch (_) { }
  }

  addLog('SYSTEM', `Mode switched to ${mode.toUpperCase()}`);
  showToast(`◆ ${mode.toUpperCase()} MODE`, `Interface switched to ${mode === 'cardinal' ? 'Cardinal Commander' : 'H.E.X. Cyberpunk'} mode.`, '', 3000);
}

function restoreMode() {
  const saved = config?.mode || 'hex';
  currentMode = saved === 'cardinal' ? 'cardinal' : 'hex';
  if (currentMode === 'cardinal') {
    document.body.classList.add('mode-cardinal');
  } else {
    document.body.classList.remove('mode-cardinal');
  }
  refreshIdentityUI();
}

// ── Shared Logo Builder ───────────────────────────────────────
function buildModeLogo(mode) {
  const title = document.getElementById('app-title');
  if (!title) return;
  title.textContent = '';
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '10px';

  // Icon image with glow background
  const icon = document.createElement('img');
  icon.style.cssText = 'width:28px;height:28px;object-fit:contain;border-radius:4px;';

  if (mode === 'cardinal') {
    icon.src = 'assets/cardinal/cardinal_icon.png';
    icon.style.boxShadow = '0 0 12px rgba(200,57,43,0.6), 0 0 30px rgba(200,57,43,0.2)';
    icon.style.background = 'rgba(200,57,43,0.1)';
  } else {
    icon.src = 'assets/hex.png';
    icon.style.boxShadow = '0 0 12px rgba(0,255,255,0.6), 0 0 30px rgba(0,255,255,0.2)';
    icon.style.background = 'rgba(0,255,255,0.1)';
  }
  title.appendChild(icon);

  // Name text
  const name = document.createElement('span');
  name.textContent = getLocalizedUnitName(mode, 'display');
  name.style.cssText = 'letter-spacing:4px;';
  title.appendChild(name);

  // Hide version badge
  const badge = document.querySelector('.topbar-badge');
  if (badge) badge.style.display = 'none';
}

// ── AUDIO SYSTEM ──────────────────────────────────────────────
window.hexAudio = {
  _sounds: {},
  init() {
    const sfx = {
      processing: 'assets/sounds/processing.wav',
      toast: 'assets/sounds/toast_notify.wav',
      threat: 'assets/sounds/threat_detect.wav',
      mic_on: 'assets/sounds/mic_on.wav',
      action: 'assets/sounds/action_exec.wav',
      reroute: 'assets/sounds/network_reroute.wav',
      hover: 'assets/sounds/ui_hover.wav'
    };
    for (const [key, path] of Object.entries(sfx)) {
      const a = new Audio(path);
      if (key === 'processing') a.loop = true;
      this._sounds[key] = a;
    }

    document.addEventListener('mouseover', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.classList.contains('stab') || e.target.closest('.stab') || e.target.closest('button')) {
        this.play('hover', 0.05);
      }
    });
  },
  play(key, vol = 1.0) {
    if (!this._sounds[key]) return;
    try {
      this._sounds[key].volume = vol;
      this._sounds[key].currentTime = 0;
      this._sounds[key].play().catch(() => { });
    } catch (e) { }
  },
  stop(key) {
    if (!this._sounds[key]) return;
    try {
      this._sounds[key].pause();
      this._sounds[key].currentTime = 0;
    } catch (e) { }
  }
};

// ── Init ──────────────────────────────────────────────────────
async function init() {
  config = await window.hexAPI.getConfig();
  window._hexConfig = config;
  restoreMode();
  window.hexAudio.init();

  // Load i18n — Georgian default
  const lang = config.language || 'ka';
  await window.i18n.load(lang);
  window.i18n.apply();
  refreshIdentityUI();

  // ── Load persistent memory (before AI configure) ──
  window.hexMemory.onLog = (msg) => addLog('HEX', msg);
  await window.hexMemory.load();

  // ── Adaptive Intelligence: Load brain profile + daily reflection ──
  if (window.hexBrain) {
    window.hexBrain.onLog = (msg) => addLog('BRAIN', msg);
    await window.hexBrain.load();
    await window.hexBrain.reflect(); // Daily self-reflection (runs once per day)

    // Summarize session when user closes HEX
    window.addEventListener('beforeunload', () => {
      if (window.hexBrain && window.hexAI && window.hexAI.history) {
        window.hexBrain.summarizeSession(window.hexAI.history);
      }
    });
  }

  // ── Load personalities from config ──
  window.hexPersonalities.load(config);
  window.hexPersonalities.onUpdate = () => refreshPersonaList();
  updatePersonaBadge();

  // Configure subsystems
  window.hexAI.configure(config);

  // ── Auto-select best provider from live key pool ──
  try {
    const liveRes = await window.hexAPI.getLiveKeys();
    if (liveRes && liveRes.success) {
      const PRIORITY = ['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate'];
      const currentP = config.llm?.provider || 'none';
      const hasKey = currentP === 'ollama' || (liveRes.keys[currentP] && liveRes.keys[currentP].length > 0);
      if (!hasKey && currentP !== 'ollama') {
        // Find the first provider with valid keys
        const bestProvider = PRIORITY.find(p => liveRes.keys[p] && liveRes.keys[p].length > 0);
        if (bestProvider) {
          config.llm = config.llm || {};
          config.llm.provider = bestProvider;
          window.hexAI.configure(config);
          addLog('AI', `Auto-selected provider: ${bestProvider.toUpperCase()} (${liveRes.keys[bestProvider].length} valid keys)`);
        }
      }
    }
  } catch (_) { }

  // ── Load plugin action tags for AI prompt injection ──
  try {
    const res = await window.hexAPI.plugins.getActionTags();
    window._hexPluginTags = (res && res.tags) ? res.tags : (Array.isArray(res) ? res : []);
    if (window._hexPluginTags.length > 0) {
      addLog('PLUGINS', `${window._hexPluginTags.length} plugin action(s) registered for AI.`);
    }
  } catch (e) { window._hexPluginTags = []; }

  // Push saved modelsDir to engine before init so it knows where models are
  if (config.voice?.modelsDir) {
    await window.hexAPI.voice.setModelsDir(config.voice.modelsDir).catch(() => { });
  }
  // Await voice init so local engine status is ready before first use
  await window.hexVoice.init({ ...(config.voice || {}), llm: config.llm });

  // Voices may already be loaded (browser cached them before callback was wired).
  // Apply saved name now; onVoicesLoaded will re-apply if they load later.
  if (config.voice?.voiceName && window.hexVoice.getVoices().length > 0) {
    window.hexVoice.setVoiceByName(config.voice.voiceName);
  }

  // When TTS voices finish loading, restore full voice config
  window.hexVoice.onVoicesLoaded = (voices) => {
    addLog('VOICE', `${voices.length} TTS voices loaded`);
    if (config.voice?.voiceName) {
      window.hexVoice.setVoiceByName(config.voice.voiceName);
    }
    // Also restore engine settings (Piper/OS/GCloud) in case this fires late
    window.hexVoice._ttsEngine = config.voice?.ttsEngine || 'os';
    window.hexVoice._localVoiceLang = config.voice?.localVoiceLang || 'en';
    window.hexVoice._localSpeed = config.voice?.localSpeed ?? 1.0;
    window.hexVoice._gcloudKey = config.voice?.gcloudTtsKey || '';
    window.hexVoice._useGCloud = !!(config.voice?.gcloudTtsKey);
    window.hexVoice._gcloudVoice = config.voice?.gcloudVoice || 'ka-GE-Standard-A';
  };
  window.reminders.init();

  // Wire voice callbacks
  window.hexVoice.onTranscript = (text, isFinal) => {
    if (!isFinal) {
      document.getElementById('chat-input').value = text;
    } else {
      document.getElementById('chat-input').value = text;
      addLog('VOICE', `Heard: "${text}"`);
      sendMessage();
    }
  };
  window.hexVoice.onStateChange = (listening) => updateMicUI(listening);
  window.hexVoice.setLanguage(lang);

  // Configure browser module
  window.hexBrowser.onLog = (src, msg) => addLog(src, msg);
  window.hexBrowser.defaultEngine = config.browser?.searchEngine || 'google';
  updateSearchEngineBtn();

  // Wire activity monitor event bus
  HexSystem.on('browser:nav', (d) => addLog('BROWSER', `Navigated: ${d.url}`));

  // Activity monitor
  window.activityMonitor.start();
  window.activityMonitor.onProactiveMessage = (msg) => handleProactiveMsg(msg);

  // System stats
  window.hexAPI.onSystemUpdate((data) => {
    window.hexTaskBus?.push('Updating system telemetry...');
    updateStats(data);
  });

  // Task progress
  window.hexAPI.onTaskProgress((data) => {
    addLog('SYSTEM', data.line, data.isErr ? 'error' : 'info');
  });

  // Wire recurring schedules
  window.hexAPI.on('recurring:fire', (evt) => {
    addLog('HEX', `Recurring task triggered: ${evt.label}`);
    showToast(`Task: ${evt.label}`, 'success');
    window.hexAudio.play('action');

    // Visually drop the command into chat and fire it
    const inp = document.getElementById('chat-input');
    inp.value = evt.command;
    sendMessage();
  });

  // Reminder fires
  window.reminders.onFire = (data) => {
    const label = window.i18n.t('reminder_fire', { label: data.label });
    addHexMessage(label);
    showToast('⏰ REMINDER', data.label, 'warn', 8000);
    addLog('HEX', `Reminder: ${data.label}`);
    speakWithConfig(data.label);
  };

  // IPC log entries
  window.hexAPI.onLogEntry((entry) => {
    addLog(entry.source, entry.message, entry.level);
  });

  // Language buttons — wire + set active
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Hex canvas
  initHexCanvas();
  startHexAnimation();

  // Glitch tears (random)
  setInterval(spawnGlitchTear, 12000);

  // Uptime
  setInterval(() => {
    document.getElementById('v-uptime').textContent = window.activityMonitor.getUptime();
  }, 1000);

  // Greeting
  const name = getLocalizedUserName(config.userName || 'Operator');
  const greet = window.i18n.getRandomWelcomePhrase ? window.i18n.getRandomWelcomePhrase(name) : window.i18n.t('hex_greeting', { name });
  addHexMessage(greet);
  addLog('HEX', 'System initialized. All subsystems nominal.');

  // Init sleep/standby mode
  if (window.hexSleep) window.hexSleep.init();
  // Speak the greeting
  setTimeout(() => {
    if (window.hexVoice && (!config.voice || config.voice.enabled !== false)) {
      window.hexVoice.speak(greet);
    }
  }, 1000);

  // Background Omni-Launcher Scan
  setTimeout(() => {
    addLog('BUTLER', 'Caching local software registry in background...');
    window.hexAPI.butler.scanApps().then(res => {
      if (res.success) {
        window.hexAppCache = res.apps;
        addLog('BUTLER', `Omni-Launcher ready (${res.apps.length} items logged).`);
      }
    }).catch(() => { });
  }, 2000);

  // Auto-resize textarea
  const ta = document.getElementById('chat-input');
  ta.addEventListener('input', () => {
    ta.style.height = '36px';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  });

  // Set uptime from system info
  window.hexAPI.getSystemInfo().then(info => {
    if (info.uptime) {
      const h = Math.floor(info.uptime / 3600);
      const m = Math.floor((info.uptime % 3600) / 60);
      addLog('SYSTEM', `Platform: ${info.os.platform || info.platform} | Uptime: ${h}h ${m}m`);
    }
  });
}

// Clock, telemetry, chat rendering, logs, toasts, and process UI now live in
// dedicated renderer modules. This file remains the coordinator.

window.visionEnabled = false;
window.toggleVision = function () {
  window.visionEnabled = !window.visionEnabled;
  const btn = document.getElementById('vision-btn');
  if (btn) {
    btn.style.filter = window.visionEnabled ? 'drop-shadow(0 0 6px var(--cyan))' : 'grayscale(1)';
    btn.style.color = window.visionEnabled ? 'var(--cyan)' : 'inherit';
  }
  showToast('SYS', 'Vision processing ' + (window.visionEnabled ? 'ENABLED' : 'DISABLED'), 'info', 2000);
};

// ── SEND MESSAGE ──────────────────────────────────────────────
async function sendMessage() {
  const ta = document.getElementById('chat-input');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ''; ta.style.height = '36px';

  addUserMessage(text);
  if (window.nsTrackCommand) window.nsTrackCommand();
  if (window.hexSleep) window.hexSleep.resetIdle(); // Reset sleep timer on interaction
  addLog('VOICE', `User: ${text}`);
  window.hexAudio.play('action', 0.6);

  const preflightBrowserState = await getBrowserSessionState();
  updateSessionContextForUser(text, preflightBrowserState);

  // Check for reminder intent first
  const ri = window.reminders.parseReminderIntent(text);
  if (ri.found) {
    const r = await window.reminders.set(ri.label, ri.delayMs);
    const minLeft = Math.round(ri.delayMs / 60000);
    const msg = window.i18n.t('reminder_set', { label: ri.label, min: minLeft });
    addHexMessage(msg);
    addLog('HEX', `Reminder set: "${ri.label}" in ${minLeft} min`);
    window.hexVoice.speak(msg);
    return;
  }

  // ── Direct command shortcut — executes butler actions instantly without AI ──
  // Handles unambiguous commands so they work even if the LLM forgets the tag
  const directResult = await tryDirectCommand(text);
  if (directResult.handled) return;

  const systemState = await buildAIContextState(text);

  showTyping();
  window.hexTaskBus?.push('Sending message to AI...');
  window.hexAudio.play('processing', 0.5);

  try {
    let visionData = null;
    const browserFollowUp = systemState.browserSession?.open && systemState.sessionContext?.lastUserWasFollowUp;
    if (browserFollowUp && window.hexAPI?.browser?.screenshot) {
      addLog('VISION', 'Capturing active browser session for follow-up reasoning...');
      window.hexTaskBus?.push('Capturing browser session...');
      const snap = await window.hexAPI.browser.screenshot().catch(() => null);
      if (snap?.success && snap.image) {
        visionData = snap.image;
        window._webVisionData = snap.image;
        window._webVisionMeta = {
          url: snap.url || systemState.browserSession.url || null,
          title: snap.title || systemState.browserSession.title || null,
          capturedAt: Date.now(),
          source: 'follow-up'
        };
      }
    }
    if (!visionData && browserFollowUp && window._webVisionData) {
      visionData = window._webVisionData;
    }
    if (!visionData && window.visionEnabled && window.hexAPI && window.hexAPI.captureScreenBase64) {
      addLog('SYS', 'Capturing visual sensor data...');
      window.hexTaskBus?.push('Capturing screen...');
      visionData = await window.hexAPI.captureScreenBase64();
    }

    const result = await window.hexAI.chat(text, systemState, config.language || 'en', visionData);
    hideTyping();
    window.hexAudio.stop('processing');
    const hexText = result.text || '…';
    updateSessionContextForAssistant(hexText, result.actions || []);
    addHexMessage(hexText);
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

    // Trigger asynchronous memory extraction (non-blocking)
    if (window.hexMemory) {
      window.hexMemory.extractFromExchange(text, hexText).catch(console.error);
    }

    // Speak response
    if (config.voice?.enabled !== false) speakWithConfig(hexText);

    // Execute actions — batch independent actions in parallel
    const infoResults = [];
    const SEQUENTIAL_ACTIONS = new Set(['shutdown', 'restart', 'logoff', 'lock_screen',
      'web_navigate', 'web_search', 'web_click', 'web_find_click', 'web_type',
      'web_back', 'web_forward', 'web_refresh', 'web_read', 'web_close', 'web_look']); // must run in order
    const actions = result.actions || [];
    const parallelBatch = [];
    const sequentialQueue = [];
    for (const action of actions) {
      if (SEQUENTIAL_ACTIONS.has(action.type)) sequentialQueue.push(action);
      else parallelBatch.push(action);
    }

    // ActionResult — inline because require() is unavailable in renderer
    const ActionResult = class {
      constructor({ success, action, data, durationMs }) {
        this.success = success; this.action = action;
        this.data = data; this.durationMs = durationMs;
      }
    };

    // Fire parallel batch first
    if (parallelBatch.length > 0) {
      const batchStart = Date.now();
      const promises = parallelBatch.map(async (action) => {
        window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
        const start = Date.now();
        const rawResult = await handleAIAction(action);
        const actionResult = new ActionResult({
          success: rawResult ? (rawResult.success !== false) : true,
          action: action.type,
          data: rawResult?.data || rawResult,
          durationMs: Date.now() - start
        });

        if (actionResult && actionResult.data && typeof actionResult.data === 'string') {
          infoResults.push('[' + action.type.toUpperCase() + ' RESULT]: ' + actionResult.data);
        }
        return actionResult;
      });
      await Promise.allSettled(promises);
      const elapsed = Date.now() - batchStart;
      if (parallelBatch.length > 1) addLog('HEX', `${parallelBatch.length} actions executed in parallel (${elapsed}ms)`);
    }

    // Then sequential actions
    for (const action of sequentialQueue) {
      window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
      const actionResult = await handleAIAction(action);
      if (actionResult && actionResult.data) {
        infoResults.push('[' + action.type.toUpperCase() + ' RESULT]: ' + actionResult.data);
      }
    }

    // If we got real PC data back, do a follow-up AI call so HEX responds intelligently
    // about the ACTUAL data instead of having it appear as a raw system message
    if (infoResults.length > 0) {
      updateSessionContextForSystemData(infoResults);
      showTyping();
      window.hexTaskBus?.push('Processing system data with AI...');
      try {
        const followUp = await window.hexAI.chat(
          'SYSTEM DATA (just retrieved from this PC — use this to answer the user):\n' + infoResults.join('\n'),
          await buildAIContextState(text),
          config.language || 'en',
          window._webVisionData || null,
          800,
          { persistUser: false, persistAssistant: true, extractFacts: false }
        );
        hideTyping();
        const followText = followUp.text || '';
        if (followText && followText !== '…') {
          updateSessionContextForAssistant(followText, followUp.actions || []);
          addHexMessage(followText);
          if (config.voice?.enabled !== false) speakWithConfig(followText);
        }
      } catch (_) { hideTyping(); }
    }
  } catch (e) {
    hideTyping();
    window.hexAudio.stop('processing');
    const errMsg = `Neural link disrupted: ${e?.message || String(e)}`;
    addHexMessage(errMsg);
    addLog('ERROR', errMsg);
  }
}

function getActiveTask() {
  for (const [id, s] of Object.entries(taskState)) {
    if (s.status === 'running') return id;
  }
  return null;
}

// handleAIAction() → moved to actions.js

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── TASKS ─────────────────────────────────────────────────────
async function runTask(taskId) {
  if (taskState[taskId]?.status === 'running') return;

  const isBrowserCache = taskId === 'browser_cache';
  taskState[taskId] = { status: 'running', startTime: Date.now() };
  setTaskStatus(taskId, 'running');
  addLog('SYSTEM', `Task started: ${taskId}`);

  // Speak the start phrase if it exists
  let startPhrase = window.i18n.t(`${taskId}_start_phrase`);
  if (startPhrase && startPhrase !== `${taskId}_start_phrase`) {
    if (typeof speakWithConfig === 'function') speakWithConfig(startPhrase);
    addHexMessage(startPhrase);
  }

  try {
    let result;
    if (isBrowserCache) {
      result = await window.hexAPI.clearBrowserCache();
    } else if (taskId === 'hunter_scan') {
      result = await window.hexAPI.runHunterNow();
    } else {
      result = await window.hexAPI.runTask(taskId);
    }

    const dur = ((Date.now() - taskState[taskId].startTime) / 1000).toFixed(1) + 's';
    taskState[taskId] = { status: result.success ? 'success' : 'error', dur };
    setTaskStatus(taskId, result.success ? 'success' : 'error', dur);

    if (result.success) {
      window.activityMonitor.recordTaskResult(taskId, result, dur);
      updateHealthStats();
      addLog('SYSTEM', `Task ${taskId} completed in ${dur}`);

      const msg = `${taskId.replace(/_/g, ' ')} completed in ${dur}.` +
        (result.freed ? ` Freed: ${result.freed}.` : '') +
        (result.warning ? ` ⚠ ${result.warning}` : '');
      addHexMessage(`**Task complete.** ${msg}`);

      if (result.warning) showToast('◆ ADMIN REQUIRED', result.warning, 'warn', 8000);

      // Speak completion phrase randomly
      let endKey = taskId === 'defender_scan' ? 'scan_complete_clean_phrases' : 'task_complete_phrases';
      let endArr = window.i18n.t(endKey);
      if (Array.isArray(endArr) && endArr.length > 0) {
        let p = endArr[Math.floor(Math.random() * endArr.length)];
        if (typeof speakWithConfig === 'function') speakWithConfig(p);
      }

    } else {
      addLog('ERROR', `Task ${taskId} failed: ${result.error || 'unknown'}`);

      let errArr = window.i18n.t('task_error_phrases');
      if (Array.isArray(errArr) && errArr.length > 0) {
        let p = errArr[Math.floor(Math.random() * errArr.length)];
        if (typeof speakWithConfig === 'function') speakWithConfig(p);
        addHexMessage(`**Warning.** ${taskId.replace(/_/g, ' ')}: ${p}`);
      } else {
        addHexMessage(`**Warning.** ${taskId.replace(/_/g, ' ')} encountered an error. Check the terminal log.`);
      }
    }
  } catch (e) {
    taskState[taskId] = { status: 'error' };
    setTaskStatus(taskId, 'error', '—');
    addLog('ERROR', `Task ${taskId}: ${e?.message || String(e)}`);
  }
}

function setTaskStatus(taskId, status, dur) {
  const badge = document.getElementById(`badge-${taskId}`);
  const prog = document.getElementById(`prog-${taskId}`);
  const btn = document.getElementById(`btn-${taskId}`);
  const lastEl = document.getElementById(`last-${taskId}`);
  const durEl = document.getElementById(`dur-${taskId}`);

  if (badge) {
    badge.className = `status-badge ${status}`;
    badge.textContent = window.i18n.t(status) || status.toUpperCase();
  }

  if (prog) {
    if (status === 'running') {
      prog.className = 'task-progress-bar indeterminate';
    } else if (status === 'success') {
      prog.className = 'task-progress-bar';
      prog.style.width = '100%';
      setTimeout(() => { if (prog) prog.style.width = '0%'; }, 2000);
    } else {
      prog.className = 'task-progress-bar';
      prog.style.width = '0%';
    }
  }

  if (btn) {
    btn.disabled = status === 'running';
    btn.classList.toggle('active', status === 'running');
    btn.textContent = status === 'running' ? window.i18n.t('running') : window.i18n.t('run');
  }

  if (lastEl && status !== 'running') {
    lastEl.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (durEl && dur) durEl.textContent = dur;
}

// == 3D ORB & GLITCH EFFECTS ==
// Extracted to orb.js
// ── VOICE ─────────────────────────────────────────────────────
function toggleMic() {
  window.hexVoice.toggleListening();
}

function updateMicUI(listening) {
  const statusEl = document.getElementById('mic-status');
  const labelEl = document.getElementById('mic-label');
  const micBtn = document.getElementById('mic-btn');
  const key = listening ? 'microphone_on' : 'microphone_off';
  if (labelEl) labelEl.textContent = listening
    ? (window.i18n.t('listening') || 'LISTENING...')
    : (window.i18n.t('microphone_off') || 'MIC OFF');
  statusEl?.classList.toggle('active', listening);
  micBtn?.classList.toggle('active', listening);
  if (listening) {
    addLog('VOICE', 'Voice input active. Listening...');
    window.hexAudio.play('mic_on', 0.8);
  }
}

// ── LANGUAGE ──────────────────────────────────────────────────
async function setLanguage(lang) {
  const prevLang = config.language;
  config.language = lang;
  await window.hexAPI.setConfig({ language: lang });
  await window.i18n.load(lang);
  window.i18n.apply();
  window.hexVoice.setLanguage(lang);
  refreshIdentityUI();

  // Inject a language-barrier marker into history so AI switches cleanly
  // without losing any conversation context or learned knowledge
  if (prevLang && prevLang !== lang && window.hexMemory) {
    const langNames = { en: 'English', ru: 'Russian', ka: 'Georgian' };
    const newLangName = langNames[lang] || 'English';
    // Add a hard language barrier as both user instruction and AI acknowledgement
    window.hexMemory.addTurn('user', `[SYSTEM: Language changed to ${newLangName}. All responses from now on must be exclusively in ${newLangName}. Do not use any words from ${langNames[prevLang] || prevLang} or any other language.]`);
    window.hexMemory.addTurn('assistant', `Understood. Switching to ${newLangName}. All my responses will now be in ${newLangName} only.`);
    addLog('SYSTEM', `Language barrier injected into conversation history.`);
  }

  // Auto-switch to favourite voice for the new language
  if (config.voice?.favouriteVoices?.[lang]) {
    const favVoice = config.voice.favouriteVoices[lang];
    config.voice.localVoiceLang = favVoice;
    window.hexVoice._localVoiceLang = favVoice;
    await window.hexAPI.setConfig({ voice: config.voice });
    addLog('VOICE', `Auto-switched to favourite voice: ${favVoice}`);
  }

  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  addLog('SYSTEM', `Language switched to: ${lang.toUpperCase()}`);
}

// ── SETTINGS ──────────────────────────────────────────────────
const PROVIDER_HINTS = {
  none: { model: '', key: '' },
  ollama: { model: 'llama3  /  mistral  /  phi3', key: '' },
  openai: { model: 'gpt-4o-mini  /  gpt-4o  /  gpt-4-turbo', key: 'sk-...' },
  anthropic: { model: 'claude-haiku-4-5-20251001  /  claude-sonnet-4-6', key: 'sk-ant-...' },
  gemini: { model: 'gemini-2.0-flash  /  gemini-1.5-flash  /  gemini-1.5-pro', key: 'AIza...' },
  grok: { model: 'grok-3-mini  /  grok-3  (click ⬇ FETCH to see your plan\'s models)', key: 'xai-...' },
  openrouter: { model: 'meta-llama/llama-3.1-8b-instruct:free  /  openai/gpt-4o', key: 'sk-or-...' },
  mistral: { model: 'mistral-small-latest  /  mistral-large-latest', key: 'your-key' },
  groq: { model: 'llama-3.1-8b-instant  /  gemma2-9b-it', key: 'gsk_...' },
  together: { model: 'meta-llama/Llama-3-8b-chat-hf', key: 'your-key' },
  cohere: { model: 'command-r-plus  /  command-r', key: 'your-key' },
};

// == SETTINGS UI ==
// Extracted to settings-ui.js

// ── CLOSE OVERLAY ON BACKDROP CLICK ───────────────────────────
document.getElementById('settings-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeSettings();
});
document.getElementById('process-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeProcesses();
});

// ── BROWSER BAR ───────────────────────────────────────────────
const ENGINE_ICONS = { google: '🔍', duckduckgo: '🦆', bing: 'Ⓑ', youtube: '▶', github: '⬡' };

function updateSearchEngineBtn() {
  const btn = document.getElementById('search-engine-btn');
  if (!btn) return;
  const eng = window.hexBrowser.defaultEngine;
  btn.textContent = ENGINE_ICONS[eng] || '🔍';
  btn.title = `Engine: ${eng} (click to cycle)`;
}

function cycleSearchEngine() {
  const engines = window.hexBrowser.engines;
  const cur = window.hexBrowser.defaultEngine;
  const idx = engines.indexOf(cur);
  window.hexBrowser.defaultEngine = engines[(idx + 1) % engines.length];
  updateSearchEngineBtn();
  addLog('BROWSER', `Search engine: ${window.hexBrowser.defaultEngine}`);
}

function handleBrowserKey(e) {
  if (e.key === 'Enter') launchBrowser();
}

async function launchBrowser() {
  const input = document.getElementById('browser-input');
  const raw = input.value.trim();
  if (!raw) return;

  // Try intent parse first
  const intent = window.hexBrowser.parseIntent(raw);
  let result;
  if (intent.type === 'url') result = await window.hexBrowser.open(raw);
  else if (intent.type === 'search') result = await window.hexBrowser.search(intent.value, intent.engine);
  else result = await window.hexBrowser.search(raw); // default: treat as search

  if (result?.success !== false) {
    input.value = '';
    addLog('BROWSER', `Launched: ${raw}`);
  }
}

// ── KEYBOARD SHORTCUTS ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSettings(); closeProcesses(); }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') openSettings();
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') toggleMic();
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault();
    document.getElementById('browser-input')?.focus();
  }
});

// ── CENTRAL SPEAK HELPER — always applies saved config ───────────
// Use this instead of hexVoice.speak() everywhere so rate/pitch/volume
// saved by the user are ALWAYS applied, never the hardcoded defaults.
function speakWithConfig(text) {
  if (!text || config.voice?.enabled === false) return;
  window.hexVoice.speak(text, {
    rate: config.voice?.rate ?? 0.95,
    pitch: config.voice?.pitch ?? 0.85,
    volume: config.voice?.volume ?? 0.9
  });
}

// ── SAVE MEMORY ON EXIT ───────────────────────────────────────
window.addEventListener('beforeunload', () => {
  window.hexMemory?.forceSave();
});

// ── BOOT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

// ════════════════════════════════════════════════════════════════════════════════
//  SETTINGS TABS
// ════════════════════════════════════════════════════════════════════════════════
function switchSettingsTab(tabId) {
  document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.stab').forEach(b => {
    if (b.dataset.tab === tabId) b.classList.add('active');
  });
  // Refresh dynamic content when switching
  if (tabId === 'tab-persona') refreshPersonaList();
  if (tabId === 'tab-memory') refreshMemoryTab();
  if (tabId === 'tab-plugins') {
    if (typeof loadPluginsList === 'function') loadPluginsList();
  }
}

// ════════════════════════════════════════════════════════════════════════════════
//  PERSONALITY UI
// ════════════════════════════════════════════════════════════════════════════════
// == PERSONALITY UI ==
// Extracted to personality-ui.js

// ════════════════════════════════════════════════════════════════════════════════
//  MEMORY TAB UI
// ════════════════════════════════════════════════════════════════════════════════
// == MEMORY UI ==
// Extracted to memory-ui.js

// ════════════════════════════════════════════════════════════════════════════════
//  VOICE MODELS DIR HELPERS
// ════════════════════════════════════════════════════════════════════════════════
async function applyModelsDir() {
  const dir = document.getElementById('cfg-models-dir')?.value?.trim();
  if (!dir) { showToast('◆ MODELS DIR', 'Enter a directory path first.', 'alert', 3000); return; }
  try {
    await window.hexAPI.voice.setModelsDir(dir);
    config.voice = { ...(config.voice || {}), modelsDir: dir };
    addLog('VOICE', 'Models directory set: ' + dir);
    await checkVoiceStatus();
  } catch (e) {
    showToast('◆ MODELS DIR', 'Failed: ' + e.message, 'alert', 5000);
  }
}

async function browseModelsDir() {
  try {
    const dir = await window.hexAPI.voice.browseDir();
    if (!dir) return; // user cancelled
    const input = document.getElementById('cfg-models-dir');
    if (input) input.value = dir;
    config.voice = { ...(config.voice || {}), modelsDir: dir };
    addLog('VOICE', 'Models directory set via browse: ' + dir);
    await checkVoiceStatus();
  } catch (e) {
    showToast('◆ MODELS DIR', 'Browse failed: ' + e.message, 'alert', 5000);
  }
}

async function checkVoiceStatus() {
  const msgEl = document.getElementById('voice-status-msg');
  if (msgEl) msgEl.textContent = 'Checking...';
  try {
    const s = await window.hexAPI.voice.status();
    if (!s.available) {
      if (msgEl) { msgEl.textContent = '✗ Engine unavailable: ' + (s.reason || 'unknown'); msgEl.style.color = 'var(--magenta)'; }
      return;
    }

    const lines = [];
    lines.push('◆ Models dir: ' + (s.modelsDir || '—'));
    lines.push('STT (Whisper): ' + (s.sttReady ? '✓ READY' : '✗ NOT FOUND — files expected:'));
    if (!s.sttReady && s.sttFiles) {
      lines.push('  encoder: ' + s.sttFiles.encoder);
      lines.push('  decoder: ' + s.sttFiles.decoder);
      lines.push('  tokens:  ' + s.sttFiles.tokens);
    }
    lines.push('TTS en: ' + (s.ttsReady?.en ? '✓' : '✗'));
    lines.push('TTS ru: ' + (s.ttsReady?.ru ? '✓' : '✗'));
    lines.push('TTS ka: ' + (s.ttsReady?.ka ? '✓' : '✗'));
    lines.push('piper.exe: ' + (s.hasPiper ? '✓' : '✗ not found'));
    lines.push('sherpa-onnx: ' + (s.hasSherpa ? '✓' : '✗ — run: npm run rebuild'));

    const allGood = s.sttReady && s.hasSherpa;
    if (msgEl) {
      msgEl.textContent = lines.join('\n');
      msgEl.style.color = allGood ? 'var(--cyan)' : 'var(--orange)';
      msgEl.style.whiteSpace = 'pre';
    }
    addLog('VOICE', 'Status check — STT: ' + (s.sttReady ? 'OK' : 'missing') + ' | sherpa: ' + (s.hasSherpa ? 'OK' : 'missing'));
  } catch (e) {
    if (msgEl) { msgEl.textContent = 'Error: ' + e.message; msgEl.style.color = 'var(--magenta)'; }
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// == COMMANDS ==
// Extracted to commands.js
