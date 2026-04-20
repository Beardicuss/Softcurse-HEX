'use strict';
// ── main/ipc-system.js ────────────────────────────────────────────────────────
// IPC handlers:
//   window:minimize/maximize/close/drag-start/drag-move/drag-stop
//   system:get-info, system:health, system:capture-screen-base64
//   system:safe-exec, system:exec-with-confirm
//   ollama:list-models
//   browser:open-url

const os   = require('os');
const path = require('path');

module.exports = function registerSystemIPC({
  ipcMain, ipcOn,
  screen, shell, dialog, app,
  si, fetch,
  getConfig,
  getWindow,
  safeSend, sendLog,
  runCmd, butlerExec,
  SAFE_COMMANDS,
}) {
  // ── Window controls ────────────────────────────────────────────────────────
  ipcOn('window:minimize', () => getWindow()?.minimize());
  ipcOn('window:maximize', () => {
    const w = getWindow();
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcOn('window:close', () => getWindow()?.close());

  let dragStartWindowPos = null;
  let dragStartMousePos  = null;

  ipcOn('window:drag-start', (_event) => {
    const win = getWindow();
    if (!win) return;
    dragStartWindowPos = win.getPosition();
    dragStartMousePos  = screen.getCursorScreenPoint();
  });

  ipcOn('window:drag-move', (_event) => {
    const win = getWindow();
    if (!win || !dragStartWindowPos || !dragStartMousePos) return;
    const cur  = screen.getCursorScreenPoint();
    const dx   = cur.x - dragStartMousePos.x;
    const dy   = cur.y - dragStartMousePos.y;
    win.setPosition(dragStartWindowPos[0] + dx, dragStartWindowPos[1] + dy);
  });

  ipcOn('window:drag-stop', () => {
    dragStartWindowPos = null;
    dragStartMousePos  = null;
  });

  // ── System info ────────────────────────────────────────────────────────────
  ipcMain.handle('system:get-info', async () => {
    const [cpu, mem, osInfo] = await Promise.allSettled([si.cpu(), si.mem(), si.osInfo()]);
    return {
      cpu:      cpu.status      === 'fulfilled' ? cpu.value      : {},
      mem:      mem.status      === 'fulfilled' ? mem.value      : {},
      os:       osInfo.status   === 'fulfilled' ? osInfo.value   : {},
      uptime:   os.uptime(),
      platform: process.platform,
    };
  });

  // ── System health ──────────────────────────────────────────────────────────
  ipcMain.handle('system:health', async () => {
    try {
      const [cpu, mem, disk, temp, battery, net] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.cpuTemperature().catch(() => null),
        si.battery().catch(() => null),
        si.networkStats().catch(() => null),
      ]);

      const result = {
        cpu:   { load: Math.round(cpu.currentLoad * 10) / 10, cores: cpu.cpus?.length || os.cpus().length },
        ram:   {
          total_gb: Math.round(mem.total  / 1e9 * 10) / 10,
          used_gb:  Math.round(mem.active / 1e9 * 10) / 10,
          free_gb:  Math.round(mem.available / 1e9 * 10) / 10,
          percent:  Math.round(mem.active / mem.total * 100),
        },
        disks:       (disk || []).map(d => ({
          mount:   d.mount,
          size_gb: Math.round(d.size / 1e9),
          used_gb: Math.round(d.used / 1e9),
          percent: Math.round(d.use),
        })),
        temperature: temp?.main ? Math.round(temp.main) + '°C' : null,
        battery:     battery?.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null,
        network:     net?.[0] ? {
          iface:  net[0].iface,
          rx_sec: Math.round(net[0].rx_sec / 1024) + ' KB/s',
          tx_sec: Math.round(net[0].tx_sec / 1024) + ' KB/s',
        } : null,
        uptime_hrs: Math.round(os.uptime() / 3600 * 10) / 10,
      };

      result.alerts = [];
      if (result.ram.percent > 85)     result.alerts.push(`⚠ RAM usage: ${result.ram.percent}%`);
      if (result.cpu.load > 80)        result.alerts.push(`⚠ CPU load: ${result.cpu.load}%`);
      for (const d of result.disks) {
        if (d.percent > 90) result.alerts.push(`⚠ Disk ${d.mount}: ${d.percent}% full`);
      }
      if (temp?.main && temp.main > 80) result.alerts.push(`🔥 CPU temp: ${temp.main}°C`);

      return { success: true, health: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Screen capture ─────────────────────────────────────────────────────────
  ipcMain.handle('butler:screenshot', async () => {
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      if (!sources || !sources.length) return { success: false, error: 'No screen sources found' };
      const pngBuffer = sources[0].thumbnail.toPNG();
      const ts        = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const outPath   = path.join(os.homedir(), 'Desktop', `screenshot_${ts}.png`);
      require('fs').writeFileSync(outPath, pngBuffer);
      sendLog('BUTLER', `Screenshot saved: ${outPath}`, 'info');
      shell.openPath(outPath);
      return { success: true, path: outPath };
    } catch (err) {
      sendLog('BUTLER', `Screenshot failed: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('system:capture-screen-base64', async () => {
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
      if (!sources || !sources.length) return null;
      return sources[0].thumbnail.toDataURL();
    } catch (e) {
      console.error('Vision capture error:', e);
      return null;
    }
  });

  // ── Safe exec ──────────────────────────────────────────────────────────────
  ipcMain.handle('system:safe-exec', async (_, cmd) => {
    const first = cmd.trim().split(/\s+/)[0].toLowerCase();
    if (!SAFE_COMMANDS.some(s => first.includes(s))) {
      return { success: false, error: 'Command not in safe list. Confirm in dialog.' };
    }
    try { return { success: true, output: await runCmd(cmd) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('system:exec-with-confirm', async (_event, cmd) => {
    const result = await dialog.showMessageBox(getWindow(), {
      type: 'warning', buttons: ['Cancel', 'Execute'],
      title: 'Command Execution',
      message: `Execute this command?\n\n${cmd}\n\nProceed with caution.`,
    });
    if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
    try { return { success: true, output: await runCmd(cmd) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // ── Ollama model discovery ─────────────────────────────────────────────────
  ipcMain.handle('ollama:list-models', async () => {
    try {
      const baseUrl = getConfig().llm?.baseUrl || 'http://localhost:11434';
      const res     = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data   = await res.json();
      const models = (data.models || []).map(m => ({
        name:     m.name,
        size:     m.size ? Math.round(m.size / 1e9 * 10) / 10 + ' GB' : '?',
        modified: m.modified_at || '',
      }));
      return { success: true, models };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Browser open URL ───────────────────────────────────────────────────────
  ipcMain.handle('browser:open-url', (_, url) => {
    shell.openExternal(url);
    return { success: true };
  });
};
