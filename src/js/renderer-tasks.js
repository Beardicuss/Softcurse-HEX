'use strict';

window.getActiveTask = function getActiveTask() {
  const taskState = window.hexTaskState || {};
  for (const [id, state] of Object.entries(taskState)) {
    if (state.status === 'running') return id;
  }
  return null;
};

window.runTask = async function runTask(taskId) {
  const taskState = window.hexTaskState || (window.hexTaskState = {});
  if (taskState[taskId]?.status === 'running') return;

  const isBrowserCache = taskId === 'browser_cache';
  taskState[taskId] = { status: 'running', startTime: Date.now() };
  window.setTaskStatus(taskId, 'running');
  addLog('SYSTEM', `Task started: ${taskId}`);

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
    window.setTaskStatus(taskId, result.success ? 'success' : 'error', dur);

    if (result.success) {
      window.activityMonitor.recordTaskResult(taskId, result, dur);
      updateHealthStats();
      addLog('SYSTEM', `Task ${taskId} completed in ${dur}`);

      const msg = `${taskId.replace(/_/g, ' ')} completed in ${dur}.` +
        (result.freed ? ` Freed: ${result.freed}.` : '') +
        (result.warning ? ` ⚠ ${result.warning}` : '');
      addHexMessage(`**Task complete.** ${msg}`);

      if (result.warning) showToast('◆ ADMIN REQUIRED', result.warning, 'warn', 8000);

      const endKey = taskId === 'defender_scan' ? 'scan_complete_clean_phrases' : 'task_complete_phrases';
      const endArr = window.i18n.t(endKey);
      if (Array.isArray(endArr) && endArr.length > 0) {
        const phrase = endArr[Math.floor(Math.random() * endArr.length)];
        if (typeof speakWithConfig === 'function') speakWithConfig(phrase);
      }
    } else {
      addLog('ERROR', `Task ${taskId} failed: ${result.error || 'unknown'}`);

      const errArr = window.i18n.t('task_error_phrases');
      if (Array.isArray(errArr) && errArr.length > 0) {
        const phrase = errArr[Math.floor(Math.random() * errArr.length)];
        if (typeof speakWithConfig === 'function') speakWithConfig(phrase);
        addHexMessage(`**Warning.** ${taskId.replace(/_/g, ' ')}: ${phrase}`);
      } else {
        addHexMessage(`**Warning.** ${taskId.replace(/_/g, ' ')} encountered an error. Check the terminal log.`);
      }
    }
  } catch (error) {
    taskState[taskId] = { status: 'error' };
    window.setTaskStatus(taskId, 'error', '—');
    addLog('ERROR', `Task ${taskId}: ${error?.message || String(error)}`);
  }
};

window.setTaskStatus = function setTaskStatus(taskId, status, dur) {
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
      setTimeout(() => {
        if (prog) prog.style.width = '0%';
      }, 2000);
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
};
