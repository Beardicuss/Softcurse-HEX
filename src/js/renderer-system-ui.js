'use strict';

let glitchScheduled = 0;
let lastAlertCpu = 0;
let lastAlertRam = 0;

function updateClock() {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');

  const clock = document.getElementById('clock');
  const dateEl = document.getElementById('date-display');
  if (clock) clock.textContent = time;
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  if (now.getSeconds() % 8 === 0 && now.getSeconds() !== glitchScheduled && clock) {
    glitchScheduled = now.getSeconds();
    clock.classList.add('glitch-burst');
    setTimeout(() => clock.classList.remove('glitch-burst'), 400);
  }
}

function setVitalValue(id, value, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.className = 'vital-value mono' + (cls ? ` ${cls}` : '');
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(pct, 100) + '%';
  el.className = 'stat-bar-fill' + (pct > 90 ? ' high' : pct > 70 ? ' mid' : '');
}

function updateStats(data) {
  sysStats = data;

  setVitalValue('v-cpu', `${data.cpu}%`, data.cpu > 80 ? (data.cpu > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-ram', `${data.ram}%`, data.ram > 80 ? (data.ram > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-disk', `${data.disk}%`, data.disk > 90 ? 'warn' : '');
  setVitalValue('v-gpu', data.gpu != null ? `${data.gpu}%` : '—', data.gpu > 80 ? (data.gpu > 95 ? 'crit' : 'warn') : '');
  setVitalValue('v-gpu-temp', data.gpuTemp || '—', '');
  setVitalValue('v-netrx', data.netRx || '—', 'net');
  setVitalValue('v-nettx', data.netTx || '—', 'net');
  setVitalValue('v-temp', data.temp || '—', '');

  setBar('bar-cpu', data.cpu);
  setBar('bar-ram', data.ram);
  setBar('bar-disk', data.disk);

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

function animateCount(id, target, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent, 10) || 0;
  const diff = target - start;
  const duration = 600;
  const steps = 30;
  let current = 0;

  const interval = setInterval(() => {
    current += 1;
    const value = Math.round(start + diff * (current / steps));
    el.textContent = value.toLocaleString() + suffix;
    el.classList.add('animating');
    if (current >= steps) {
      clearInterval(interval);
      el.textContent = target.toLocaleString() + suffix;
      el.classList.remove('animating');
    }
  }, duration / steps);
}

function updateHealthStats() {
  const stats = window.activityMonitor.stats;
  animateCount('stat-files', stats.filesScanned);
  document.getElementById('stat-space').textContent = stats.spaceFreed || '0 B';
  animateCount('stat-threats', stats.threatsKilled);

  const health = stats.sessionHealth || 0;
  animateCount('stat-integrity', health, '%');
  const bar = document.getElementById('integrity-bar');
  if (bar) bar.style.width = health + '%';

  if (health < 80 && (!window._threatPlayed || Date.now() - window._threatPlayed > 60000)) {
    window.hexAudio?.play('threat', 1.0);
    window._threatPlayed = Date.now();
  }

  const logEl = document.getElementById('task-run-log');
  if (!logEl) return;

  window.hexRenderUtils.clearNode(logEl);
  if (!stats.tasksRun || Object.keys(stats.tasksRun).length === 0) return;

  Object.entries(stats.tasksRun).forEach(([id, info]) => {
    const row = window.hexRenderUtils.createEl('div', { className: 'task-log-row' });
    row.appendChild(window.hexRenderUtils.createEl('span', {
      className: 'task-log-name',
      text: id.replace(/_/g, ' ').toUpperCase()
    }));
    row.appendChild(window.hexRenderUtils.createEl('span', {
      className: 'task-log-meta',
      text: `${info.count}x${info.lastRun ? ' · ' + info.lastRun : ''}${info.dur ? ' · ' + info.dur : ''}`
    }));
    logEl.appendChild(row);
  });
}

function handleProactiveMsg(msg) {
  switch (msg.type) {
    case 'break': {
      const text = window.i18n.getRandomBreakSuggestion(config.userName, msg.activeMin);
      addHexMessage(text);
      showToast('◆ HEX ADVISORY', text, 'warn', 10000, [
        { label: window.i18n.t('break_dismiss'), action: 'dismiss' },
        { label: window.i18n.t('break_snooze'), action: 'snooze15', cls: 'snooze' }
      ]);
      addLog('HEX', text);
      if (config.voice?.enabled !== false) speakWithConfig(text);
      break;
    }
    case 'return': {
      const text = window.i18n.t('return_from_idle', { min: msg.idleMin });
      addHexMessage(text);
      addLog('HEX', text);
      if (config.voice?.enabled !== false) speakWithConfig(text);
      break;
    }
    case 'high_cpu': {
      const text = `CPU at ${msg.cpu}% — consider closing unused applications.`;
      showToast('◆ SYSTEM ALERT', text, 'alert', 6000);
      addHexMessage(`**High CPU detected** (${msg.cpu}%). Consider closing unused apps.`);
      addLog('SYSTEM', `High CPU: ${msg.cpu}%`, 'warn');
      if (config.voice?.enabled !== false) speakWithConfig(text);
      break;
    }
    case 'high_ram': {
      const text = `RAM at ${msg.ram}% — memory pressure critical.`;
      showToast('◆ SYSTEM ALERT', text, 'alert', 6000);
      addHexMessage(`**Memory pressure** at ${msg.ram}%. You may want to close some programs.`);
      addLog('SYSTEM', `High RAM: ${msg.ram}%`, 'warn');
      if (config.voice?.enabled !== false) speakWithConfig(text);
      break;
    }
    case 'late_night': {
      const text = `It's ${msg.hour}:xx. You've been running for ${msg.activeMin} min. Rest optimizes performance.`;
      if (!prevAlerts.late_night) {
        prevAlerts.late_night = Date.now();
        addHexMessage(`**Late night protocol.** ${text}`);
        showToast('◆ HEX CARES', text, 'warn', 10000);
        if (config.voice?.enabled !== false) speakWithConfig(text);
      }
      break;
    }
  }
}

window.updateClock = updateClock;
window.updateStats = updateStats;
window.setVitalValue = setVitalValue;
window.setBar = setBar;
window.animateCount = animateCount;
window.updateHealthStats = updateHealthStats;
window.handleProactiveMsg = handleProactiveMsg;
