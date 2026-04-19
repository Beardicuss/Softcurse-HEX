'use strict';

async function openProcesses() {
  document.getElementById('process-overlay')?.classList.add('open');
  await refreshProcesses();
}

function closeProcesses() {
  document.getElementById('process-overlay')?.classList.remove('open');
}

async function refreshProcesses() {
  const list = document.getElementById('process-list');
  if (!list) return;

  window.hexRenderUtils.setPlainText(list, 'Loading...');

  try {
    const procs = await window.hexAPI.getProcesses();
    window.hexRenderUtils.clearNode(list);

    procs.forEach((processInfo) => {
      const row = window.hexRenderUtils.createEl('div', { className: 'process-row' });
      row.appendChild(window.hexRenderUtils.createEl('span', { className: 'p-pid', text: processInfo.pid }));
      row.appendChild(window.hexRenderUtils.createEl('span', {
        className: 'p-name',
        text: processInfo.name,
        title: processInfo.name
      }));
      row.appendChild(window.hexRenderUtils.createEl('span', { className: 'p-cpu', text: `${processInfo.cpu}%` }));
      row.appendChild(window.hexRenderUtils.createEl('span', { className: 'p-mem', text: processInfo.mem }));
      row.appendChild(window.hexRenderUtils.createEl('button', {
        className: 'p-kill',
        text: window.i18n.t('kill_process'),
        dataset: {
          processKill: processInfo.pid,
          processName: processInfo.name,
        }
      }));
      list.appendChild(row);
    });
  } catch (error) {
    window.hexRenderUtils.setPlainText(list, error?.message || String(error));
  }
}

async function killProcess(pid, name) {
  if (!confirm(`${window.i18n.t('confirm_kill', { name, pid })}`)) return;
  const result = await window.hexAPI.killProcess(pid);
  addLog('SYSTEM', result.success ? `Terminated: ${name} (${pid})` : `Failed to kill ${pid}: ${result.error}`);
  await refreshProcesses();
}

window.openProcesses = openProcesses;
window.closeProcesses = closeProcesses;
window.refreshProcesses = refreshProcesses;
window.killProcess = killProcess;
