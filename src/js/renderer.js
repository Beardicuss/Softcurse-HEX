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
let currentMode = 'hex'; // unified identity; Cardinal remains a wake-word alias
let voiceSurfaceOverride = null; // null = hologram, 'chat'/'settings' = show normal UI
let voiceAgiHintIndex = 0;
let voiceAgiHintTimer = null;
let voiceCommandListenTimer = null;
window.currentMode = currentMode;

function refreshIdentityUI() {
  const label = document.getElementById('mode-label');
  if (label) label.textContent = 'HEX · QUIET CARDINAL';
  document.title = 'Softcurse HEX - The Quiet Cardinal';
  buildModeLogo('hex');
}

// ── Mode Switcher ─────────────────────────────────────────────
function switchMode(_mode) {
  currentMode = 'hex';
  window.currentMode = currentMode;
  if (window.hexVoice && config?.voice?.wakeWord) {
    window.hexVoice.wakeWord = String(config.voice.wakeWord).toLowerCase();
  }
  const wakeInput = document.getElementById('cfg-wakeword');
  if (wakeInput && config?.voice?.wakeWord) wakeInput.value = config.voice.wakeWord;
  refreshIdentityUI();
  showToast('◆ HEX · QUIET CARDINAL', 'Unified identity active. Wake words: HEX, Cardinal, or your custom word.', '', 2600);
}

function restoreMode() {
  currentMode = 'hex';
  window.currentMode = currentMode;
  if (config) config.mode = 'hex';
  refreshIdentityUI();
}

// ── Shared Logo Builder ───────────────────────────────────────
function buildModeLogo(_mode) {
  const title = document.getElementById('app-title');
  if (!title) return;
  title.textContent = '';
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '12px';

  const icon = document.createElement('img');
  icon.src = 'assets/hex.webp';
  icon.alt = 'HEX';
  icon.style.cssText = 'width:30px;height:30px;object-fit:contain;border-radius:10px;box-shadow:0 0 18px rgba(79,255,240,0.34),0 0 34px rgba(255,95,95,0.14);background:linear-gradient(135deg,rgba(79,255,240,0.12),rgba(255,95,95,0.08));border:1px solid rgba(79,255,240,0.24);';
  title.appendChild(icon);

  const name = document.createElement('span');
  name.textContent = 'H.E.X.';
  name.style.cssText = 'letter-spacing:5px;font-weight:800;color:var(--c-text-primary);text-shadow:0 0 18px rgba(79,255,240,0.32);';
  title.appendChild(name);

  const sub = document.createElement('span');
  sub.textContent = 'THE QUIET CARDINAL';
  sub.style.cssText = 'font-family:var(--font-tactical);font-size:10px;font-weight:600;letter-spacing:3px;color:var(--c-cyan-soft);margin-left:2px;opacity:.82;text-shadow:0 0 14px rgba(79,255,240,.2);';
  title.appendChild(sub);

  const badge = document.querySelector('.topbar-badge');
  if (badge) badge.style.display = 'none';
}

// ── AUDIO SYSTEM ──────────────────────────────────────────────
window.hexAudio = {
  _sounds: {},
  _unlocked: false,
  _warned: false,
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
    for (const [key, soundPath] of Object.entries(sfx)) {
      const a = new Audio(soundPath);
      a.preload = 'auto';
      if (key === 'processing') a.loop = true;
      a.addEventListener('error', () => addLog?.('AUDIO', 'Sound failed to load: ' + key, 'warn'), { once: true });
      try { a.load(); } catch (_) { }
      this._sounds[key] = a;
    }

    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });

    document.addEventListener('mouseover', (e) => {
      if (window.isVoiceAgiActive?.()) return;
      if (e.target.tagName === 'BUTTON' || e.target.classList.contains('stab') || e.target.closest('.stab') || e.target.closest('button')) {
        this.play('hover', 0.18);
      }
    });
  },
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    const a = this._sounds.hover || Object.values(this._sounds)[0];
    if (!a) return;
    const previousVolume = a.volume;
    a.volume = 0.01;
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
      a.volume = previousVolume || 0.4;
      addLog?.('AUDIO', 'Sound system unlocked.');
    }).catch(() => { this._unlocked = false; });
  },
  play(key, vol = 1.0) {
    const sound = this._sounds[key];
    if (!sound) return;
    try {
      const minVol = key === 'hover' ? 0.14 : key === 'processing' ? 0.25 : 0.42;
      sound.volume = Math.max(minVol, Math.min(1, Number(vol) || minVol));
      sound.currentTime = 0;
      sound.play().catch((error) => {
        if (!this._warned) {
          this._warned = true;
          addLog?.('AUDIO', 'Click once in the app to unlock UI sounds: ' + (error?.message || 'play blocked'), 'warn');
        }
      });
    } catch (e) {
      if (!this._warned) {
        this._warned = true;
        addLog?.('AUDIO', 'Sound playback failed: ' + (e?.message || e), 'warn');
      }
    }
  },
  stop(key) {
    const sound = this._sounds[key];
    if (!sound) return;
    try {
      sound.pause();
      sound.currentTime = 0;
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
      const hasKey = currentP === 'ollama' || currentP === 'llamacpp' || (liveRes.providers?.[currentP]?.validKeys > 0);
      if (!hasKey && currentP !== 'ollama' && currentP !== 'llamacpp') {
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
  await window.hexVoice.init({ ...(config.voice || {}), llm: config.llm, performance: config.performance || {} });

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
    window.hexVoice._ttsEngine = (config.voice?.ttsEngine === 'local' && !window.hexPerformancePolicy?.allowLocalTts?.()) ? 'os' : (config.voice?.ttsEngine || 'os');
    window.hexVoice._localVoiceLang = config.voice?.localVoiceLang || 'en';
    window.hexVoice._localSpeed = config.voice?.localSpeed ?? 1.0;
    window.hexVoice._gcloudKey = '';
    window.hexVoice._useGCloud = config.voice?.hasGcloudTtsKey === true;
    window.hexVoice._gcloudVoice = config.voice?.gcloudVoice || 'ka-GE-Standard-A';
  };
  window.reminders.init();
  document.getElementById('voice-agi-exit')?.addEventListener('click', () => window.closeVoiceSurface?.());

  // Wire voice callbacks
async function dispatchVoiceCommand(text, source = 'voice') {
  const input = document.getElementById('chat-input');
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (voiceCommandListenTimer) {
    clearTimeout(voiceCommandListenTimer);
    voiceCommandListenTimer = null;
  }
  if (input) input.value = clean;
  addLog('VOICE', `Voice dispatch (${source}): "${clean}"`);
  updateMicUI(window.hexVoice?.isListening, 'processing');
  try {
    await sendMessage();
    return true;
  } catch (err) {
    addLog('VOICE', 'Command pipeline failed: ' + (err?.message || String(err)), 'warn');
    return false;
  } finally {
    setTimeout(() => {
      const surface = document.getElementById('voice-agi-surface');
      const speaking = surface?.classList.contains('voice-agi-speaking');
      if (window.hexVoice?.isListening && !speaking) updateMicUI(true, window.hexVoice?._isAwakeHeld?.() ? 'awake' : 'standby');
    }, 250);
  }
}

window.dispatchVoiceCommand = dispatchVoiceCommand;

  window.hexVoice.onTranscript = async (text, isFinal) => {
    const input = document.getElementById('chat-input');
    if (!isFinal) {
      if (input) input.value = text;
      return;
    }
    addLog('VOICE', `Heard: "${text}"`);
    await dispatchVoiceCommand(text, 'transcript');
  };
  window.hexVoice.onWakeWord = () => {
    window.hexAudio?.play('mic_on', 0.55);
    addLog('VOICE', 'Wake word detected. Listening for one command.');
    updateMicUI(true, 'listening');
    if (voiceCommandListenTimer) clearTimeout(voiceCommandListenTimer);
    voiceCommandListenTimer = setTimeout(() => {
      voiceCommandListenTimer = null;
      if (window.hexVoice?.isListening) updateMicUI(true, 'standby');
    }, 6500);
  };
  window.hexVoice.onWakeTimeout = () => {
    addLog('VOICE', 'Wake window expired. Returning to standby.');
    if (voiceCommandListenTimer) {
      clearTimeout(voiceCommandListenTimer);
      voiceCommandListenTimer = null;
    }
    if (window.hexVoice?.isListening) updateMicUI(true, window.hexVoice?._isAwakeHeld?.() ? 'awake' : 'standby');
  };
  window.hexVoice.onAwakeStart = (_reason, ms) => {
    if (voiceCommandListenTimer) clearTimeout(voiceCommandListenTimer);
    voiceCommandListenTimer = setTimeout(() => {
      voiceCommandListenTimer = null;
      if (window.hexVoice?.isListening) updateMicUI(true, 'standby');
    }, Number(ms) || 60000);
    if (window.hexVoice?.isListening) updateMicUI(true, 'awake');
  };
  window.hexVoice.onAwakeEnd = () => {
    if (voiceCommandListenTimer) {
      clearTimeout(voiceCommandListenTimer);
      voiceCommandListenTimer = null;
    }
    if (window.hexVoice?.isListening) updateMicUI(true, 'standby');
  };
  window.hexVoice.onRest = () => {
    addLog('VOICE', 'Presence resting. Wake word required again.');
    if (window.hexVoice?.isListening) updateMicUI(true, 'standby');
  };
  window.hexVoice.onSpeakStart = () => {
    if (window.hexVoice?.isListening) window.setVoiceAgiState?.('speaking');
  };
  window.hexVoice.onSpeakEnd = () => {
    if (window.hexVoice?.isListening) window.setVoiceAgiState?.(window.hexVoice?._isAwakeHeld?.() ? 'awake' : 'standby');
  };
  window.hexVoice.onStateChange = (listening) => updateMicUI(listening, listening ? 'standby' : 'off');
  window.hexVoice.setLanguage(lang);
  updateMicUI(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off');

  if (!config.voice || config.voice.enabled !== false) {
    setTimeout(() => {
      if (!window.hexVoice?.isListening) {
        window.hexVoice.startListening(true)
          .then(() => updateMicUI(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off'))
          .catch((err) => {
            addLog('VOICE', 'Microphone autostart failed: ' + (err?.message || String(err)));
          });
      }
    }, 900);
  }

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
    if (window.hexPerformancePolicy?.allowTelemetryUiChatter?.({ stats: data })) window.hexTaskBus?.push('Updating system telemetry...');
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
  window._hexIntervals.push(setInterval(() => { if (window.hexPerformancePolicy?.allowDecorativeEffects?.()) spawnGlitchTear(); }, 12000));

  // Uptime
  window._hexIntervals.push(setInterval(() => {
    if (window.isVoiceAgiActive?.()) return;
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

  // Late voice AGI startup reconciliation: some STT backends report active after init settles.
  setTimeout(() => updateMicUI(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off'), 1800);

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
function setVoiceAgiSurface(listening, mode = 'standby') {
  const surface = document.getElementById('voice-agi-surface');
  const app = document.getElementById('app');
  const stateEl = document.getElementById('voice-agi-state');
  const hintEl = document.getElementById('voice-agi-hint');
  const shouldShow = !!listening && !voiceSurfaceOverride;
  const roots = [document.documentElement, document.body, app, surface].filter(Boolean);
  const states = ['voice-agi-standby', 'voice-agi-awake', 'voice-agi-listening', 'voice-agi-processing', 'voice-agi-action', 'voice-agi-speaking'];
  for (const root of roots) {
    root.classList.toggle('voice-agi-mode', shouldShow);
    for (const state of states) root.classList.remove(state);
    if (shouldShow) root.classList.add(`voice-agi-${mode}`);
  }
  if (surface) {
    surface.classList.toggle('voice-agi-visible', shouldShow);
    surface.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }
  if (shouldShow) {
    stopHexAnimation?.();
    startVoiceAgiAnimation?.();
  } else {
    stopVoiceAgiAnimation?.();
    startHexAnimation?.();
  }
  if (!shouldShow) return;
  const labels = {
    standby: 'STANDBY',
    awake: 'AWAKE',
    listening: 'LISTENING',
    processing: 'PROCESSING',
    action: 'EXECUTING',
    speaking: 'SPEAKING'
  };
  if (stateEl) stateEl.textContent = labels[mode] || 'ONLINE';
  updateVoiceAgiHint(mode, true);
  ensureVoiceAgiHintCycle(mode);
}

function getVoiceAgiHints(mode = 'standby') {
  if (mode === 'awake') return ['Awake for follow-ups. You can speak without the wake word for 60 seconds.', 'Say take a break, rest for now, or disappear to return to quiet standby.', 'Follow-up channel is open: ask naturally, or say open chat/show interface.'];
  if (mode === 'speaking') return ['HEX is responding. Say show interface if you want the full cockpit.', 'Voice output active. Say voice mode off to stop listening after this.', 'Tip: show interface keeps microphone online while revealing the full UI.'];
  const wakeWord = window.hexVoice?.wakeWord || config?.voice?.wakeWord || 'hex';
  const pressure = window.hexPerformancePolicy?.isSystemUnderPressure?.(window.sysStats) ? 'System load is high. Prefer short commands until vitals stabilize.' : null;
  const base = mode === 'listening'
    ? [
      'Command channel open. Speak naturally.',
      'Try: open YouTube and search for Eminem.',
      'Try: open settings, then say open chat to return.',
      'Try: open second file after a search result list.',
      'Say: voice mode off to shut down the microphone and return to cockpit.'
    ]
    : [
      `Wake word: ${wakeWord}. Then give one clear command.`,
      'Useful: open settings, open chat, search browser, launch an app.',
      'Follow-up ready: after results, say open first file or open third video.',
      'Browser continuity is active: say open third video after a YouTube search.',
      'Say: voice mode off to leave this surface and stop listening.'
    ];
  return pressure ? [pressure, ...base] : base;
}

function updateVoiceAgiHint(mode = 'standby', immediate = false) {
  const hintEl = document.getElementById('voice-agi-hint');
  if (!hintEl) return;
  const hints = getVoiceAgiHints(mode);
  const next = hints[voiceAgiHintIndex % hints.length];
  voiceAgiHintIndex += 1;
  if (immediate) {
    hintEl.textContent = next;
    hintEl.classList.remove('hint-swap');
    return;
  }
  hintEl.classList.add('hint-swap');
  setTimeout(() => {
    hintEl.textContent = next;
    hintEl.classList.remove('hint-swap');
  }, 220);
}

function ensureVoiceAgiHintCycle(mode = 'standby') {
  if (voiceAgiHintTimer) return;
  voiceAgiHintTimer = setInterval(() => {
    const surface = document.getElementById('voice-agi-surface');
    if (!surface?.classList.contains('voice-agi-visible')) return;
    const activeMode = surface.classList.contains('voice-agi-awake') ? 'awake'
      : surface.classList.contains('voice-agi-listening') ? 'listening'
      : surface.classList.contains('voice-agi-speaking') ? 'speaking'
        : surface.classList.contains('voice-agi-processing') ? 'processing'
          : surface.classList.contains('voice-agi-action') ? 'action'
            : mode;
    updateVoiceAgiHint(activeMode);
  }, 5000);
}

function updateVoiceAgiHealth(data = window.sysStats || {}) {
  const surface = document.getElementById('voice-agi-surface');
  if (!surface) return;
  const cpu = Number(data.cpu || 0);
  const ram = Number(data.ram || 0);
  const disk = Number(data.disk || 0);
  const health = Number(window.activityMonitor?.stats?.sessionHealth ?? 100);
  const critical = cpu >= 92 || ram >= 92 || disk >= 96 || health < 65;
  const warning = cpu >= 78 || ram >= 82 || disk >= 90 || health < 82;
  surface.classList.toggle('voice-health-critical', critical);
  surface.classList.toggle('voice-health-danger', critical);
  surface.classList.toggle('voice-health-warning', !critical && warning);
}

window.setVoiceAgiHealth = updateVoiceAgiHealth;
window.isVoiceAgiActive = function () {
  return document.getElementById('voice-agi-surface')?.classList.contains('voice-agi-visible') === true;
};

window.setVoiceAgiState = function (mode = 'standby') {
  setVoiceAgiSurface(window.hexVoice?.isListening, mode);
};

window.openVoiceSurface = function () {
  voiceSurfaceOverride = null;
  if (window.hexVoice && !window.hexVoice.isListening) {
    window.hexVoice.startListening?.(true)
      ?.then?.(() => updateMicUI(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off'))
      ?.catch?.((err) => addLog?.('VOICE', 'Ghost Deck activation failed: ' + (err?.message || String(err)), 'warn'));
  }
  setVoiceAgiSurface(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off');
};

window.closeVoiceSurface = function () {
  voiceSurfaceOverride = 'chat';
  if (window.hexVoice?.isListening) window.hexVoice.stopListening?.();
  updateMicUI(false, 'off');
  setTimeout(() => document.getElementById('chat-input')?.focus(), 30);
};

window.showInterfaceSurface = function () {
  voiceSurfaceOverride = 'chat';
  setVoiceAgiSurface(false, 'off');
  if (window.hexVoice?.isListening) {
    const labelEl = document.getElementById('mic-label');
    const statusEl = document.getElementById('mic-status');
    const micBtn = document.getElementById('mic-btn');
    if (labelEl) labelEl.textContent = 'STANDBY';
    statusEl?.classList.remove('active');
    statusEl?.classList.add('standby');
    micBtn?.classList.add('active');
  }
  setTimeout(() => document.getElementById('chat-input')?.focus(), 30);
};

window.hideInterfaceSurface = function () {
  voiceSurfaceOverride = null;
  setVoiceAgiSurface(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off');
};

window.openChatSurface = function () {
  window.showInterfaceSurface?.();
};

window.openSettingsSurface = function () {
  voiceSurfaceOverride = 'settings';
  setVoiceAgiSurface(false, 'off');
  if (typeof openSettings === 'function') openSettings();
};

window.closeSettingsSurface = function () {
  if (typeof closeSettings === 'function') closeSettings();
  if (window.hexVoice?.isListening) {
    voiceSurfaceOverride = null;
    setVoiceAgiSurface(true, 'standby');
  } else {
    voiceSurfaceOverride = 'chat';
    setVoiceAgiSurface(false, 'off');
  }
};
function toggleMic() {
  if (!window.hexVoice?.isListening) voiceSurfaceOverride = null;
  window.hexVoice.toggleListening();
  setTimeout(() => updateMicUI(window.hexVoice?.isListening, window.hexVoice?.isListening ? 'standby' : 'off'), 80);
}

function updateMicUI(listening, mode = null) {
  const statusEl = document.getElementById('mic-status');
  const labelEl = document.getElementById('mic-label');
  const micBtn = document.getElementById('mic-btn');
  const voiceMode = mode || (listening ? 'standby' : 'off');
  if (labelEl) {
    if (!listening || voiceMode === 'off') labelEl.textContent = window.i18n.t('microphone_off') || 'MIC OFF';
    else if (voiceMode === 'listening') labelEl.textContent = window.i18n.t('listening') || 'LISTENING...';
    else labelEl.textContent = 'STANDBY';
  }
  statusEl?.classList.toggle('active', listening && voiceMode === 'listening');
  statusEl?.classList.toggle('standby', listening && voiceMode !== 'listening');
  micBtn?.classList.toggle('active', listening);
  setVoiceAgiSurface(listening, voiceMode);
  if (listening && voiceMode === 'listening') {
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
  if (!text || config.voice?.enabled === false) return Promise.resolve(false);
  return window.hexVoice.speak(text, {
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
  if (tabId === 'tab-brain') {
    if (typeof refreshBrainTelemetryTab === 'function') refreshBrainTelemetryTab();
    if (typeof refreshBrainDatasetInspector === 'function') refreshBrainDatasetInspector();
  }
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
