'use strict';

function dismissToast(toast) {
  if (!toast) return;
  clearTimeout(toast._timer);
  toast.classList.add('hiding');
  setTimeout(() => toast.remove(), 300);
}

function handleToastAction(action, toast) {
  if (action === 'dismiss') dismissToast(toast);
  else if (action === 'snooze15') {
    window.activityMonitor.sessionStart = Date.now() - 75 * 60000;
    dismissToast(toast);
    addLog('HEX', 'Break reminder snoozed 15 minutes.');
  }
}

function showToast(title, body, type = '', duration = 5000, actions = []) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = window.hexRenderUtils.createEl('div', { className: `toast ${type}`.trim() });
  toast.appendChild(window.hexRenderUtils.createEl('div', { className: 'toast-title', text: title }));
  toast.appendChild(window.hexRenderUtils.createEl('div', { className: 'toast-body', text: body }));

  if (actions.length > 0) {
    const actionRow = window.hexRenderUtils.createEl('div', { className: 'toast-actions' });
    actions.forEach((action) => {
      actionRow.appendChild(window.hexRenderUtils.createEl('button', {
        className: `toast-btn ${action.cls || ''}`.trim(),
        text: action.label,
        dataset: { toastAction: action.action }
      }));
    });
    toast.appendChild(actionRow);
  }

  container.appendChild(toast);
  if (type === 'alert') window.hexAudio.play('threat', 0.6);
  else window.hexAudio.play('toast', 0.6);

  toast._timer = setTimeout(() => dismissToast(toast), duration);
}

function addLog(source, message, level = 'info') {
  const el = document.getElementById('terminal-log');
  if (!el) return;

  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = window.hexRenderUtils.createEl('div', { className: `log-line src-${source}` });
  line.appendChild(window.hexRenderUtils.createEl('span', { className: 'log-ts', text: `[${ts}]` }));
  line.appendChild(window.hexRenderUtils.createEl('span', { className: 'log-source', text: `[${source}]` }));
  line.appendChild(window.hexRenderUtils.createEl('span', {
    className: 'log-text',
    text: String(message).substring(0, 200)
  }));
  el.appendChild(line);

  while (el.children.length > 200) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function clearTerminal() {
  const el = document.getElementById('terminal-log');
  if (!el) return;
  window.hexRenderUtils.clearNode(el);
  addLog('SYSTEM', 'Terminal cleared.');
}

function toggleTerminal() {
  const bottom = document.getElementById('panel-bottom');
  const btn = document.getElementById('terminal-toggle');
  if (!bottom) return;
  const collapsed = bottom.classList.toggle('terminal-collapsed');
  if (btn) btn.textContent = collapsed ? '▲ SHOW' : '▼ HIDE';
}

document.addEventListener('click', async (event) => {
  const toastButton = event.target.closest('[data-toast-action]');
  if (toastButton) {
    handleToastAction(toastButton.dataset.toastAction, toastButton.closest('.toast'));
    return;
  }

  const chatButton = event.target.closest('.chat-action-btn[data-hex-action]');
  if (chatButton) {
    const pathValue = chatButton.dataset.path;
    if (chatButton.dataset.hexAction === 'openFile') await window.hexAPI.butler.openFile(pathValue);
    if (chatButton.dataset.hexAction === 'openFolder') await window.hexAPI.butler.openFolder(pathValue);
    return;
  }

  const processButton = event.target.closest('[data-process-kill]');
  if (processButton) {
    await killProcess(Number(processButton.dataset.processKill), processButton.dataset.processName || '');
    return;
  }

  const pluginReload = event.target.closest('[data-plugin-reload]');
  if (pluginReload) {
    await reloadPlugin(pluginReload.dataset.pluginReload);
    return;
  }

  const pluginRemove = event.target.closest('[data-plugin-remove]');
  if (pluginRemove) {
    await removeMarketplacePlugin(pluginRemove.dataset.pluginRemove);
    return;
  }

  const clipItem = event.target.closest('[data-clipboard-index]');
  if (clipItem) {
    await pasteClipboardIndex(Number(clipItem.dataset.clipboardIndex));
    return;
  }

  const recurringButton = event.target.closest('[data-recurring-cancel]');
  if (recurringButton) {
    await cancelRecurring(recurringButton.dataset.recurringCancel);
    return;
  }

  const memoryDelete = event.target.closest('[data-memory-delete]');
  if (memoryDelete) {
    deleteMemoryFact(Number(memoryDelete.dataset.memoryDelete));
    return;
  }

  const personaActivate = event.target.closest('[data-persona-activate]');
  if (personaActivate) {
    activatePersonality(personaActivate.dataset.personaActivate);
    return;
  }

  const personaEdit = event.target.closest('[data-persona-edit]');
  if (personaEdit) {
    editPersonality(personaEdit.dataset.personaEdit);
    return;
  }

  const personaClone = event.target.closest('[data-persona-clone]');
  if (personaClone) {
    clonePersonality(personaClone.dataset.personaClone);
    return;
  }

  const personaDelete = event.target.closest('[data-persona-delete]');
  if (personaDelete) {
    deletePersonality(personaDelete.dataset.personaDelete);
    return;
  }

  const pickerToggle = event.target.closest('[data-model-picker-toggle]');
  if (pickerToggle) {
    renderModelPicker(pickerToggle.dataset.modelPickerToggle === 'free');
    return;
  }

  const modelRow = event.target.closest('[data-model-id]');
  if (modelRow) {
    selectModel(modelRow.dataset.modelId);
    return;
  }

  const liveProvider = event.target.closest('[data-live-provider]');
  if (liveProvider) {
    selectLiveProvider(liveProvider.dataset.liveProvider);
    return;
  }

  const quickAction = event.target.closest('[data-qa-task], [data-qa-fn]');
  if (quickAction) {
    if (quickAction.dataset.qaTask) {
      await runTask(quickAction.dataset.qaTask);
    } else if (quickAction.dataset.qaFn && typeof window[quickAction.dataset.qaFn] === 'function') {
      window[quickAction.dataset.qaFn]();
    }
  }
});

window.dismissToast = dismissToast;
window.handleToastAction = handleToastAction;
window.showToast = showToast;
window.addLog = addLog;
window.clearTerminal = clearTerminal;
window.toggleTerminal = toggleTerminal;
