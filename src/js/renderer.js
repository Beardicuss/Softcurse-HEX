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

  try {
    const result = await window.hexAI.chat(text, systemState, config.language || 'en');
    hideTyping();
    const hexText = result.text || '…';
    addHexMessage(hexText);
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

    // Speak response
    if (config.voice?.enabled !== false) speakWithConfig(hexText);

    // Execute actions — collect results from info-gathering ones
    const infoResults = [];
    for (const action of (result.actions || [])) {
      const actionResult = await handleAIAction(action);
      if (actionResult && actionResult.data) {
        infoResults.push('[' + action.type.toUpperCase() + ' RESULT]: ' + actionResult.data);
      }
    }

    // If we got real PC data back, do a follow-up AI call so HEX responds intelligently
    // about the ACTUAL data instead of having it appear as a raw system message
    if (infoResults.length > 0) {
      showTyping();
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
    case 'open_app': {
      const appName = action.args.join(' ').trim();
      if (appName) {
        addLog('BUTLER', `Launching: ${appName}`);
        const r = await window.hexAPI.butler.openApp(appName);
        if (r.success) {
          const found = r.found || appName;
          addHexMessage('**Opening** ' + found + (r.method ? ' (' + r.method + ')' : '') + '.');
          addLog('BUTLER', 'Launched: ' + found);
        } else {
          addHexMessage('**Could not open** "' + appName + '". ' + (r.error || '') + (r.hint ? ' ' + r.hint : ''));
          addLog('BUTLER', 'Launch failed: ' + appName + ' — ' + (r.error || ''), 'error');
        }
      }
      break;
    }

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

    case 'screenshot': {
      addLog('BUTLER', 'Taking screenshot...');
      const ssResult = await window.hexAPI.butler.screenshot();
      if (ssResult.success) {
        addLog('BUTLER', `Screenshot saved: ${ssResult.path}`);
        addHexMessage(`**Screenshot taken** and saved to your Desktop.`);
      } else {
        addLog('BUTLER', `Screenshot failed: ${ssResult.error}`, 'error');
        addHexMessage(`**Screenshot failed:** ${ssResult.error}`);
      }
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

    // ── File & Folder ────────────────────────────────────────
    case 'copy': {
      const [src, ...dParts] = action.args; const dest = dParts.join(':');
      const r = await window.hexAPI.butler.copy(src, dest);
      addLog('BUTLER', r.success ? `Copied to ${r.dest}` : `Copy failed: ${r.error}`);
      if (r.success) addHexMessage(`**Copied** to \`${r.dest}\``);
      break;
    }
    case 'move': {
      const [msrc, ...mdParts] = action.args; const mdest = mdParts.join(':');
      const r = await window.hexAPI.butler.move(msrc, mdest);
      addLog('BUTLER', r.success ? `Moved to ${r.dest}` : `Move failed: ${r.error}`);
      if (r.success) addHexMessage(`**Moved** to \`${r.dest}\``);
      break;
    }
    case 'delete': {
      const r = await window.hexAPI.butler.delete(action.args[0], false);
      addLog('BUTLER', r.success ? `Deleted: ${action.args[0]}` : `Delete: ${r.error}`);
      break;
    }
    case 'delete_perm': {
      const r = await window.hexAPI.butler.delete(action.args[0], true);
      addLog('BUTLER', r.success ? `Permanently deleted: ${action.args[0]}` : `Delete: ${r.error}`);
      break;
    }
    case 'rename': {
      const r = await window.hexAPI.butler.rename(action.args[0], action.args[1]);
      addLog('BUTLER', r.success ? `Renamed to ${r.path}` : `Rename: ${r.error}`);
      if (r.success) addHexMessage(`**Renamed** to \`${r.path}\``);
      break;
    }
    case 'create_folder': {
      const r = await window.hexAPI.butler.createFolder(action.args[0]);
      addLog('BUTLER', r.success ? `Folder created: ${r.path}` : `Folder: ${r.error}`);
      if (r.success) addHexMessage(`**Folder created:** \`${r.path}\``);
      break;
    }
    case 'list_dir': {
      const r = await window.hexAPI.butler.listDir(action.args[0] || 'desktop');
      if (r.success) {
        const dirs  = r.items.filter(function(i){ return i.type === 'dir';  }).map(function(i){ return '[DIR] '  + i.name; });
        const files = r.items.filter(function(i){ return i.type === 'file'; }).map(function(i){ return '[FILE] ' + i.name; });
        const preview = dirs.slice(0,8).concat(files.slice(0,8));
        const more = r.count > 16 ? ('..and ' + (r.count-16) + ' more') : '';
        addHexMessage('**' + r.path + '** - ' + r.count + ' items\n' + preview.join('\n') + more);
        addLog('BUTLER', 'Listed ' + r.count + ' items in ' + r.path);
      } else {
        addHexMessage('Could not list directory: ' + r.error);
      }
      break;
    }
    case 'file_info': {
      const r = await window.hexAPI.butler.fileInfo(action.args[0]);
      if (r.success) {
        addHexMessage(`**${action.args[0]}**
Size: ${r.sizeHuman}
Type: ${r.isDir ? 'Folder' : 'File'}
Modified: ${r.modified}`);
      } else { addHexMessage(`File info error: ${r.error}`); }
      break;
    }

    // ── Process & System ─────────────────────────────────────
    case 'list_processes': {
      const r = await window.hexAPI.butler.listProcesses();
      if (r.success) {
        const top = r.processes.slice(0,10).map(function(p){ return p.name+' CPU:'+p.cpu+' RAM:'+p.mem; }).join(', ');
        addLog('BUTLER', 'processes: '+top);
        return { data: 'Running processes: '+top };
      }
      break;
    }
    case 'kill_process': {
      const r = await window.hexAPI.butler.killByName(action.args[0]);
      addLog('BUTLER', r.success ? `Killed: ${action.args[0]}` : `Kill: ${r.error}`);
      addHexMessage(r.success ? `**Process terminated:** ${action.args[0]}` : `Kill failed: ${r.error}`);
      break;
    }
    case 'kill_pid': {
      const r = await window.hexAPI.killProcess(parseInt(action.args[0]));
      addLog('BUTLER', r.success ? `Killed PID ${action.args[0]}` : `Kill PID: ${r.error}`);
      break;
    }
    case 'sys_info': {
      const r = await window.hexAPI.butler.sysInfo();
      if (r.success) {
        const info = 'OS: '+r.os+' | Host: '+r.hostname+' | Uptime: '+r.uptime+' | CPU: '+r.cpu+' | RAM: '+r.ramUsed+'/'+r.ramTotal+' ('+r.ramFree+' free)';
        addLog('BUTLER', 'sys_info: '+info);
        return { data: info };
      }
      break;
    }
    case 'battery': {
      const r = await window.hexAPI.butler.battery();
      if (r.success) {
        const bInfo = r.hasBattery
          ? 'Battery: '+r.percent+'% '+(r.isCharging?'(charging)':'(discharging)')+' time remaining: '+r.timeRemaining
          : 'No battery (desktop PC)';
        addLog('BUTLER', bInfo);
        return { data: bInfo };
      }
      break;
    }
    case 'disk_usage': {
      const r = await window.hexAPI.butler.diskUsage(action.args[0]);
      if (r.success) {
        const lines = r.disks.map(function(d){ return d.mount+' ('+d.fs+'): '+d.used+'/'+d.total+' used, '+d.free+' free ('+d.pct+')'; }).join(', ');
        addLog('BUTLER', 'disk_usage: '+lines);
        return { data: 'Disk: '+lines };
      }
      break;
    }

    // ── Clipboard ────────────────────────────────────────────
    case 'get_clipboard': {
      const r = await window.hexAPI.butler.getClipboard();
      if (r.success) addHexMessage(`**Clipboard contents:**
${r.text.substring(0, 400)}${r.text.length > 400 ? '…' : ''}`);
      break;
    }
    case 'set_clipboard': {
      const text = action.args.join(':');
      await window.hexAPI.butler.setClipboard(text);
      addLog('BUTLER', 'Clipboard set.');
      addHexMessage(`**Clipboard updated.**`);
      break;
    }
    case 'clear_clipboard': {
      await window.hexAPI.butler.clearClipboard();
      addLog('BUTLER', 'Clipboard cleared.');
      break;
    }

    // ── Audio ────────────────────────────────────────────────
    case 'set_volume': {
      const level = parseInt(action.args[0]) || 50;
      await window.hexAPI.butler.setVolume(level);
      addLog('BUTLER', `Volume → ${level}%`);
      addHexMessage(`**Volume set to ${level}%.**`);
      break;
    }
    case 'mute': {
      await window.hexAPI.butler.mute(true);
      addLog('BUTLER', 'Muted.');
      addHexMessage('**Audio muted.**');
      break;
    }
    case 'unmute': {
      await window.hexAPI.butler.mute(false);
      addLog('BUTLER', 'Unmuted.');
      addHexMessage('**Audio unmuted.**');
      break;
    }
    case 'get_volume': {
      const r = await window.hexAPI.butler.getVolume();
      addHexMessage(r.success ? `**Volume:** ${r.level}%${r.note ? ' — ' + r.note : ''}` : `Could not read volume: ${r.error}`);
      break;
    }

    // ── Network ──────────────────────────────────────────────
    case 'get_ip': {
      const r = await window.hexAPI.butler.getIp();
      if (r.success) {
        const local = r.local.map(function(n){ return n.name+': '+n.ip; }).join(', ');
        const ipInfo = 'Local IPs: '+local+' | Public IP: '+(r.publicIp||'unavailable');
        addLog('BUTLER', ipInfo);
        return { data: ipInfo };
      }
      break;
    }
    case 'ping': {
      addHexMessage(`Pinging ${action.args[0]}…`);
      const r = await window.hexAPI.butler.ping(action.args[0]);
      addHexMessage(`**Ping ${action.args[0]}:**
\`\`\`
${r.output.substring(0, 300)}
\`\`\``);
      break;
    }
    case 'flush_dns': {
      const r = await window.hexAPI.butler.flushDns();
      addLog('BUTLER', 'DNS flush: ' + (r.success ? 'OK' : r.error));
      addHexMessage(r.success ? '**DNS cache flushed.**' : `DNS flush failed: ${r.error}`);
      break;
    }
    case 'list_wifi': {
      const r = await window.hexAPI.butler.listWifi();
      addHexMessage(r.success
        ? `**Wi-Fi Networks:**
\`\`\`
${r.output.substring(0, 600)}
\`\`\``
        : `Wi-Fi scan failed: ${r.error}`);
      break;
    }

    // ── Environment ──────────────────────────────────────────
    case 'get_env': {
      const r = await window.hexAPI.butler.getEnv(action.args[0]);
      addHexMessage(r.value !== null
        ? `**${r.variable}** = \`${r.value}\``
        : `Environment variable \`${r.variable}\` is not set.`);
      break;
    }
    case 'set_env': {
      const r = await window.hexAPI.butler.setEnv(action.args[0], action.args[1]);
      addLog('BUTLER', r.success ? `ENV set: ${action.args[0]}` : r.error);
      break;
    }

    // ── Maintenance ──────────────────────────────────────────
    case 'clean_temp': {
      const r = await window.hexAPI.butler.cleanTemp();
      addLog('BUTLER', r.success ? `Temp cleaned: ${r.freed} freed` : r.error);
      if (r.success) addHexMessage(`**Temp files cleaned:** ${r.freed} freed, ${r.count} items removed, ${r.skipped} skipped (in use).`);
      break;
    }
    case 'set_wallpaper': {
      const r = await window.hexAPI.butler.setWallpaper(action.args[0]);
      addLog('BUTLER', r.success ? `Wallpaper set: ${action.args[0]}` : r.error);
      if (r.success) addHexMessage(`**Wallpaper updated.**`);
      break;
    }

    // ── Scripting ────────────────────────────────────────────
    case 'run_ps': {
      const script = action.args.join(':');
      const r = await window.hexAPI.butler.runPs(script);
      addLog('BUTLER', r.success ? 'PS: ' + r.output.substring(0,80) : 'PS error: ' + r.error);
      if (r.output) addHexMessage(`**PowerShell output:**
\`\`\`
${r.output.substring(0, 500)}
\`\`\``);
      break;
    }
    case 'run_cmd': {
      const command = action.args.join(':');
      const r = await window.hexAPI.butler.runCmd(command);
      addLog('BUTLER', r.success ? 'CMD: ' + r.output.substring(0,80) : 'CMD error: ' + r.error);
      if (r.output) addHexMessage(`**CMD output:**
\`\`\`
${r.output.substring(0, 500)}
\`\`\``);
      break;
    }
    case 'logoff': {
      const r = await window.hexAPI.butler.logoff();
      addLog('BUTLER', r.success ? 'Logging off…' : r.error);
      break;
    }

    // ── Game launchers ───────────────────────────────────────
    case 'launch_game': {
      const gameName = action.args.join(' ').trim();
      if (!gameName) { addHexMessage('Which game should I launch?'); break; }
      addHexMessage('Looking for **' + gameName + '**…');
      addLog('BUTLER', 'Searching for game: ' + gameName);
      const r = await window.hexAPI.butler.launchGame(gameName);
      if (r.success) {
        const plat = r.platform ? ' [' + r.platform.toUpperCase() + ']' : '';
        addHexMessage('**Launching ' + r.game + '**' + plat + '. Loading…');
        addLog('BUTLER', 'Game launched: ' + r.game + plat);
      } else {
        addHexMessage('**Could not launch** "' + gameName + '". ' + (r.error || 'Not found in Steam, Epic, or installed apps.'));
        addLog('BUTLER', 'Game not found: ' + gameName, 'error');
      }
      break;
    }

    // ── FILE: ZIP / UNZIP ──────────────────────────────────
    case 'zip': {
      const src = action.args[0]; const out = action.args[1] || src + '.zip';
      if (!src) { addHexMessage('Specify a source path to zip.'); break; }
      addHexMessage('Compressing **' + src + '**…');
      const r = await window.hexAPI.butler.zip(src, out);
      if (r.success) addHexMessage('**Zipped** to `' + r.output + '`');
      else addHexMessage('Zip failed: ' + r.error);
      addLog('BUTLER', r.success ? 'Zipped: '+r.output : 'Zip error: '+r.error);
      break;
    }
    case 'unzip': {
      const zipPath = action.args[0]; const dest = action.args[1] || '';
      if (!zipPath) { addHexMessage('Specify an archive path to extract.'); break; }
      addHexMessage('Extracting **' + zipPath + '**…');
      const r = await window.hexAPI.butler.unzip(zipPath, dest);
      if (r.success) addHexMessage('**Extracted** to `' + r.dest + '`');
      else addHexMessage('Unzip failed: ' + r.error);
      addLog('BUTLER', r.success ? 'Unzipped to: '+r.dest : 'Unzip error: '+r.error);
      break;
    }

    // ── PROCESS ─────────────────────────────────────────
    case 'run': {
      const cmd = action.args[0]; const args = action.args.slice(1).join(' ');
      if (!cmd) break;
      addHexMessage('Running **' + cmd + (args ? ' ' + args : '') + '**…');
      const r = await window.hexAPI.butler.run(cmd, args);
      if (r.output) addHexMessage('```\n' + r.output.substring(0, 500) + '\n```');
      addLog('BUTLER', r.success ? 'Ran: '+cmd : 'Run error: '+r.error);
      break;
    }
    case 'run_as_admin': {
      const cmd = action.args.join(':');
      const r = await window.hexAPI.butler.runAsAdmin(cmd);
      addLog('BUTLER', r.success ? 'Admin run: OK' : 'Admin run: ' + r.error);
      break;
    }

    // ── WINDOW MANAGEMENT ────────────────────────────────
    case 'list_windows': {
      const r = await window.hexAPI.butler.listWindows();
      if (r.success && r.windows.length) {
        const lines = r.windows.slice(0,15).map(function(w){ return '['+w.pid+'] '+w.process+': '+w.title; }).join('\n');
        addHexMessage('**Open Windows (' + r.windows.length + '):**\n```\n' + lines + '\n```');
      } else {
        addHexMessage(r.error || 'No windows found.');
      }
      break;
    }
    case 'window': {
      // [ACTION:window:minimize:Notepad]
      const wAction = action.args[0]; const wTitle = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.windowAction(wAction, wTitle);
      addLog('BUTLER', (r.success ? 'Window '+wAction+': ' : 'Window err: ') + wTitle);
      addHexMessage(r.success ? '**Window ' + wAction + 'd:** ' + wTitle : 'Could not ' + wAction + ' "' + wTitle + '"');
      break;
    }
    case 'close_window': {
      const r = await window.hexAPI.butler.windowAction('close', action.args.join(':'));
      addLog('BUTLER', r.success ? 'Closed window: '+action.args.join(':') : r.error);
      break;
    }
    case 'send_keys': {
      const keys = action.args.join(':');
      const r = await window.hexAPI.butler.sendKeys(keys);
      addLog('BUTLER', r.success ? 'SendKeys: OK' : 'SendKeys: ' + r.error);
      if (!r.success) addHexMessage('SendKeys failed: ' + r.error);
      break;
    }
    case 'mouse_move': {
      const r = await window.hexAPI.butler.mouseMove(action.args[0], action.args[1]);
      addLog('BUTLER', r.success ? 'Mouse moved' : r.error);
      break;
    }
    case 'mouse_click': {
      const r = await window.hexAPI.butler.mouseClick(action.args[0] || 'left');
      addLog('BUTLER', r.success ? 'Mouse click: '+(action.args[0]||'left') : r.error);
      break;
    }
    case 'paste_clipboard': {
      const r = await window.hexAPI.butler.pasteClipboard();
      addLog('BUTLER', 'Paste: ' + (r.success ? 'OK' : r.error));
      break;
    }

    // ── CLIPBOARD IMG ────────────────────────────────────
    case 'get_clipboard_img': {
      const r = await window.hexAPI.butler.getClipboardImg();
      if (r.success) {
        addHexMessage('**Clipboard image** saved to: `' + r.path + '`');
        addLog('BUTLER', 'Clipboard img: ' + r.path);
      } else {
        addHexMessage('No image in clipboard. ' + (r.error || ''));
      }
      break;
    }

    // ── NETWORK ──────────────────────────────────────────
    case 'connect_wifi': {
      const ssid = action.args[0]; const pwd = action.args[1] || '';
      addHexMessage('Connecting to **' + ssid + '**…');
      const r = await window.hexAPI.butler.connectWifi(ssid, pwd);
      addHexMessage(r.success ? '**Connected to ' + ssid + '.**' : 'WiFi connect failed: ' + (r.error || r.output));
      addLog('BUTLER', r.success ? 'WiFi: '+ssid : 'WiFi error: '+ssid);
      break;
    }
    case 'net_adapter': {
      const adapter = action.args[0]; const act = action.args[1] || 'enable';
      const r = await window.hexAPI.butler.netAdapter(adapter, act);
      addLog('BUTLER', r.success ? 'Adapter '+act+': '+adapter : r.error);
      addHexMessage(r.success ? '**Adapter ' + act + 'd:** ' + adapter : 'Adapter error: ' + r.error);
      break;
    }

    // ── AUTOMATION ───────────────────────────────────────
    case 'sleep': {
      const secs = parseFloat(action.args[0]) || 1;
      addHexMessage('Waiting **' + secs + 's**…');
      const r = await window.hexAPI.butler.sleep(secs);
      addLog('BUTLER', 'Sleep ' + secs + 's done');
      break;
    }
    case 'schedule_once': {
      const time = action.args[0]; const cmd = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.scheduleOnce(time, cmd);
      addLog('BUTLER', r.success ? 'Scheduled: '+r.taskName : r.error);
      addHexMessage(r.success ? '**Task scheduled** at ' + time + ' (task: ' + r.taskName + ')' : 'Schedule failed: ' + r.error);
      break;
    }
    case 'cancel_task': {
      const r = await window.hexAPI.butler.cancelTask(action.args[0]);
      addLog('BUTLER', r.success ? 'Task cancelled: '+action.args[0] : r.error);
      addHexMessage(r.success ? '**Task cancelled:** ' + action.args[0] : 'Cancel failed: ' + r.error);
      break;
    }
    case 'startup': {
      const act = action.args[0]; const cmd = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.startup(act, cmd, 'HEX_app');
      addLog('BUTLER', r.success ? 'Startup '+act : r.error);
      addHexMessage(r.success ? '**Startup ' + act + ':** Done.' : 'Startup error: ' + r.error);
      break;
    }

    // ── REGISTRY ─────────────────────────────────────────

    // ── SOFTWARE ─────────────────────────────────────────
    case 'list_software': {
      addHexMessage('Scanning installed software…');
      const r = await window.hexAPI.butler.listSoftware();
      if (r.success) {
        const top = r.software.slice(0, 20).map(function(s){ return s.name + (s.version ? ' v'+s.version : ''); }).join('\n');
        addHexMessage('**Installed Software (' + r.count + ' total):**\n```\n' + top + '\n```\n_(showing first 20)_');
      } else { addHexMessage('Could not list software: ' + r.error); }
      break;
    }
    case 'check_updates': {
      addHexMessage('Checking for updates via winget…');
      const r = await window.hexAPI.butler.checkUpdates();
      addHexMessage(r.success ? '**Updates:**\n```\n' + r.output.substring(0,600) + '\n```' : 'Updates check failed: ' + r.error);
      break;
    }
    case 'install_pkg': {
      const pkg = action.args.join(' ');
      addHexMessage('Installing **' + pkg + '** via winget…');
      const r = await window.hexAPI.butler.installPkg(pkg);
      addHexMessage(r.success ? '**Installed ' + pkg + '.**' : 'Install failed: ' + (r.error || r.output));
      addLog('BUTLER', r.success ? 'Installed: '+pkg : 'Install error: '+pkg);
      break;
    }
    case 'uninstall': {
      const pkg = action.args.join(' ');
      const r = await window.hexAPI.butler.uninstall(pkg);
      addHexMessage(r.success ? '**Uninstalled ' + pkg + '.**' : 'Uninstall failed: ' + (r.error || r.output));
      addLog('BUTLER', r.success ? 'Uninstalled: '+pkg : 'Uninstall error: '+pkg);
      break;
    }

    // ── PERIPHERALS ──────────────────────────────────────
    case 'eject_usb': {
      const letter = action.args[0] || 'E';
      const r = await window.hexAPI.butler.ejectUsb(letter);
      addLog('BUTLER', r.success ? 'Ejected: '+r.drive : r.error);
      addHexMessage(r.success ? '**USB drive ' + r.drive + ' ejected safely.**' : 'Eject failed: ' + r.error);
      break;
    }

    // ── SCRIPTING ────────────────────────────────────────
    case 'run_js': {
      const code = action.args.join(':');
      const r = await window.hexAPI.butler.runJs(code);
      addLog('BUTLER', r.success ? 'run_js OK' : 'run_js: '+r.error);
      if (r.success && r.output) addHexMessage('**JS output:**\n```\n' + r.output.substring(0,400) + '\n```');
      else if (!r.success) addHexMessage('JS error: ' + r.error);
      break;
    }

    // ── MAINTENANCE ──────────────────────────────────────
    case 'reg_write': {
      const rwR = await window.hexAPI.butler.regWrite(
        action.args[0], action.args[1], action.args[2], action.args[3], action.args[4]);
      addLog('BUTLER', rwR.success ? 'Reg written' : 'Reg write: '+rwR.error);
      addHexMessage(rwR.success ? 'Registry key written.' : 'Registry write failed: ' + rwR.error);
      break;
    }
    case 'list_games': {
      const [stR, epR] = await Promise.all([
        window.hexAPI.butler.getSteamGames().catch(function(){ return {success:false,games:[]}; }),
        window.hexAPI.butler.getEpicGames().catch(function(){ return {success:false,games:[]}; }),
      ]);
      const gParts = [];
      if (stR.success && stR.games.length) gParts.push('Steam ('+stR.games.length+'): '+stR.games.map(function(g){return g.name;}).join(', '));
      if (epR.success && epR.games.length) gParts.push('Epic ('+epR.games.length+'): '+epR.games.map(function(g){return g.name;}).join(', '));
      const gData = gParts.length ? gParts.join(' | ') : 'No games found';
      addLog('BUTLER', 'games: '+gData.substring(0,100));
      return { data: 'Installed games: '+gData };
    }
    case 'chkdsk': {
      const drive = action.args[0] || 'C';
      addHexMessage('Running CHKDSK on **' + drive + ':**… This may take a while.');
      const r = await window.hexAPI.butler.chkdsk(drive);
      addHexMessage('**CHKDSK ' + drive + ':**\n```\n' + (r.output||'').substring(0,500) + '\n```' + (r.note ? '\n_' + r.note + '_' : ''));
      addLog('BUTLER', 'chkdsk '+drive+': done');
      break;
    }


    // ── ZIP / UNZIP ───────────────────────────────────────────────────────────
    case 'zip': {
      const zSrc = action.args[0], zOut = action.args[1] || (action.args[0] + '.zip');
      if (!zSrc) { addHexMessage('Specify a source path to zip.'); break; }
      addHexMessage('Compressing ' + zSrc + '...');
      const zr = await window.hexAPI.butler.zip(zSrc, zOut);
      addHexMessage(zr.success ? 'Zipped to: ' + zr.output : 'Zip failed: ' + zr.error);
      addLog('BUTLER', zr.success ? 'Zipped: '+zr.output : 'Zip error: '+zr.error);
      break;
    }
    case 'unzip': {
      const uzPath = action.args[0], uzDest = action.args[1] || '';
      if (!uzPath) { addHexMessage('Specify an archive to extract.'); break; }
      addHexMessage('Extracting ' + uzPath + '...');
      const uzr = await window.hexAPI.butler.unzip(uzPath, uzDest);
      addHexMessage(uzr.success ? 'Extracted to: ' + uzr.dest : 'Unzip failed: ' + uzr.error);
      addLog('BUTLER', uzr.success ? 'Unzipped: '+uzr.dest : 'Unzip err: '+uzr.error);
      break;
    }

    // ── RUN / RUN_AS_ADMIN ────────────────────────────────────────────────────
    case 'run': {
      const runCmd = action.args[0], runArgs = action.args.slice(1).join(' ');
      if (!runCmd) break;
      addHexMessage('Running ' + runCmd + (runArgs ? ' ' + runArgs : '') + '...');
      const runR = await window.hexAPI.butler.run(runCmd, runArgs);
      if (runR.output) addHexMessage('Output:\n' + runR.output.substring(0, 500));
      addLog('BUTLER', runR.success ? 'Ran: '+runCmd : 'Run err: '+runR.error);
      break;
    }
    case 'run_as_admin': {
      const raaCmd = action.args.join(':');
      const raaR = await window.hexAPI.butler.runAsAdmin(raaCmd);
      addLog('BUTLER', raaR.success ? 'Admin run OK' : 'Admin run: '+raaR.error);
      break;
    }

    // ── WINDOW MANAGEMENT ─────────────────────────────────────────────────────
    case 'list_windows': {
      const lwR = await window.hexAPI.butler.listWindows();
      if (lwR.success && lwR.windows.length) {
        const lwLines = lwR.windows.slice(0,15).map(function(w){ return w.process+': '+w.title; }).join(', ');
        addLog('BUTLER', 'windows: '+lwR.windows.length+' open');
        return { data: 'Open windows ('+lwR.windows.length+'): '+lwLines };
      } else { addHexMessage(lwR.error || 'No windows found.'); }
      break;
    }
    case 'window': {
      const winAct = action.args[0], winTitle = action.args.slice(1).join(':');
      const winR = await window.hexAPI.butler.windowAction(winAct, winTitle);
      addLog('BUTLER', (winR.success ? 'Window '+winAct+': ' : 'Window err: ') + winTitle);
      addHexMessage(winR.success ? 'Window ' + winAct + ': ' + winTitle : 'Could not ' + winAct + ' "' + winTitle + '"');
      break;
    }
    case 'close_window': {
      const cwR = await window.hexAPI.butler.windowAction('close', action.args.join(':'));
      addLog('BUTLER', cwR.success ? 'Closed: '+action.args.join(':') : cwR.error);
      break;
    }
    case 'send_keys': {
      const skR = await window.hexAPI.butler.sendKeys(action.args.join(':'));
      addLog('BUTLER', skR.success ? 'SendKeys OK' : 'SendKeys: '+skR.error);
      if (!skR.success) addHexMessage('SendKeys failed: ' + skR.error);
      break;
    }
    case 'mouse_move': {
      const mmR = await window.hexAPI.butler.mouseMove(action.args[0], action.args[1]);
      addLog('BUTLER', mmR.success ? 'Mouse moved' : mmR.error);
      break;
    }
    case 'mouse_click': {
      const mcR = await window.hexAPI.butler.mouseClick(action.args[0] || 'left');
      addLog('BUTLER', mcR.success ? 'Clicked: '+(action.args[0]||'left') : mcR.error);
      break;
    }
    case 'paste_clipboard': {
      const pcR = await window.hexAPI.butler.pasteClipboard();
      addLog('BUTLER', 'Paste: '+(pcR.success ? 'OK' : pcR.error));
      break;
    }

    // ── CLIPBOARD IMAGE ───────────────────────────────────────────────────────
    case 'get_clipboard_img': {
      const gciR = await window.hexAPI.butler.getClipboardImg();
      if (gciR.success) {
        addHexMessage('Clipboard image saved to: ' + gciR.path);
        addLog('BUTLER', 'Clip img: '+gciR.path);
      } else { addHexMessage('No image in clipboard. ' + (gciR.error || '')); }
      break;
    }

    // ── NETWORK EXTRA ─────────────────────────────────────────────────────────
    case 'connect_wifi': {
      const cwfSsid = action.args[0], cwfPwd = action.args[1] || '';
      addHexMessage('Connecting to ' + cwfSsid + '...');
      const cwfR = await window.hexAPI.butler.connectWifi(cwfSsid, cwfPwd);
      addHexMessage(cwfR.success ? 'Connected to ' + cwfSsid + '.' : 'WiFi failed: ' + (cwfR.error || cwfR.output));
      addLog('BUTLER', cwfR.success ? 'WiFi: '+cwfSsid : 'WiFi err: '+cwfSsid);
      break;
    }
    case 'net_adapter': {
      const naAdapter = action.args[0], naAct = action.args[1] || 'enable';
      const naR = await window.hexAPI.butler.netAdapter(naAdapter, naAct);
      addLog('BUTLER', naR.success ? 'Adapter '+naAct+': '+naAdapter : naR.error);
      addHexMessage(naR.success ? 'Adapter ' + naAct + 'd: ' + naAdapter : 'Adapter error: ' + naR.error);
      break;
    }

    // ── AUTOMATION ────────────────────────────────────────────────────────────
    case 'sleep': {
      const slSecs = parseFloat(action.args[0]) || 1;
      addHexMessage('Waiting ' + slSecs + 's...');
      await window.hexAPI.butler.sleep(slSecs);
      addLog('BUTLER', 'Slept '+slSecs+'s');
      break;
    }
    case 'schedule_once': {
      const soTime = action.args[0], soCmd = action.args.slice(1).join(':');
      const soR = await window.hexAPI.butler.scheduleOnce(soTime, soCmd);
      addLog('BUTLER', soR.success ? 'Scheduled: '+soR.taskName : soR.error);
      addHexMessage(soR.success ? 'Task scheduled at ' + soTime + ' (name: ' + soR.taskName + ')' : 'Schedule failed: ' + soR.error);
      break;
    }
    case 'cancel_task': {
      const ctR = await window.hexAPI.butler.cancelTask(action.args[0]);
      addHexMessage(ctR.success ? 'Task cancelled: ' + action.args[0] : 'Cancel failed: ' + ctR.error);
      break;
    }
    case 'startup': {
      const suAct = action.args[0], suCmd = action.args.slice(1).join(':');
      const suR = await window.hexAPI.butler.startup(suAct, suCmd, 'HEX_app');
      addHexMessage(suR.success ? 'Startup ' + suAct + ': Done.' : 'Startup error: ' + suR.error);
      break;
    }

    // ── REGISTRY ──────────────────────────────────────────────────────────────
    case 'reg_read': {
      const rrHive = action.args[0], rrKey = action.args[1], rrVal = action.args[2] || '';
      const rrR = await window.hexAPI.butler.regRead(rrHive, rrKey, rrVal);
      if (rrR.success) {
        const rrLines = (rrR.values || []).map(function(v){ return v.name + ' = ' + v.data + ' (' + v.type + ')'; }).join('\n');
        addHexMessage('Registry ' + rrHive + '\\' + rrKey + ':\n' + (rrLines || rrR.raw || '(empty)'));
      } else { addHexMessage('Registry read failed: ' + rrR.error); }
      break;
    }

    // ── SOFTWARE ──────────────────────────────────────────────────────────────
    case 'list_software': {
      const lsR = await window.hexAPI.butler.listSoftware();
      if (lsR.success) {
        const lsTop = lsR.software.slice(0, 30).map(function(s){ return s.name+(s.version?' v'+s.version:''); }).join(', ');
        addLog('BUTLER', 'software: '+lsR.count+' installed');
        return { data: 'Installed software ('+lsR.count+' total): '+lsTop };
      } else { addHexMessage('Could not list software: ' + lsR.error); }
      break;
    }
    case 'check_updates': {
      addHexMessage('Checking for updates via winget...');
      const cuR = await window.hexAPI.butler.checkUpdates();
      addHexMessage(cuR.success ? 'Updates:\n' + cuR.output.substring(0, 600) : 'Updates check failed: ' + cuR.error);
      break;
    }
    case 'install_pkg': {
      const ipPkg = action.args.join(' ');
      addHexMessage('Installing ' + ipPkg + ' via winget...');
      const ipR = await window.hexAPI.butler.installPkg(ipPkg);
      addHexMessage(ipR.success ? 'Installed ' + ipPkg + '.' : 'Install failed: ' + (ipR.error || ipR.output));
      addLog('BUTLER', ipR.success ? 'Installed: '+ipPkg : 'Install err: '+ipPkg);
      break;
    }
    case 'uninstall': {
      const unPkg = action.args.join(' ');
      const unR = await window.hexAPI.butler.uninstall(unPkg);
      addHexMessage(unR.success ? 'Uninstalled ' + unPkg + '.' : 'Uninstall failed: ' + (unR.error || unR.output));
      addLog('BUTLER', unR.success ? 'Uninstalled: '+unPkg : 'Uninstall err: '+unPkg);
      break;
    }

    // ── PERIPHERALS ───────────────────────────────────────────────────────────
    case 'eject_usb': {
      const euR = await window.hexAPI.butler.ejectUsb(action.args[0] || 'E');
      addHexMessage(euR.success ? 'USB drive ' + euR.drive + ' ejected safely.' : 'Eject failed: ' + euR.error);
      addLog('BUTLER', euR.success ? 'Ejected: '+euR.drive : euR.error);
      break;
    }

    // ── SCRIPTING ─────────────────────────────────────────────────────────────
    case 'run_js': {
      const rjCode = action.args.join(':');
      const rjR = await window.hexAPI.butler.runJs(rjCode);
      addLog('BUTLER', rjR.success ? 'run_js OK' : 'run_js: '+rjR.error);
      if (rjR.success && rjR.output) addHexMessage('JS output:\n' + rjR.output.substring(0, 400));
      else if (!rjR.success) addHexMessage('JS error: ' + rjR.error);
      break;
    }

    // ── MAINTENANCE EXTRA ─────────────────────────────────────────────────────
    case 'reg_write': {
      const rwR = await window.hexAPI.butler.regWrite(
        action.args[0], action.args[1], action.args[2], action.args[3], action.args[4]);
      addLog('BUTLER', rwR.success ? 'Reg written' : 'Reg write: '+rwR.error);
      addHexMessage(rwR.success ? 'Registry key written.' : 'Registry write failed: ' + rwR.error);
      break;
    }
    case 'list_games': {
      const [stR, epR] = await Promise.all([
        window.hexAPI.butler.getSteamGames().catch(function(){ return {success:false,games:[]}; }),
        window.hexAPI.butler.getEpicGames().catch(function(){ return {success:false,games:[]}; }),
      ]);
      const gParts = [];
      if (stR.success && stR.games.length) gParts.push('Steam ('+stR.games.length+'): '+stR.games.map(function(g){return g.name;}).join(', '));
      if (epR.success && epR.games.length) gParts.push('Epic ('+epR.games.length+'): '+epR.games.map(function(g){return g.name;}).join(', '));
      const gData = gParts.length ? gParts.join(' | ') : 'No games found';
      addLog('BUTLER', 'games: '+gData.substring(0,100));
      return { data: 'Installed games: '+gData };
    }
    case 'chkdsk': {
      const cdDrive = action.args[0] || 'C';
      addHexMessage('Running CHKDSK on ' + cdDrive + ':... This may take a while.');
      const cdR = await window.hexAPI.butler.chkdsk(cdDrive);
      addHexMessage('CHKDSK ' + cdDrive + ':\n' + (cdR.output || '').substring(0, 500) + (cdR.note ? '\nNote: ' + cdR.note : ''));
      addLog('BUTLER', 'chkdsk '+cdDrive+': done');
      break;
    }

    case 'list_games': {
      addHexMessage('Scanning game libraries…');
      const [steamR, epicR] = await Promise.all([
        window.hexAPI.butler.getSteamGames().catch(() => ({ success: false, games: [] })),
        window.hexAPI.butler.getEpicGames().catch(() => ({ success: false, games: [] })),
      ]);
      const lines = [];
      if (steamR.success && steamR.games.length) {
        lines.push('**Steam (' + steamR.games.length + '):** ' + steamR.games.slice(0, 15).map(function(g){return g.name;}).join(', ') + (steamR.games.length > 15 ? ' …+' + (steamR.games.length - 15) + ' more' : ''));
      }
      if (epicR.success && epicR.games.length) {
        lines.push('**Epic (' + epicR.games.length + '):** ' + epicR.games.slice(0, 10).map(function(g){return g.name;}).join(', ') + (epicR.games.length > 10 ? ' …+' + (epicR.games.length - 10) + ' more' : ''));
      }
      if (!lines.length) {
        addHexMessage('No Steam or Epic games found. Are the launchers installed?');
      } else {
        addHexMessage('**Installed Games:**\n' + lines.join('\n'));
      }
      break;
    }
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
      style="padding:7px 10px;cursor:pointer;font-size:12px;font-family:monospace;\n             border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;\n             ${isActive ? 'background:var(--accent);color:#000;' : ''}">
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

// ═══════════════════════════════════════════════════════════════
//  DIRECT COMMAND PARSER
//  Catches unambiguous PC commands before they reach the AI.
//  Returns { handled: true } if executed, { handled: false } otherwise.
// ═══════════════════════════════════════════════════════════════
async function tryDirectCommand(text) {
  const raw = text.trim();
  const t   = raw.toLowerCase();

  const do_ = async (type, args, msg) => {
    if (msg) addHexMessage(msg);
    await handleAIAction({ type, args: args || [] });
    return { handled: true };
  };

  // ── Websites ──────────────────────────────────────────────────────────────
  const SITES = {
    'facebook':'https://facebook.com',   'fb':'https://facebook.com',
    'instagram':'https://instagram.com', 'insta':'https://instagram.com',
    'youtube':'https://youtube.com',     'yt':'https://youtube.com',
    'google':'https://google.com',
    'twitter':'https://twitter.com',     'x':'https://x.com',
    'reddit':'https://reddit.com',
    'gmail':'https://mail.google.com',
    'github':'https://github.com',
    'netflix':'https://netflix.com',
    'twitch':'https://twitch.tv',
    'amazon':'https://amazon.com',
    'wikipedia':'https://wikipedia.org',
    'linkedin':'https://linkedin.com',
    'tiktok':'https://tiktok.com',
    'whatsapp':'https://web.whatsapp.com',
    'chatgpt':'https://chat.openai.com',
    'claude':'https://claude.ai',
    'perplexity':'https://perplexity.ai',
    'gemini':'https://gemini.google.com',
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
    const GAME_NAMES = ['minecraft','roblox','gta','cs2','csgo','pubg','fortnite','valorant',
      'overwatch','elden ring','hogwarts','cyberpunk','witcher','fallout','skyrim','sims',
      'dota','tf2','halo','destiny','diablo','rocket league','among us','terraria','stardew',
      'celeste','hollow knight','portal','half-life','bioshock','dark souls','sekiro',
      'god of war','red dead','total war','civilization','cities skylines'];
    const GAME_WORDS = ['ring','souls','craft','wars','legend','duty','strike','fort','apex',
      'dota','rust','ark','war','saga','quest','blade','hero','dragon','knight','empire'];
    const looksLikeGame = GAME_NAMES.some(function(g){ return target.includes(g); }) ||
      GAME_WORDS.some(function(w){ return target.includes(w); });
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
  const FOLDERS = { desktop:1, documents:1, downloads:1, pictures:1, music:1, videos:1 };
  const folderM = t.match(/^(?:open|show|go\s+to|show\s+me)\s+(?:my\s+)?(\w+)(?:\s+folder)?$/);
  if (folderM && FOLDERS[folderM[1]]) {
    return do_('open_folder', [folderM[1]], 'Opening ' + folderM[1] + ' folder...');
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  const volM = t.match(/^(?:set\s+(?:the\s+)?volume\s+(?:to\s+)?|volume\s+)(\d+)%?$/);
  if (volM) return do_('set_volume', [volM[1]], 'Setting volume to ' + volM[1] + '%...');
  if (t === 'mute')   return do_('mute',   [], 'Muting audio...');
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
    const BAD = new Set(['a','an','the','my','some','file','folder','browser',
      'desktop','documents','downloads','pictures','music','videos','settings']);
    if (!BAD.has(name) && words.length <= 3 && !/[?!]/.test(name) &&
        !/\b(can|could|would|should|please|and|or)\b/.test(name)) {
      if (SITES[name]) return do_('open_url', [SITES[name]], 'Opening ' + name + '...');
      const cleanName = name.replace(/[.!?,;]+$/, '').trim();
      return do_('open_app', [cleanName], 'Opening ' + cleanName + '...');
    }
  }

  return { handled: false };
}