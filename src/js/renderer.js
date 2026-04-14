'use strict';
// ════════════════════════════════════════════════════════════════════════════════
//  Softcurse H.E.X. — Renderer Logic
// ════════════════════════════════════════════════════════════════════════════════
// ── State ─────────────────────────────────────────────────────
let config = null;
let sysStats = { cpu: 0, ram: 0, disk: 0 };
let taskState = {}; // taskId → { status, startTime }
let prevAlerts = {}; // prevent duplicate proactive alerts

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
  window.hexAudio.init();

  // Load i18n — Georgian default
  const lang = config.language || 'ka';
  await window.i18n.load(lang);
  window.i18n.apply();

  // ── Load persistent memory (before AI configure) ──
  window.hexMemory.onLog = (msg) => addLog('HEX', msg);
  await window.hexMemory.load();

  // ── Load personalities from config ──
  window.hexPersonalities.load(config);
  window.hexPersonalities.onUpdate = () => refreshPersonaList();
  updatePersonaBadge();

  // Configure subsystems
  window.hexAI.configure(config);

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
  const name = config.userName || 'Operator';
  const greet = window.i18n.getRandomWelcomePhrase ? window.i18n.getRandomWelcomePhrase(name) : window.i18n.t('hex_greeting', { name });
  addHexMessage(greet);
  addLog('HEX', 'System initialized. All subsystems nominal.');
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

// ── Clock ──────────────────────────────────────────────────────
let glitchScheduled = 0;

function updateClock() {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  document.getElementById('clock').textContent = time;

  const dateEl = document.getElementById('date-display');
  dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  // Glitch burst every ~8 seconds
  if (now.getSeconds() % 8 === 0 && now.getSeconds() !== glitchScheduled) {
    glitchScheduled = now.getSeconds();
    const el = document.getElementById('clock');
    el.classList.add('glitch-burst');
    setTimeout(() => el.classList.remove('glitch-burst'), 400);
  }
}

// ── Stats ──────────────────────────────────────────────────────
let lastAlertCpu = 0, lastAlertRam = 0;

function updateStats(data) {
  sysStats = data;

  // Vitals strip
  setVitalValue('v-cpu', `${data.cpu}%`, data.cpu > 80 ? (data.cpu > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-ram', `${data.ram}%`, data.ram > 80 ? (data.ram > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-disk', `${data.disk}%`, data.disk > 90 ? 'warn' : '');
  setVitalValue('v-gpu', data.gpu != null ? `${data.gpu}%` : '—', data.gpu > 80 ? (data.gpu > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-gputemp', data.gpuTemp || '—', '');
  setVitalValue('v-netrx', data.netRx || '—', 'net');
  setVitalValue('v-nettx', data.netTx || '—', 'net');
  setVitalValue('v-temp', data.temp || '—', '');

  // Right panel bars
  setBar('bar-cpu', data.cpu, '#bar-cpu');
  setBar('bar-ram', data.ram, '#bar-ram');
  setBar('bar-disk', data.disk, '#bar-disk');

  // Proactive alerts (throttled to once per 5 min)
  const now = Date.now();
  if (data.cpu > 90 && now - lastAlertCpu > 300000) {
    lastAlertCpu = now;
    handleProactiveMsg({ type: 'high_cpu', cpu: data.cpu });
  }
  if (data.ram > 90 && now - lastAlertRam > 300000) {
    lastAlertRam = now;
    handleProactiveMsg({ type: 'high_ram', ram: data.ram });
  }
}

function setVitalValue(id, value, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.className = 'vital-value mono' + (cls ? ` ${cls}` : '');
}

function setBar(id, pct, selector) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(pct, 100) + '%';
  el.className = 'stat-bar-fill' + (pct > 90 ? ' high' : pct > 70 ? ' mid' : '');
}

// ── CHAT ──────────────────────────────────────────────────────
function addHexMessage(text) {
  const el = buildChatMsg('hex', text);
  insertMsg(el);
  // Apply simple markdown
  renderMarkdown(el.querySelector('.chat-bubble'));
  scrollChat();
}

function addUserMessage(text) {
  const el = buildChatMsg('user', text);
  insertMsg(el);
  scrollChat();
}

function buildChatMsg(role, text) {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;

  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = role === 'hex' ? window.i18n.t('hex_label') : window.i18n.t('user_label');

  el.innerHTML = `
    <div class="chat-msg-header">
      <span>${label}</span>
      <span>${ts}</span>
    </div>
    <div class="chat-bubble">${escapeHtml(text)}</div>
  `;
  return el;
}

function insertMsg(el) {
  const log = document.getElementById('chat-log');
  const typi = document.getElementById('typing-indicator');
  log.insertBefore(el, typi);
}

function scrollChat() {
  const log = document.getElementById('chat-log');
  log.scrollTop = log.scrollHeight;
}

function showTyping() { document.getElementById('typing-indicator').classList.add('visible'); scrollChat(); }
function hideTyping() { document.getElementById('typing-indicator').classList.remove('visible'); }

// Simple markdown renderer (bold, italic, code, lists)
function renderMarkdown(el) {
  if (!el) return;
  let html = el.textContent || '';
  // code blocks first
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // remove action tags from display
  html = html.replace(/\[ACTION:[^\]]+\]/g, '');
  // newlines
  html = html.replace(/\n/g, '<br>');
  el.innerHTML = html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let visionEnabled = false;
window.toggleVision = function () {
  visionEnabled = !visionEnabled;
  const btn = document.getElementById('vision-btn');
  if (btn) {
    btn.style.filter = visionEnabled ? 'drop-shadow(0 0 6px var(--cyan))' : 'grayscale(1)';
    btn.style.color = visionEnabled ? 'var(--cyan)' : 'inherit';
  }
  showToast('SYS', 'Vision processing ' + (visionEnabled ? 'ENABLED' : 'DISABLED'), 'info', 2000);
};

// ── SEND MESSAGE ──────────────────────────────────────────────
async function sendMessage() {
  const ta = document.getElementById('chat-input');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ''; ta.style.height = '36px';

  addUserMessage(text);
  addLog('VOICE', `User: ${text}`);
  window.hexAudio.play('action', 0.6);

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

  // Build system state for AI context — include everything available
  const systemState = {
    cpu: sysStats.cpu, ram: sysStats.ram,
    disk: sysStats.disk,
    diskUsed: sysStats.diskUsed, diskFree: sysStats.diskFree,
    netRx: sysStats.netRx, netTx: sysStats.netTx,
    temp: sysStats.temp,
    platform: navigator.platform,
    uptime: document.getElementById('v-uptime')?.textContent,
    userName: config.userName,
    activeTask: getActiveTask(),
    ttsEngine: config.voice?.ttsEngine || 'os',
    aiProvider: config.llm?.provider || 'none'
  };

  showTyping();
  window.hexTaskBus?.push('Sending message to AI...');
  window.hexAudio.play('processing', 0.5);

  try {
    let visionData = null;
    if (visionEnabled && window.hexAPI && window.hexAPI.captureScreenBase64) {
      addLog('SYS', 'Capturing visual sensor data...');
      window.hexTaskBus?.push('Capturing screen...');
      visionData = await window.hexAPI.captureScreenBase64();
    }

    const result = await window.hexAI.chat(text, systemState, config.language || 'en', visionData);
    hideTyping();
    window.hexAudio.stop('processing');
    const hexText = result.text || '…';
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
    const SEQUENTIAL_ACTIONS = new Set(['shutdown', 'restart', 'logoff', 'lock_screen']); // must run alone
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
      showTyping();
      window.hexTaskBus?.push('Processing system data with AI...');
      try {
        const followUp = await window.hexAI.chat(
          'SYSTEM DATA (just retrieved from this PC — use this to answer the user):\n' + infoResults.join('\n'),
          systemState, config.language || 'en'
        );
        hideTyping();
        const followText = followUp.text || '';
        if (followText && followText !== '…') {
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

  try {
    let result;
    if (isBrowserCache) {
      result = await window.hexAPI.clearBrowserCache();
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
    } else {
      addLog('ERROR', `Task ${taskId} failed: ${result.error || 'unknown'}`);
      addHexMessage(`**Warning.** ${taskId.replace(/_/g, ' ')} encountered an error. Check the terminal log.`);
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

// ── HEALTH STATS ──────────────────────────────────────────────
function updateHealthStats() {
  const s = window.activityMonitor.stats;
  animateCount('stat-files', s.filesScanned);
  document.getElementById('stat-space').textContent = s.spaceFreed || '0 B';
  animateCount('stat-threats', s.threatsKilled);

  const health = s.sessionHealth || 0;
  animateCount('stat-integrity', health, '%');
  const bar = document.getElementById('integrity-bar');
  if (bar) bar.style.width = health + '%';

  if (health < 80 && (!window._threatPlayed || Date.now() - window._threatPlayed > 60000)) {
    if (window.hexAudio) window.hexAudio.play('threat', 1.0);
    window._threatPlayed = Date.now();
  }

  // Update task run log on right panel
  const logEl = document.getElementById('task-run-log');
  if (logEl && s.tasksRun && Object.keys(s.tasksRun).length > 0) {
    logEl.innerHTML = Object.entries(s.tasksRun).map(([id, info]) =>
      `<div class="task-log-row">
        <span class="task-log-name">${id.replace(/_/g, ' ').toUpperCase()}</span>
        <span class="task-log-meta">${info.count}Ã— · ${info.lastRun || ''}${info.dur ? ' · ' + info.dur : ''}</span>
      </div>`
    ).join('');
  }
}

function animateCount(id, target, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  const dur = 600;
  const steps = 30;
  let i = 0;
  const interval = setInterval(() => {
    i++;
    const val = Math.round(start + diff * (i / steps));
    el.textContent = val.toLocaleString() + suffix;
    el.classList.add('animating');
    if (i >= steps) {
      clearInterval(interval);
      el.textContent = target.toLocaleString() + suffix;
      el.classList.remove('animating');
    }
  }, dur / steps);
}

// ── PROACTIVE MESSAGES ────────────────────────────────────────
function handleProactiveMsg(msg) {
  const lang = config.language || 'en';
  switch (msg.type) {
    case 'break': {
      // Use smart picker: time-aware, anti-repeat, {name}/{min} substitution
      const bText = window.i18n.getRandomBreakSuggestion(config.userName, msg.activeMin);
      addHexMessage(bText);
      showToast('◆ HEX ADVISORY', bText, 'warn', 10000, [
        { label: window.i18n.t('break_dismiss'), action: 'dismiss' },
        { label: window.i18n.t('break_snooze'), action: 'snooze15', cls: 'snooze' }
      ]);
      addLog('HEX', bText);
      if (config.voice?.enabled !== false) speakWithConfig(bText);
      break;
    }

    case 'return':
      const rText = window.i18n.t('return_from_idle', { min: msg.idleMin });
      addHexMessage(rText);
      addLog('HEX', rText);
      break;

    case 'high_cpu':
      const cpuText = `CPU at ${msg.cpu}% — consider closing unused applications.`;
      showToast('◆ SYSTEM ALERT', cpuText, 'alert', 6000);
      addHexMessage(`**High CPU detected** (${msg.cpu}%). Consider closing unused apps.`);
      addLog('SYSTEM', `High CPU: ${msg.cpu}%`, 'warn');
      break;

    case 'high_ram':
      const ramText = `RAM at ${msg.ram}% — memory pressure critical.`;
      showToast('◆ SYSTEM ALERT', ramText, 'alert', 6000);
      addHexMessage(`**Memory pressure** at ${msg.ram}%. You may want to close some programs.`);
      addLog('SYSTEM', `High RAM: ${msg.ram}%`, 'warn');
      break;

    case 'late_night':
      const lnText = `It's ${msg.hour}:xx. You've been running for ${msg.activeMin} min. Rest optimizes performance.`;
      if (!prevAlerts.late_night) {
        prevAlerts.late_night = Date.now();
        addHexMessage(`**Late night protocol.** ${lnText}`);
        showToast('◆ HEX CARES', lnText, 'warn', 10000);
      }
      break;
  }
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(title, body, type = '', duration = 5000, actions = []) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const actionHTML = actions.map(a =>
    `<button class="toast-btn ${a.cls || ''}" onclick="handleToastAction('${a.action}', this.closest('.toast'))">${a.label}</button>`
  ).join('');

  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-body">${body}</div>
    ${actions.length ? `<div class="toast-actions">${actionHTML}</div>` : ''}
  `;

  container.appendChild(toast);
  if (type === 'alert') window.hexAudio.play('threat', 0.6);
  else window.hexAudio.play('toast', 0.6);
  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;
}

function handleToastAction(action, toast) {
  if (action === 'dismiss') dismissToast(toast);
  else if (action === 'snooze15') {
    // Snooze break reminder for 15 min
    window.activityMonitor.sessionStart = Date.now() - 75 * 60000; // rewind to 75 min
    dismissToast(toast);
    addLog('HEX', 'Break reminder snoozed 15 minutes.');
  }
}

function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.classList.add('hiding');
  setTimeout(() => toast.remove(), 300);
}

// ── TERMINAL ──────────────────────────────────────────────────
function addLog(source, message, level = 'info') {
  const el = document.getElementById('terminal-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = document.createElement('div');
  line.className = `log-line src-${source}`;
  line.innerHTML = `<span class="log-ts">[${ts}]</span><span class="log-source">[${source}]</span><span class="log-text">${escapeHtml(String(message).substring(0, 200))}</span>`;
  el.appendChild(line);

  // Auto-prune
  while (el.children.length > 200) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function clearTerminal() {
  const el = document.getElementById('terminal-log');
  el.innerHTML = '';
  addLog('SYSTEM', 'Terminal cleared.');
}

function toggleTerminal() {
  const bottom = document.getElementById('panel-bottom');
  const btn = document.getElementById('terminal-toggle');
  const collapsed = bottom.classList.toggle('terminal-collapsed');
  if (btn) btn.textContent = collapsed ? '▲ SHOW' : '▼ HIDE';
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
  config.language = lang;
  await window.hexAPI.setConfig({ language: lang });
  await window.i18n.load(lang);
  window.i18n.apply();
  window.hexVoice.setLanguage(lang);

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

// ── PROCESSES ─────────────────────────────────────────────────
async function openProcesses() {
  document.getElementById('process-overlay').classList.add('open');
  await refreshProcesses();
}

function closeProcesses() {
  document.getElementById('process-overlay').classList.remove('open');
}

async function refreshProcesses() {
  const list = document.getElementById('process-list');
  list.innerHTML = '<div style="font-family:var(--font-m);font-size:10px;opacity:0.4;padding:8px;">Loading...</div>';

  try {
    const procs = await window.hexAPI.getProcesses();
    list.innerHTML = '';
    procs.forEach(p => {
      const row = document.createElement('div');
      row.className = 'process-row';
      row.innerHTML = `
        <span class="p-pid">${p.pid}</span>
        <span class="p-name" title="${p.name}">${p.name}</span>
        <span class="p-cpu">${p.cpu}%</span>
        <span class="p-mem">${p.mem}</span>
        <button class="p-kill" onclick="killProcess(${p.pid}, '${p.name}')">${window.i18n.t('kill_process')}</button>
      `;
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<div style="font-family:var(--font-m);font-size:10px;color:var(--magenta);padding:8px;">${e?.message || String(e)}</div>`;
  }
}

async function killProcess(pid, name) {
  if (!confirm(`${window.i18n.t('confirm_kill', { name, pid })}`)) return;
  const r = await window.hexAPI.killProcess(pid);
  addLog('SYSTEM', r.success ? `Terminated: ${name} (${pid})` : `Failed to kill ${pid}: ${r.error}`);
  await refreshProcesses();
}

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