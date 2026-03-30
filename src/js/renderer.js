'use strict';
// ═══════════════════════════════════════════════════════════════
//  Softcurse H.E.X. — Renderer Logic
// ═══════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────
let config = null;
let sysStats = { cpu: 0, ram: 0, disk: 0 };
let taskState = {}; // taskId → { status, startTime }
let prevAlerts = {}; // prevent duplicate proactive alerts

// ── Init ──────────────────────────────────────────────────────
async function init() {
  config = await window.hexAPI.getConfig();

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
  // Push saved modelsDir to engine before init so it knows where models are
  if (config.voice?.modelsDir) {
    await window.hexAPI.voice.setModelsDir(config.voice.modelsDir).catch(() => {});
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
    window.hexVoice._ttsEngine      = config.voice?.ttsEngine      || 'os';
    window.hexVoice._localVoiceLang = config.voice?.localVoiceLang || 'en';
    window.hexVoice._localSpeed     = config.voice?.localSpeed     ?? 1.0;
    window.hexVoice._gcloudKey      = config.voice?.gcloudTtsKey   || '';
    window.hexVoice._useGCloud      = !!(config.voice?.gcloudTtsKey);
    window.hexVoice._gcloudVoice    = config.voice?.gcloudVoice    || 'ka-GE-Standard-A';
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
  window.hexAPI.onSystemUpdate((data) => updateStats(data));

  // Task progress
  window.hexAPI.onTaskProgress((data) => {
    addLog('SYSTEM', data.line, data.isErr ? 'error' : 'info');
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
  const greet = window.i18n.t('hex_greeting', { name });
  addHexMessage(greet);
  addLog('HEX', 'System initialized. All subsystems nominal.');

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

// ── SEND MESSAGE ──────────────────────────────────────────────
async function sendMessage() {
  const ta = document.getElementById('chat-input');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ''; ta.style.height = '36px';

  addUserMessage(text);
  addLog('VOICE', `User: ${text}`);

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

  // Build system state for AI context
  const systemState = {
    cpu: sysStats.cpu, ram: sysStats.ram,
    platform: navigator.platform,
    uptime: document.getElementById('v-uptime')?.textContent,
    userName: config.userName,
    activeTask: getActiveTask()
  };

  showTyping();

  try {
    const result = await window.hexAI.chat(text, systemState, config.language || 'en');
    hideTyping();
    const hexText = result.text || '…';
    addHexMessage(hexText);
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

    // Speak response
    if (config.voice?.enabled !== false) speakWithConfig(hexText);

    // Handle AI-requested actions
    for (const action of (result.actions || [])) {
      await handleAIAction(action);
    }
  } catch (e) {
    hideTyping();
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

async function handleAIAction(action) {
  switch (action.type) {
    // ── System tasks ──
    case 'run_defrag': await runTask('defrag'); break;
    case 'run_scan': await runTask('defender_scan'); break;
    case 'clear_cache': await runTask('browser_cache'); break;
    case 'open_processes': openProcesses(); break;
    case 'check_drivers': await runTask('driver_health'); break;
    case 'run_cleanup': await runTask('disk_cleanup'); break;
    case 'run_network_diag': await runTask('network_diag'); break;
    case 'list_startup': await runTask('startup_apps'); break;
    case 'check_updates': await runTask('update_check'); break;
    case 'check_firewall': await runTask('firewall_status'); break;
    case 'run_memory_diag': await runTask('memory_diag'); break;
    case 'open_settings': openSettings(); break;

    // ── Butler / PC control ──
    case 'open_app':
      if (action.args[0]) {
        const appResult = await window.hexAPI.butler.openApp(action.args[0]);
        if (appResult.success) addLog('BUTLER', `Opened: ${action.args[0]}`);
        else addLog('BUTLER', `Failed to open ${action.args[0]}: ${appResult.error}`, 'error');
      }
      break;

    case 'create_file':
      if (action.args[0]) {
        const content = action.args.slice(1).join(':');
        const fileResult = await window.hexAPI.butler.createFile(action.args[0], content);
        if (fileResult.success) {
          addLog('BUTLER', `Created file: ${fileResult.path}`);
          addHexMessage(`**File created** on your Desktop: \`${action.args[0]}\``);
        } else {
          addLog('BUTLER', `File creation failed: ${fileResult.error}`, 'error');
        }
      }
      break;

    case 'create_doc':
      if (action.args[0]) {
        const docContent = action.args.slice(1).join(':');
        const docResult = await window.hexAPI.butler.createDoc(action.args[0], docContent);
        if (docResult.success) {
          addLog('BUTLER', `Created document: ${docResult.path}`);
          addHexMessage(`**Document created** on your Desktop: \`${action.args[0]}\`${docResult.format === 'rtf' ? ' (RTF format)' : ''}`);
        } else {
          addLog('BUTLER', `Document creation failed: ${docResult.error}`, 'error');
        }
      }
      break;

    case 'open_folder':
      if (action.args[0]) {
        const folderResult = await window.hexAPI.butler.openFolder(action.args[0]);
        if (folderResult.success) addLog('BUTLER', `Opened folder: ${folderResult.path}`);
        else addLog('BUTLER', `Folder error: ${folderResult.error}`, 'error');
      }
      break;

    case 'open_file':
      if (action.args[0]) {
        const openResult = await window.hexAPI.butler.openFile(action.args.join(':'));
        if (openResult.success) addLog('BUTLER', `Opened file: ${openResult.path}`);
        else addLog('BUTLER', `File error: ${openResult.error}`, 'error');
      }
      break;

    case 'empty_trash': {
      const trashResult = await window.hexAPI.butler.emptyTrash();
      if (trashResult.success) addLog('BUTLER', 'Recycle bin emptied.');
      else addLog('BUTLER', `Trash: ${trashResult.error}`);
      break;
    }

    case 'lock_screen': {
      const lockResult = await window.hexAPI.butler.lockScreen();
      if (lockResult.success) addLog('BUTLER', 'Screen locked.');
      break;
    }

    case 'shutdown': {
      const shutResult = await window.hexAPI.butler.shutdown();
      if (shutResult.success) addLog('BUTLER', 'Shutdown initiated.');
      break;
    }

    case 'restart': {
      const restartResult = await window.hexAPI.butler.restart();
      if (restartResult.success) addLog('BUTLER', 'Restart initiated.');
      break;
    }

    // ── Utilities ──
    case 'open_url':
      if (action.args[0]) {
        window.hexBrowser.open(action.args[0]);
      }
      break;

    case 'set_reminder':
      if (action.args.length >= 2) {
        const label = action.args[0];
        const min = parseInt(action.args[1]) || 30;
        await window.reminders.set(label, min * 60000);
      }
      break;
  }
}

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

  // Update task run log on right panel
  const logEl = document.getElementById('task-run-log');
  if (logEl && s.tasksRun && Object.keys(s.tasksRun).length > 0) {
    logEl.innerHTML = Object.entries(s.tasksRun).map(([id, info]) =>
      `<div class="task-log-row">
        <span class="task-log-name">${id.replace(/_/g, ' ').toUpperCase()}</span>
        <span class="task-log-meta">${info.count}× · ${info.lastRun || ''}${info.dur ? ' · ' + info.dur : ''}</span>
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
    case 'break':
      // Pick a random phrase from the varied pool
      const breakPhrases = window.i18n.t('break_suggestions');
      let bText;
      if (Array.isArray(breakPhrases) && breakPhrases.length > 0) {
        const template = breakPhrases[Math.floor(Math.random() * breakPhrases.length)];
        bText = template.replace(/\{min\}/g, msg.activeMin).replace(/\{name\}/g, config.userName || 'Operator');
      } else {
        // Fallback to single phrase
        bText = window.i18n.t('break_suggestion', { min: msg.activeMin });
      }
      addHexMessage(bText);
      showToast('◆ HEX ADVISORY', bText, 'warn', 10000, [
        { label: window.i18n.t('break_dismiss'), action: 'dismiss' },
        { label: window.i18n.t('break_snooze'), action: 'snooze15', cls: 'snooze' }
      ]);
      addLog('HEX', bText);
      if (config.voice?.enabled !== false) speakWithConfig(bText);
      break;

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

// ── HEX CANVAS ANIMATION ──────────────────────────────────────
let hexCtx, hexW, hexH, hexAngle = 0, hexRAF;
const HEX_RINGS = [
  { r: 55, sides: 6, speed: 0.4, color: 'rgba(0,255,200,0.35)', width: 1.5 },
  { r: 42, sides: 6, speed: -0.6, color: 'rgba(0,200,255,0.20)', width: 1 },
  { r: 68, sides: 6, speed: 0.25, color: 'rgba(0,255,200,0.12)', width: 2 },
  { r: 28, sides: 6, speed: 0.9, color: 'rgba(255,0,255,0.15)', width: 1 },
];

function initHexCanvas() {
  const canvas = document.getElementById('hex-canvas');
  hexCtx = canvas.getContext('2d');
  resizeHexCanvas();
  window.addEventListener('resize', resizeHexCanvas);
}

function resizeHexCanvas() {
  const canvas = document.getElementById('hex-canvas');
  const area = document.getElementById('hex-area');
  canvas.width = hexW = area.offsetWidth;
  canvas.height = hexH = area.offsetHeight;
}

function drawHexagon(cx, cy, r, rotation, sides = 6) {
  hexCtx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (Math.PI * 2 * i) / sides;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) hexCtx.moveTo(x, y); else hexCtx.lineTo(x, y);
  }
  hexCtx.closePath();
}

function startHexAnimation() {
  let t = 0;
  function frame() {
    hexRAF = requestAnimationFrame(frame);
    if (!hexCtx) return;
    hexCtx.clearRect(0, 0, hexW, hexH);
    const cx = hexW / 2, cy = hexH / 2;
    t += 0.01;

    // Rotating hex rings
    HEX_RINGS.forEach((ring, i) => {
      hexCtx.save();
      hexCtx.strokeStyle = ring.color;
      hexCtx.lineWidth = ring.width;
      drawHexagon(cx, cy, ring.r, t * ring.speed);
      hexCtx.stroke();

      // Small dots at vertices
      for (let v = 0; v < ring.sides; v++) {
        const angle = t * ring.speed + (Math.PI * 2 * v) / ring.sides;
        const vx = cx + ring.r * Math.cos(angle);
        const vy = cy + ring.r * Math.sin(angle);
        hexCtx.beginPath();
        hexCtx.arc(vx, vy, 2, 0, Math.PI * 2);
        hexCtx.fillStyle = ring.color;
        hexCtx.fill();
      }
      hexCtx.restore();
    });

    // Central glow pulse
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const grd = hexCtx.createRadialGradient(cx, cy, 0, cx, cy, 25);
    grd.addColorStop(0, `rgba(0,255,200,${0.15 * pulse})`);
    grd.addColorStop(1, 'transparent');
    hexCtx.fillStyle = grd;
    hexCtx.fillRect(0, 0, hexW, hexH);

    // Scanning lines
    const lineY = cy - 25 + (Math.sin(t * 1.5) * 20);
    hexCtx.strokeStyle = `rgba(0,255,200,${0.25 * pulse})`;
    hexCtx.lineWidth = 1;
    hexCtx.beginPath();
    hexCtx.moveTo(cx - 60, lineY);
    hexCtx.lineTo(cx + 60, lineY);
    hexCtx.stroke();
  }
  frame();
}

// ── GLITCH TEAR ───────────────────────────────────────────────
function spawnGlitchTear() {
  if (Math.random() > 0.4) return; // 60% skip
  const el = document.createElement('div');
  el.className = 'glitch-tear';
  el.style.top = Math.random() * 80 + 10 + 'vh';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 200);
}

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
  if (listening) addLog('VOICE', 'Voice input active. Listening...');
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

// ── LOCAL VOICE MODEL MANAGEMENT ─────────────────────────────
async function openModelsDir() {
  try {
    const dir = await window.hexAPI.voice.openModelsDir();
    const el = document.getElementById('models-dir-path');
    if (el) el.textContent = dir;
  } catch (e) { console.warn('openModelsDir:', e.message); }
}

async function refreshVoiceStatus() {
  const el = document.getElementById('local-voice-status');
  if (!el) return;
  try {
    const s = await window.hexAPI.voice.status();
    // Show models folder path
    const pathEl = document.getElementById('models-dir-path');
    if (pathEl && s.modelsDir) pathEl.textContent = s.modelsDir;
    const isOllama = window.hexVoice?._ollamaProvider;
    let sttLine;
    if (s.available && s.sttReady)
      sttLine = '<b style="color:var(--cyan)">🎙 Active STT: Local Whisper (offline)</b>';
    else if (isOllama)
      sttLine = '<b style="color:var(--cyan)">🎙 Active STT: Ollama Whisper</b> — run: <code>ollama pull whisper</code>';
    else
      sttLine = '<b style="color:var(--magenta)">⚠ No STT engine — download Whisper below, or set AI provider to Ollama</b>';

    if (!s.available) {
      el.innerHTML = sttLine + '<br><span style="color:var(--muted)">sherpa-onnx not built — run <code>npm run rebuild</code></span>';
      return;
    }
    const stt = s.sttReady ? '✅ Whisper STT' : '❌ Whisper (not downloaded)';
    const en  = s.ttsReady?.en ? '✅ TTS EN' : '❌ TTS EN';
    const ru  = s.ttsReady?.ru ? '✅ TTS RU' : '❌ TTS RU';
    const ka  = s.ttsReady?.ka ? '✅ TTS KA' : '❌ TTS KA';
    el.innerHTML = sttLine + '<br>' + `${stt} &nbsp; ${en} &nbsp; ${ru} &nbsp; ${ka}`;
  } catch (e) {
    el.textContent = 'Status check failed: ' + (e?.message || String(e));
  }
}

async function downloadVoiceModels() {
  const btn = document.getElementById('download-models-btn');
  const progress = document.getElementById('download-progress');
  const fill = document.getElementById('download-progress-fill');
  const label = document.getElementById('download-progress-label');

  const targets = ['stt', 'tts-en', 'tts-ru', 'tts-ka']
    .filter(v => document.getElementById('dl-' + v.replace('tts-', ''))?.checked);

  if (!targets.length) { alert('Select at least one model to download.'); return; }

  btn.disabled = true; btn.textContent = '⏳ Downloading...';
  progress.style.display = 'block'; fill.style.width = '0%';
  label.textContent = 'Starting download...';

  // Wire progress events
  window.hexAPI.voice.onDownloadProgress((p) => {
    const pct = p.pct || 0;
    fill.style.width = pct + '%';
    if (p.stage === 'done') {
      label.textContent = `✅ ${p.name}`;
    } else {
      label.textContent = `[${p.group}] ${p.name} — ${pct}%`;
    }
  });

  try {
    await window.hexAPI.voice.downloadModels(targets);
    label.textContent = '✅ All models downloaded! Restart HEX to activate.';
    fill.style.width = '100%';
    await refreshVoiceStatus();
  } catch (e) {
    label.textContent = '⚠ Download failed: ' + (e?.message || String(e));
    label.style.color = 'var(--magenta)';
  } finally {
    btn.disabled = false; btn.textContent = '⬇ DOWNLOAD SELECTED';
  }
}

async function openSettings() {
  const cfg = config;
  refreshVoiceStatus();
  document.getElementById('cfg-username').value = cfg.userName || '';
  document.getElementById('cfg-language').value = cfg.language || 'ka';
  document.getElementById('cfg-provider').value = cfg.llm?.provider || 'none';
  document.getElementById('cfg-baseurl').value = cfg.llm?.baseUrl || 'http://localhost:11434';
  document.getElementById('cfg-model').value = cfg.llm?.model || '';
  document.getElementById('cfg-apikey').value = cfg.llm?.apiKey || '';
  document.getElementById('cfg-wakeword').value = cfg.voice?.wakeWord || 'hey hex';
  // Restore saved models directory into the input field
  const mdirEl = document.getElementById('cfg-models-dir');
  if (mdirEl && cfg.voice?.modelsDir) mdirEl.value = cfg.voice.modelsDir;
  document.getElementById('cfg-breakmin').value = cfg.monitoring?.breakIntervalMin || 90;
  document.getElementById('cfg-proactive').value = String(cfg.monitoring?.proactiveAdvice !== false);
  const se = document.getElementById('cfg-searchengine');
  if (se) se.value = cfg.browser?.searchEngine || 'google';

  // Voice rate/pitch sliders
  const rate = cfg.voice?.rate ?? 0.95;
  const pitch = cfg.voice?.pitch ?? 0.85;
  const volume = cfg.voice?.volume ?? 0.9;
  document.getElementById('cfg-rate').value = rate;
  document.getElementById('cfg-pitch').value = pitch;
  document.getElementById('rate-val').textContent = rate;
  document.getElementById('pitch-val').textContent = pitch;
  const volEl = document.getElementById('cfg-volume');
  if (volEl) { volEl.value = volume; const vv = document.getElementById('volume-val'); if (vv) vv.textContent = volume; }

  // GCloud TTS fields
  const gcKeyEl   = document.getElementById('cfg-gcloud-tts-key');
  const gcVoiceEl = document.getElementById('cfg-gcloud-voice');
  if (gcKeyEl)   gcKeyEl.value   = cfg.voice?.gcloudTtsKey || '';
  if (gcVoiceEl) gcVoiceEl.value = cfg.voice?.gcloudVoice  || 'ka-GE-Standard-A';

  populateVoiceSelect(cfg.voice?.voiceName || '');

  // Restore TTS engine choice
  const savedEngine = cfg.voice?.ttsEngine || 'os';
  const radioLocal = document.getElementById('tts-engine-local');
  const radioOs = document.getElementById('tts-engine-os');
  if (radioLocal) radioLocal.checked = savedEngine === 'local';
  if (radioOs) radioOs.checked = savedEngine !== 'local';

  // Restore local voice settings
  const lvSel = document.getElementById('cfg-local-voice');
  // Dynamically populate voice dropdown with discovered models
  if (lvSel) {
    try {
      const status = await window.hexAPI.voice.status();
      if (status.voices && status.voices.length > 0) {
        lvSel.innerHTML = '';
        const byLang = {};
        for (const v of status.voices) {
          if (!byLang[v.lang]) byLang[v.lang] = [];
          byLang[v.lang].push(v);
        }
        const langNames = { en: 'English', ru: 'Russian', ka: 'Georgian' };
        for (const [lang, voices] of Object.entries(byLang)) {
          const group = document.createElement('optgroup');
          group.label = langNames[lang] || lang.toUpperCase();
          for (const v of voices) {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.name}${v.ready ? '' : ' ⚠'}${v.isDefault ? ' ★' : ''}`;
            group.appendChild(opt);
          }
          lvSel.appendChild(group);
        }
      } else {
        // Fallback to defaults
        lvSel.innerHTML = '<option value="en">English — lessac-medium</option><option value="ru">Russian — ruslan-medium</option><option value="ka">Georgian — natia-medium</option>';
      }
    } catch (_) {
      lvSel.innerHTML = '<option value="en">English — lessac-medium</option><option value="ru">Russian — ruslan-medium</option><option value="ka">Georgian — natia-medium</option>';
    }
    lvSel.value = cfg.voice?.localVoiceLang || 'en';
  }
  const lvSpeed = document.getElementById('cfg-local-speed');
  if (lvSpeed) {
    const spd = cfg.voice?.localSpeed ?? 1.0;
    lvSpeed.value = spd;
    const lsv = document.getElementById('local-speed-val');
    if (lsv) lsv.textContent = spd.toFixed(2);
  }
  updateTtsEngineUI();
  updateProviderUI();
  // Always start on General tab
  switchSettingsTab('tab-general');
  // Auto-show voice status info when general is loaded (shows in voice tab when switched)
  // Pre-populate personality active display
  updatePersonaBadge();
  refreshPersonaList();
  document.getElementById('settings-overlay').classList.add('open');
}

function populateVoiceSelect(selectedName) {
  const sel = document.getElementById('cfg-voice');
  if (!sel) return;
  const voices = window.hexVoice.getVoicesSorted();
  sel.innerHTML = '<option value="">— Auto (best match for language) —</option>';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} [${v.lang}]${v.localService ? '' : ' ☁'}`;
    if (v.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function previewSelectedVoice() {
  const name = document.getElementById('cfg-voice')?.value;
  const rate = parseFloat(document.getElementById('cfg-rate')?.value || '0.95');
  const pitch = parseFloat(document.getElementById('cfg-pitch')?.value || '0.85');
  const volume = parseFloat(document.getElementById('cfg-volume')?.value || '0.9');
  if (name) {
    // Use speak() directly with selected voice + live slider values
    window.hexVoice.setVoiceByName(name);
    window.hexVoice.synthesis?.cancel();
    const utt = new SpeechSynthesisUtterance('Softcurse H.E.X. online. Neural link established.');
    const v = window.hexVoice._voices.find(v => v.name === name);
    if (v) utt.voice = v;
    utt.rate = rate; utt.pitch = pitch; utt.volume = volume;
    utt.lang = window.hexVoice.langCode;
    window.hexVoice.synthesis?.speak(utt);
  }
}

async function previewLocalVoice() {
  const voiceId = document.getElementById('cfg-local-voice')?.value || 'en';
  const speed = parseFloat(document.getElementById('cfg-local-speed')?.value || '1.0');
  const unavail = document.getElementById('local-voice-unavail');
  try {
    // Save and temporarily apply live settings so preview actually uses them
    const origEngine = window.hexVoice._ttsEngine;
    const origLang = window.hexVoice._localVoiceLang;
    const origSpeed = window.hexVoice._localSpeed;
    window.hexVoice._ttsEngine = 'local';   // force local for preview
    window.hexVoice._localVoiceLang = voiceId;
    window.hexVoice._localSpeed = speed;
    try {
      await window.hexVoice.speak('Neural link established. Voice engine online.');
      if (unavail) unavail.style.display = 'none';
    } finally {
      window.hexVoice._ttsEngine = origEngine;
      window.hexVoice._localVoiceLang = origLang;
      window.hexVoice._localSpeed = origSpeed;
    }
  } catch (e) {
    if (unavail) { unavail.textContent = '⚠ ' + (e?.message || String(e)); unavail.style.display = ''; }
  }
}

async function updateTtsEngineUI() {
  const engine = document.querySelector('input[name="tts-engine"]:checked')?.value || 'os';
  const localPicker = document.getElementById('local-voice-picker');
  const osPicker = document.getElementById('os-voice-picker');
  const unavail = document.getElementById('local-voice-unavail');

  // Live-apply so changes take effect without pressing Save
  window.hexVoice._ttsEngine = engine;

  if (engine === 'local') {
    localPicker.style.display = '';
    osPicker.style.display = 'none';
    const voiceId = document.getElementById('cfg-local-voice')?.value || 'en';
    window.hexVoice._localVoiceLang = voiceId;   // live-apply voice too
    try {
      const s = await window.hexAPI.voice.status();
      // Check readiness from voices array (supports custom IDs like en:vasco)
      let ready = false;
      if (s.voices) {
        const match = s.voices.find(v => v.id === voiceId);
        ready = match ? match.ready : false;
      }
      // Fallback: check old ttsReady for simple lang keys
      if (!ready && s.ttsReady) {
        ready = s.ttsReady[voiceId] || false;
      }
      if (unavail) unavail.style.display = ready ? 'none' : '';
      if (!ready && unavail) unavail.textContent = `⚠ Voice model "${voiceId}" not ready. Check that .onnx, .onnx.json, and tokens.txt files exist.`;
    } catch (_) { }
  } else {
    localPicker.style.display = 'none';
    osPicker.style.display = '';
    if (unavail) unavail.style.display = 'none';
  }
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
  window.hexVoice.stopSpeaking();
}

function updateProviderUI() {
  const p = document.getElementById('cfg-provider').value;
  const hints = PROVIDER_HINTS[p] || PROVIDER_HINTS.none;

  document.getElementById('cfg-baseurl-group').style.display = p === 'ollama' ? '' : 'none';
  document.getElementById('cfg-apikey-group').style.display = p !== 'none' && p !== 'ollama' ? '' : 'none';

  const mh = document.getElementById('model-hint');
  const kh = document.getElementById('apikey-hint');
  if (mh) mh.textContent = hints.model ? `e.g. ${hints.model}` : '';
  if (kh) kh.textContent = hints.key ? `Format: ${hints.key}` : '';

  // Update model placeholder
  const mInput = document.getElementById('cfg-model');
  if (mInput && hints.model) mInput.placeholder = hints.model.split('/')[0].trim();
}


let _allFetchedModels = [];  // cache: array of {id, free}

async function fetchAvailableModels() {
  const provider = document.getElementById('cfg-provider').value;
  const apiKey = document.getElementById('cfg-apikey').value.trim();
  const baseUrl = document.getElementById('cfg-baseurl').value.trim();
  const statusEl = document.getElementById('model-fetch-status');
  const btn = document.getElementById('fetch-models-btn');
  const picker = document.getElementById('model-picker');

  if (provider === 'none') {
    statusEl.textContent = 'Select a provider first.';
    statusEl.style.display = '';
    return;
  }
  if (!apiKey && provider !== 'ollama') {
    statusEl.textContent = 'Enter your API key first, then fetch.';
    statusEl.style.display = '';
    return;
  }

  btn.textContent = '⏳ ...';
  btn.disabled = true;
  statusEl.style.display = 'none';
  picker.style.display = 'none';

  try {
    _allFetchedModels = await window.hexAI.fetchModels(provider, apiKey, baseUrl);
    renderModelPicker(true);   // default: FREE only
  } catch (err) {
    statusEl.textContent = '⚠ ' + (err?.message || String(err));
    statusEl.style.display = '';
  } finally {
    btn.textContent = '⬇ FETCH';
    btn.disabled = false;
  }
}

function renderModelPicker(freeOnly) {
  const picker = document.getElementById('model-picker');
  const statusEl = document.getElementById('model-fetch-status');
  const mi = document.getElementById('cfg-model');

  const list = freeOnly ? _allFetchedModels.filter(m => m.free) : _allFetchedModels;
  const freeCount = _allFetchedModels.filter(m => m.free).length;
  const allCount = _allFetchedModels.length;

  // Auto-fill if input is blank or a bare provider name
  const bare = ['gemini', 'grok', 'openai', 'anthropic', 'mistral', 'groq', 'ollama', 'together', 'cohere', 'openrouter'];
  if (!mi.value || bare.includes(mi.value.toLowerCase().trim())) {
    const firstFree = _allFetchedModels.find(m => m.free);
    mi.value = (firstFree || _allFetchedModels[0] || {}).id || '';
  }

  const toggleLabel = freeOnly
    ? `<span onclick="renderModelPicker(false)" style="cursor:pointer;text-decoration:underline;color:var(--accent);">show all ${allCount}</span>`
    : `<span onclick="renderModelPicker(true)"  style="cursor:pointer;text-decoration:underline;color:var(--accent);">free only (${freeCount})</span>`;

  statusEl.innerHTML = `✅ Showing ${list.length} models — click to select &nbsp;|&nbsp; ${toggleLabel}`;
  statusEl.style.display = '';

  if (list.length === 0) {
    picker.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--muted);">No free models found for this provider. Click "show all" above.</div>';
    picker.style.display = 'block';
    return;
  }

  picker.innerHTML = list.map(m => {
    const isActive = m.id === mi.value;
    const freeBadge = m.free
      ? '<span style="margin-left:6px;font-size:9px;padding:1px 5px;background:rgba(0,255,150,.2);color:#0f9;border-radius:3px;vertical-align:middle;">FREE</span>'
      : '';
    return `<div data-model-id="${m.id}"
      onclick="selectModel(this.dataset.modelId)"
      style="padding:7px 10px;cursor:pointer;font-size:12px;font-family:monospace;
             border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;
             ${isActive ? 'background:var(--accent);color:#000;' : ''}">
      <span style="flex:1;">${m.id}</span>${freeBadge}
    </div>`;
  }).join('');
  picker.style.display = 'block';
}

function selectModel(name) {
  document.getElementById('cfg-model').value = name;
  const picker = document.getElementById('model-picker');
  [...picker.querySelectorAll('[data-model-id]')].forEach(el => {
    const isSelected = el.dataset.modelId === name;
    el.style.background = isSelected ? 'var(--accent)' : '';
    el.style.color = isSelected ? '#000' : '';
  });
}

async function saveSettings() {
  const newLang = document.getElementById('cfg-language').value;
  const newCfg = {
    userName: document.getElementById('cfg-username').value || 'Operator',
    language: newLang,
    llm: {
      provider: document.getElementById('cfg-provider').value,
      baseUrl: document.getElementById('cfg-baseurl').value,
      model: document.getElementById('cfg-model').value,
      apiKey: document.getElementById('cfg-apikey').value
    },
    browser: {
      searchEngine: document.getElementById('cfg-searchengine')?.value || 'google'
    },
    voice: {
      ...config.voice,
      // modelsDir: always read from field so it persists even without clicking APPLY
      modelsDir:      (document.getElementById('cfg-models-dir')?.value || '').trim() || config.voice?.modelsDir || '',
      wakeWord:       document.getElementById('cfg-wakeword').value || 'hey hex',
      voiceName:      document.getElementById('cfg-voice')?.value || '',
      rate:           parseFloat(document.getElementById('cfg-rate').value) || 0.95,
      pitch:          parseFloat(document.getElementById('cfg-pitch').value) || 0.85,
      volume:         parseFloat(document.getElementById('cfg-volume')?.value || '0.9'),
      ttsEngine:      document.querySelector('input[name="tts-engine"]:checked')?.value || 'os',
      localVoiceLang: document.getElementById('cfg-local-voice')?.value || 'en',
      localSpeed:     parseFloat(document.getElementById('cfg-local-speed')?.value || '1.0'),
      gcloudTtsKey:   (document.getElementById('cfg-gcloud-tts-key')?.value || '').trim() || config.voice?.gcloudTtsKey || '',
      gcloudVoice:    document.getElementById('cfg-gcloud-voice')?.value || config.voice?.gcloudVoice || 'ka-GE-Standard-A',
    },
    monitoring: {
      ...config.monitoring,
      breakIntervalMin: parseInt(document.getElementById('cfg-breakmin').value) || 90,
      proactiveAdvice: document.getElementById('cfg-proactive').value === 'true'
    }
  };

  const prevLang = config.language;
  // Merge personalities into config before saving
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...newCfg, ...pcfg };
  await window.hexAPI.setConfig(config);
  window.hexAI.configure(config);
  window.hexVoice.wakeWord        = config.voice.wakeWord;
  window.hexVoice.setVoiceByName(config.voice.voiceName);
  window.hexVoice._ttsEngine      = config.voice.ttsEngine      || 'os';
  window.hexVoice._localVoiceLang = config.voice.localVoiceLang || 'en';
  window.hexVoice._localSpeed     = config.voice.localSpeed     ?? 1.0;
  window.hexVoice._gcloudKey      = config.voice.gcloudTtsKey   || '';
  window.hexVoice._useGCloud      = !!(config.voice.gcloudTtsKey);
  window.hexVoice._gcloudVoice    = config.voice.gcloudVoice    || 'ka-GE-Standard-A';
  // Push modelsDir to engine and refresh engine status
  if (config.voice.modelsDir) {
    window.hexAPI.voice.setModelsDir(config.voice.modelsDir).catch(() => {});
  }
  // Re-check local engines so _localSTT/_localTTS are current after any path change
  window.hexVoice._checkLocalEngines();
  window.hexBrowser.defaultEngine = config.browser?.searchEngine || 'google';
  updateSearchEngineBtn();

  if (newLang !== prevLang) await setLanguage(newLang);

  closeSettings();
  addLog('SYSTEM', 'Configuration saved.');
  showToast('◆ CONFIG SAVED', 'Settings updated and applied.', '', 3000);
}

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

// ═══════════════════════════════════════════════════════════════
//  SETTINGS TABS
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
//  PERSONALITY UI
// ═══════════════════════════════════════════════════════════════

// Update the topbar badge showing active personality
function updatePersonaBadge() {
  const badge = document.getElementById('active-persona-badge');
  if (badge) badge.textContent = '◆ ' + window.hexPersonalities.getActiveName();
  // Also update active display in tab
  const nameEl = document.getElementById('active-persona-name');
  const descEl = document.getElementById('active-persona-desc');
  const p = window.hexPersonalities.getById(window.hexPersonalities.activeId);
  if (nameEl) nameEl.textContent = p ? p.name : 'HEX — Default';
  if (descEl) descEl.textContent = p ? p.description : '';
}

// Render the full personality list inside the tab
function refreshPersonaList() {
  const container = document.getElementById('persona-list');
  if (!container) return;
  container.innerHTML = '';
  const all = window.hexPersonalities.getAll();
  const activeId = window.hexPersonalities.activeId;

  if (!all.length) {
    container.innerHTML = '<div class="form-hint" style="padding:8px;">No personalities found.</div>';
    return;
  }

  all.forEach(p => {
    const row = document.createElement('div');
    row.className = 'persona-row' + (p.id === activeId ? ' active-persona' : '');

    const activeBtnLabel = p.id === activeId ? '✓ ACTIVE' : 'ACTIVATE';
    const activeBtnCls = p.id === activeId ? 'persona-btn activate is-active' : 'persona-btn activate';
    const badgeCls = p.isBuiltIn ? 'persona-row-badge' : 'persona-row-badge custom';
    const badgeLabel = p.isBuiltIn ? 'BUILT-IN' : 'CUSTOM';

    row.innerHTML =
      '<div class="persona-row-info">' +
      '<span class="persona-row-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="persona-row-desc">' + escapeHtml(p.description || '') + '</span>' +
      '</div>' +
      '<span class="' + badgeCls + '">' + badgeLabel + '</span>' +
      '<button class="' + activeBtnCls + '" onclick="activatePersonality(\'' + p.id + '\')">' + activeBtnLabel + '</button>' +
      (!p.isBuiltIn
        ? '<button class="persona-btn edit-btn" onclick="editPersonality(\'' + p.id + '\')">EDIT</button>'
        + '<button class="persona-btn del-btn" onclick="deletePersonality(\'' + p.id + '\')">✕</button>'
        : '<button class="persona-btn edit-btn" onclick="clonePersonality(\'' + p.id + '\')">CLONE</button>'
        + '<div></div>'
      );
    container.appendChild(row);
  });

  updatePersonaBadge();
}

function activatePersonality(id) {
  window.hexPersonalities.setActive(id);
  refreshPersonaList();
  updatePersonaBadge();
  addLog('HEX', 'Personality activated: ' + window.hexPersonalities.getActiveName());
  // Persist active ID into config
  config.activePersonalityId = id;
  window.hexAPI.setConfig({ activePersonalityId: id });
}

function editPersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p || p.isBuiltIn) return;
  document.getElementById('persona-edit-id').value = p.id;
  document.getElementById('persona-name').value = p.name;
  document.getElementById('persona-desc').value = p.description || '';
  document.getElementById('persona-prompt').value = p.prompt;
}

function clonePersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p) return;
  document.getElementById('persona-edit-id').value = ''; // blank = create new
  document.getElementById('persona-name').value = p.name + ' (copy)';
  document.getElementById('persona-desc').value = p.description || '';
  document.getElementById('persona-prompt').value = p.prompt;
}

function deletePersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p || p.isBuiltIn) return;
  if (!confirm('Delete personality "' + p.name + '"? This cannot be undone.')) return;
  window.hexPersonalities.delete(id);
  refreshPersonaList();
  persistPersonalities();
  addLog('HEX', 'Personality deleted: ' + p.name);
}

function savePersonality() {
  const id = document.getElementById('persona-edit-id').value.trim();
  const name = document.getElementById('persona-name').value.trim();
  const desc = document.getElementById('persona-desc').value.trim();
  const prompt = document.getElementById('persona-prompt').value.trim();

  if (!name) { showToast('◆ VALIDATION', 'Name is required.', 'alert', 3000); return; }
  if (!prompt) { showToast('◆ VALIDATION', 'System prompt is required.', 'alert', 3000); return; }

  const entry = window.hexPersonalities.upsert({ id: id || null, name, description: desc, prompt });
  clearPersonaForm();
  refreshPersonaList();
  persistPersonalities();
  showToast('◆ PERSONALITY SAVED', '"' + entry.name + '" saved.', '', 3000);
  addLog('HEX', 'Personality saved: ' + entry.name);
}

function clearPersonaForm() {
  document.getElementById('persona-edit-id').value = '';
  document.getElementById('persona-name').value = '';
  document.getElementById('persona-desc').value = '';
  document.getElementById('persona-prompt').value = '';
}

function persistPersonalities() {
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...pcfg };
  window.hexAPI.setConfig(pcfg);
}

// ═══════════════════════════════════════════════════════════════
//  MEMORY TAB UI
// ═══════════════════════════════════════════════════════════════

function refreshMemoryTab() {
  const stats = window.hexMemory.getStats();
  const el = (id) => document.getElementById(id);
  if (el('mem-stat-facts')) el('mem-stat-facts').textContent = stats.facts;
  if (el('mem-stat-turns')) el('mem-stat-turns').textContent = stats.turns;
  if (el('mem-stat-oldest')) el('mem-stat-oldest').textContent = stats.oldestTurn || '—';
  if (el('mem-stat-summary')) el('mem-stat-summary').textContent = stats.summary ? 'YES' : 'NO';

  // Render facts list
  const factsList = document.getElementById('facts-list');
  if (!factsList) return;
  factsList.innerHTML = '';

  if (!window.hexMemory.facts.length) {
    factsList.innerHTML = '<div class="form-hint" style="padding:8px;">No facts stored yet. HEX will learn as you chat.</div>';
    return;
  }

  window.hexMemory.facts.forEach(f => {
    const row = document.createElement('div');
    row.className = 'fact-row';
    row.innerHTML =
      '<span class="fact-cat ' + (f.category || 'general') + '">' + (f.category || 'general').toUpperCase() + '</span>' +
      '<span class="fact-text">' + escapeHtml((f.content || '').substring(0, 160)) + '</span>' +
      '<button class="fact-del" onclick="deleteFact(\'' + f.id + '\')" title="Delete fact">✕</button>';
    factsList.appendChild(row);
  });
}

function deleteFact(id) {
  window.hexMemory.removeFact(id);
  refreshMemoryTab();
}

async function clearMemoryFacts() {
  if (!confirm('Clear all learned facts? HEX will lose knowledge about you but keep conversation history.')) return;
  window.hexMemory.clearFacts();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY', 'Facts cleared.', 'warn', 3000);
  addLog('HEX', 'Memory facts cleared.');
}

async function clearMemoryHistory() {
  if (!confirm('Clear all conversation history? HEX will not remember past conversations.')) return;
  window.hexMemory.clearHistory();
  window.hexAI.clearHistory();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY', 'Conversation history cleared.', 'warn', 3000);
  addLog('HEX', 'Conversation history cleared.');
}

async function clearAllMemory() {
  if (!confirm('WIPE ALL MEMORY? HEX will forget everything — facts, history, and summaries. This cannot be undone.')) return;
  window.hexMemory.clearAll();
  window.hexAI.clearHistory();
  await window.hexAPI.clearMemory();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY WIPED', 'All memory erased. HEX starts fresh.', 'alert', 5000);
  addLog('HEX', 'All memory wiped.');
}

// ═══════════════════════════════════════════════════════════════
//  VOICE MODELS DIR HELPERS
// ═══════════════════════════════════════════════════════════════
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
