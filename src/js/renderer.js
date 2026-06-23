'use strict';
// ════════════════════════════════════════════════════════════════════════════════
//  Softcurse H.E.X. — Renderer Logic
// ════════════════════════════════════════════════════════════════════════════════
// ── State ─────────────────────────────────────────────────────
let config = null;
let sysStats = { cpu: 0, ram: 0, disk: 0 };
window.sysStats = sysStats;
let taskState = {}; // taskId → { status, startTime }
let prevAlerts = {}; // prevent duplicate proactive alerts
let currentMode = 'hex'; // 'hex' or 'cardinal'
window.currentMode = currentMode;

function refreshIdentityUI() {
  const label = document.getElementById('mode-label');
  if (label) label.textContent = window.getLocalizedUnitName(currentMode, 'short');
  document.title = 'Softcurse ' + window.getLocalizedUnitName(currentMode, 'display');
  buildModeLogo(currentMode);
}

// ── Mode Switcher ─────────────────────────────────────────────
function switchMode(mode) {
  if (mode === 'toggle') mode = currentMode === 'hex' ? 'cardinal' : 'hex';
  if (mode !== 'hex' && mode !== 'cardinal') return;
  if (mode === currentMode) return;
  currentMode = mode;
  window.currentMode = currentMode;

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
    icon.src = 'assets/cardinal/cardinal_icon.webp';
    icon.style.boxShadow = '0 0 12px rgba(200,57,43,0.6), 0 0 30px rgba(200,57,43,0.2)';
    icon.style.background = 'rgba(200,57,43,0.1)';
  } else {
    icon.src = 'assets/hex.webp';
    icon.style.boxShadow = '0 0 12px rgba(0,255,255,0.6), 0 0 30px rgba(0,255,255,0.2)';
    icon.style.background = 'rgba(0,255,255,0.1)';
  }
  title.appendChild(icon);

  // Name text
  const name = document.createElement('span');
  name.textContent = window.getLocalizedUnitName(mode, 'display');
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
      processing: 'assets/sounds/processing.ogg',
      toast: 'assets/sounds/toast_notify.ogg',
      threat: 'assets/sounds/threat_detect.ogg',
      mic_on: 'assets/sounds/mic_on.ogg',
      action: 'assets/sounds/action_exec.ogg',
      reroute: 'assets/sounds/network_reroute.ogg',
      hover: 'assets/sounds/ui_hover.ogg'
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
  await window.hexOnboarding?.init?.();

  // ── Load persistent memory (before AI configure) ──
  window.hexMemory.onLog = (msg) => addLog('HEX', msg);
  await window.hexMemory.load();
  await window.hexCloudSync?.init?.();

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
    const liveRes = await window.hexAPI.getProviderCapabilities();
    if (liveRes && liveRes.success) {
      const currentP = config.llm?.provider || 'none';
      const hasKey = currentP === 'ollama' || (liveRes.providers?.[currentP]?.validKeys > 0);
      if (!hasKey && currentP !== 'ollama') {
        // Find the first provider with valid keys
        const bestProvider = liveRes.capabilities?.activeProvider || Object.values(liveRes.providers || {}).find((item) => item.status === 'ready')?.provider;
        if (bestProvider) {
          config.llm = config.llm || {};
          config.llm.provider = bestProvider;
          window.hexAI.configure(config);
          addLog('AI', `Auto-selected provider: ${bestProvider.toUpperCase()} (${liveRes.providers[bestProvider].validKeys} valid keys)`);
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
    window.hexVoice._gcloudKey = '';
    window.hexVoice._useGCloud = config.voice?.hasGcloudTtsKey === true;
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
  window.hexVoice.onWakeWord = () => {
    window.hexAudio?.play('mic_on', 0.55);
    addLog('VOICE', 'Wake word detected. Listening for one command.');
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
  window._hexIntervals = window._hexIntervals || [];
  window._hexIntervals.push(setInterval(updateClock, 1000));

  // Hex canvas
  initHexCanvas();
  startHexAnimation();

  // Glitch tears (random)
  window._hexIntervals.push(setInterval(spawnGlitchTear, 12000));

  // Uptime
  window._hexIntervals.push(setInterval(() => {
    document.getElementById('v-uptime').textContent = window.activityMonitor.getUptime();
  }, 1000));

  // Greeting
  const name = window.getLocalizedUserName(config.userName || 'Operator');
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

  window.hexPcAwarenessLoop?.start?.();
  window.hexPcBootstrap?.bootstrap?.()
    .then((result) => {
      if (!result) return;
      addLog('SYSTEM', `Local folders/files indexed from startup snapshot (${result.folders} folders, ${result.files} files).`);
    })
    .catch(() => { });

  async function bootstrapPcAwareness() {
    try {
      await Promise.allSettled([
        window.hexPcAwareness?.refreshWindows?.(true),
        window.hexPcAwareness?.refreshProcesses?.(true)
      ]);

      const scanRes = await window.hexAPI.butler.scanApps().catch(() => null);
      if (scanRes?.success && Array.isArray(scanRes.apps)) {
        window.hexAppCache = scanRes.apps;
        window.hexCandidatePublishers?.publishApps?.(scanRes.apps.slice(0, 80));
      }

      const gameResults = await Promise.allSettled([
        window.hexAPI.butler.getSteamGames?.().catch(() => ({ success: false, games: [] })),
        window.hexAPI.butler.getEpicGames?.().catch(() => ({ success: false, games: [] }))
      ]);
      const mergedGames = gameResults
        .filter((entry) => entry.status === 'fulfilled' && entry.value?.success)
        .flatMap((entry) => entry.value.games || []);
      if (mergedGames.length) {
        window.hexCandidatePublishers?.publishGames?.(mergedGames.slice(0, 60));
      }

      const syncedInventory = window.hexPcInventory?.persistNow?.();
      window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
      if (syncedInventory) {
        window.hexCloudSync?.runDetached?.('device inventory sync', () => window.hexCloudSync.syncDeviceInventory(syncedInventory));
      }
      addLog('SYSTEM', 'Desktop awareness bootstrap complete.');
    } catch (error) {
      addLog('SYSTEM', 'Desktop awareness bootstrap failed: ' + (error?.message || String(error)), 'error');
    }
  }
  bootstrapPcAwareness().catch(() => { });

  // Background Omni-Launcher Scan
  setTimeout(() => {
    addLog('BUTLER', 'Caching local software registry in background...');
    window.hexAPI.butler.scanApps().then(res => {
      if (res.success) {
        window.hexAppCache = res.apps;
        window.hexCandidatePublishers?.publishApps?.(res.apps.slice(0, 80));
        window.hexPcInventory?.persistNow?.();
        window.hexPcEntityPromoter?.promoteInventorySnapshot?.();
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
async function sendMessage() { return window.sendHexMessage(); }

// handleAIAction() → moved to actions.js

function handleInputKey(e) { return window.handleInputKey(e); }

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
  if (tabId === 'tab-brain' && typeof refreshBrainTelemetryTab === 'function') refreshBrainTelemetryTab();
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
