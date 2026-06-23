window.hexSystemActionHandler = (() => {
  const noteDesktopOutcome = (...args) => window.hexActionHelpers?.noteDesktopOutcome?.(...args);

  function recordMemoryOutcome(key, success, error) {
    if (window.hexMemory?.recordActionOutcome) {
      window.hexMemory.recordActionOutcome(key, success, error || '');
    }
  }

  async function handle(action) {
    switch (action.type) {
      case 'list_processes': {
        const r = await window.hexAPI.butler.listProcesses();
        if (r.success) {
          window.hexCandidatePublishers?.publishProcesses(r.processes || []);
          window.hexPcEntityMemory?.ingest?.((r.processes || []).map((p) => ({ kind: 'process', label: p.name || '', value: p.name || '', meta: { pid: p.pid || null, cpu: p.cpu || null, mem: p.mem || null } })), 'process', 1);
          window.hexPcAwarenessRefresh?.noteAction?.('process');
          const top = r.processes
            .slice(0, 10)
            .map((p) => `${p.name} CPU:${p.cpu} RAM:${p.mem}`)
            .join(', ');
          addLog('BUTLER', `processes: ${top}`);
          recordMemoryOutcome('list_processes_ok', true);
          return { handled: true, result: { data: `Running processes: ${top}` } };
        }
        return { handled: true, result: { data: `Failed to list processes: ${r.error}` } };
      }

      case 'kill_process': {
        const procName = action.args[0];
        const r = await window.hexAPI.butler.killByName(procName);
        addLog('BUTLER', r.success ? `Killed: ${procName}` : `Kill: ${r.error}`);
        addHexMessage(r.success ? `**Process terminated:** ${procName}` : `Kill failed: ${r.error}`);
        if (r.success) {
          noteDesktopOutcome({
            kind: 'process',
            label: procName,
            value: procName,
            meta: { action: 'kill', source: 'process-action' }
          }, 'process', true);
        } else {
          noteDesktopOutcome({
            kind: 'process',
            label: procName,
            value: procName,
            meta: { action: 'kill', source: 'process-action' }
          }, 'process', false, r.error || '');
        }
        recordMemoryOutcome(`kill_process:${procName}`, r.success, r.error);
        return { handled: true };
      }

      case 'kill_pid': {
        const pidStr = action.args[0];
        const r = await window.hexAPI.killProcess(parseInt(pidStr, 10));
        addLog('BUTLER', r.success ? `Killed PID ${pidStr}` : `Kill PID: ${r.error}`);
        recordMemoryOutcome(`kill_pid:${pidStr}`, r.success, r.error);
        return { handled: true };
      }

      case 'sys_info': {
        const r = await window.hexAPI.butler.sysInfo();
        if (r.success) {
          const info = `OS: ${r.os} | Host: ${r.hostname} | Uptime: ${r.uptime} | CPU: ${r.cpu} | RAM: ${r.ramUsed}/${r.ramTotal} (${r.ramFree} free)`;
          addLog('BUTLER', `sys_info: ${info}`);
          return { handled: true, result: { data: info } };
        }
        return { handled: true, result: { data: `System info failed: ${r.error}` } };
      }

      case 'battery': {
        const r = await window.hexAPI.butler.battery();
        if (r.success) {
          const info = r.hasBattery
            ? `Battery: ${r.percent}% ${r.isCharging ? '(charging)' : '(discharging)'} time remaining: ${r.timeRemaining}`
            : 'No battery (desktop PC)';
          addLog('BUTLER', info);
          return { handled: true, result: { data: info } };
        }
        return { handled: true, result: { data: `Battery query failed: ${r.error}` } };
      }

      case 'disk_usage': {
        const r = await window.hexAPI.butler.diskUsage(action.args[0]);
        if (r.success) {
          const lines = r.disks
            .map((d) => `${d.mount} (${d.fs}): ${d.used}/${d.total} used, ${d.free} free (${d.pct})`)
            .join(', ');
          addLog('BUTLER', `disk_usage: ${lines}`);
          return { handled: true, result: { data: `Disk: ${lines}` } };
        }
        return { handled: true, result: { data: `Disk usage failed: ${r.error}` } };
      }

      case 'reg_read': {
        const parts = action.args.join(':').split('|');
        const r = await window.hexAPI.butler.regRead(parts[0], parts[1], parts[2]);
        const data = r.success ? `Registry Data: ${r.data}` : `Registry failed: ${r.error}`;
        if (r.success) {
          addLog('BUTLER', `Registry Read: ${r.data}`);
        }
        return { handled: true, result: { data } };
      }

      case 'reg_write': {
        const parts = action.args.join(':').split('|');
        const r = await window.hexAPI.butler.regWrite(parts[0], parts[1], parts[2], parts[3], parts[4]);
        addHexMessage(r.success ? 'Registry key modified successfully.' : `Registry modification failed: ${r.error}`);
        return { handled: true };
      }

      case 'run': {
        const cmdArgs = [...action.args];
        const cmd = cmdArgs[0];
        const cmdArguments = cmdArgs.slice(1).join(':') || '';
        const r = await window.hexAPI.butler.run(cmd, cmdArguments);
        addHexMessage(r.success ? `Launched: ${cmd}` : `Run failed: ${r.error}`);
        return { handled: true };
      }

      case 'run_as_admin': {
        const cmd = action.args.join(':');
        const r = await window.hexAPI.butler.runAsAdmin(cmd);
        addHexMessage(r.success ? `Executed via UAC: ${cmd}` : `UAC Elevation failed: ${r.error}`);
        return { handled: true };
      }

      case 'sleep': {
        const ms = action.args[0] || '1';
        await window.hexAPI.butler.sleep(ms);
        return { handled: true };
      }

      case 'set_reminder': {
        let delayMs = parseInt(action.args[0], 10);
        let label = action.args.slice(1).join(' ').trim();
        if (!delayMs || Number.isNaN(delayMs) || delayMs < 1000) delayMs = 60000;
        if (!label) label = 'Unknown reminder';

        addLog('BUTLER', `Setting reminder: "${label}" for ${delayMs}ms`);
        const r = await window.hexAPI.setReminder({ id: `rem_${Date.now()}`, label, delayMs });
        if (r?.success) {
          const friendlyMin = Math.round(delayMs / 60000);
          const tf = friendlyMin > 0 ? `in ${friendlyMin} min` : `in ${Math.round(delayMs / 1000)} sec`;
          addHexMessage(`**Reminder set:** "${label}" (${tf})`);
        } else {
          addHexMessage(`**Failed to set reminder:** ${r?.error}`);
        }
        return { handled: true };
      }

      case 'schedule_recurring': {
        const cron = action.args[0];
        const label = action.args[1];
        const command = action.args.slice(2).join(':').trim();
        if (!cron || !label || !command) {
          addHexMessage('**Failed to schedule:** Missing parameters for recurring task.');
          return { handled: true };
        }

        addLog('BUTLER', `Setting recurring schedule: "${label}" (${cron}) -> ${command}`);
        const r = await window.hexAPI.recurring.add(cron, label, command);
        if (r?.success) {
          addHexMessage(`**Recurring task set:** "${label}"\nSchedule: \`${cron}\`\nAction: \`${command}\``);
        } else {
          addHexMessage(`**Failed to schedule:** ${r?.error}`);
        }
        return { handled: true };
      }

      case 'schedule_once': {
        const time = action.args[0];
        const cmd = action.args.slice(1).join(':');
        const r = await window.hexAPI.butler.scheduleOnce(time, cmd);
        addHexMessage(r.success ? `System task created: ${r.taskName} at ${time}` : `Scheduling failed: ${r.error}`);
        return { handled: true };
      }

      case 'cancel_task': {
        const taskName = action.args.join(':');
        const r = await window.hexAPI.cancelTask(taskName);
        addHexMessage(r.success ? `Cancelled task: ${taskName}` : `Cancellation failed: ${r.error}`);
        return { handled: true };
      }

      case 'startup': {
        const act = action.args[0] || '';
        const cmd = action.args[1] || '';
        const name = action.args[2] || '';
        const r = await window.hexAPI.butler.startup(act, cmd, name);
        addHexMessage(r.success ? 'Startup item updated successfully.' : `Startup modification failed: ${r.error}`);
        return { handled: true };
      }

      case 'list_windows': {
        const r = await window.hexAPI.butler.listWindows();
        if (r.success) {
          window.hexCandidatePublishers?.publishWindows(r.windows || []);
          window.hexPcEntityMemory?.ingest?.((r.windows || []).map((w) => ({ kind: 'window', label: w.MainWindowTitle || '', value: w.MainWindowTitle || '', meta: { pid: w.Id || null, processName: w.ProcessName || '' } })), 'window', 1);
          window.hexPcAwarenessRefresh?.noteAction?.('window');
          const wins = r.windows.map((w) => w.MainWindowTitle).slice(0, 15).join(', ');
          addLog('BUTLER', `Found ${r.windows.length} open windows.`);
          return { handled: true, result: { data: `Open Windows: ${wins}` } };
        }
        return { handled: true, result: { data: `Failed to list windows: ${r.error}` } };
      }

      case 'window': {
        const act = action.args[0];
        const title = action.args.slice(1).join(':');
        const r = await window.hexAPI.butler.windowAction(act, title);
        addHexMessage(r.success ? `Window ${act}: \`${title}\`` : `Window action failed: ${r.error}`);
        noteDesktopOutcome({
          kind: 'window',
          label: title,
          value: title,
          meta: { action: act, source: 'window-action' }
        }, 'window', !!r.success, r.error || '');
        return { handled: true };
      }

      case 'close_window': {
        const title = action.args.join(':');
        const r = await window.hexAPI.butler.windowAction('close', title);
        addHexMessage(r.success ? `Closed window: \`${title}\`` : `Failed to close: ${r.error}`);
        noteDesktopOutcome({
          kind: 'window',
          label: title,
          value: title,
          meta: { action: 'close', source: 'window-action' }
        }, 'window', !!r.success, r.error || '');
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();




