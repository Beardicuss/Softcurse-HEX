'use strict';
// ── main/ipc-butler-extended.js ───────────────────────────────────────────────
// Butler IPC handlers that live in main.js but are not in ipc-butler.js.
// Covers: clipboard r/w, audio/volume, network, environment, scripting,
//         logoff, wallpaper, run-js, file ops, smart files, screen recording,
//         weather, qr-code, speed-test, morning-digest, define, translate,
//         send-email, download-media.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec, spawn } = require('child_process');

module.exports = function registerButlerExtendedIPC({
  ipcMain, app, shell, dialog,
  clipboard,                 // require('electron').clipboard
  getConfig,
  getWindow,
  butlerExec, sendLog,
  activeReminders,           // from ipc-reminders — for morning digest
}) {
  // ── Clipboard r/w ──────────────────────────────────────────────────────────
  ipcMain.handle('butler:get-clipboard', () => {
    try { return { success: true, text: clipboard.readText() }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:set-clipboard', (_, { text }) => {
    try { clipboard.writeText(text || ''); sendLog('BUTLER', 'Clipboard set.'); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:clear-clipboard', () => {
    try { clipboard.clear(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // ── Audio / volume ─────────────────────────────────────────────────────────
  ipcMain.handle('butler:set-volume', async (_, { level }) => {
    const v = Math.max(0, Math.min(100, parseInt(level) || 50));
    if (process.platform === 'win32') {
      const r1 = await butlerExec(`nircmd setsysvolume ${Math.round(v / 100 * 65535)}`, { timeout: 5000 });
      if (r1.ok) { sendLog('BUTLER', `Volume -> ${v}% (nircmd)`); return { success: true, level: v }; }
      const steps = Math.round(v / 2);
      const ps    = `$wsh=New-Object -ComObject WScript.Shell; ` +
        `for($i=0;$i-lt 50;$i++){$wsh.SendKeys([char]174)}; ` +
        `for($i=0;$i-lt ${steps};$i++){$wsh.SendKeys([char]175)}`;
      const r2 = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 15000 });
      sendLog('BUTLER', `Volume -> ${v}%` + (r2.ok ? '' : ' (approx)'));
      return { success: true, level: v, note: r2.ok ? '' : 'Install nircmd for precise volume control.' };
    } else if (process.platform === 'darwin') {
      await butlerExec(`osascript -e 'set volume output volume ${v}'`);
    } else {
      await butlerExec(`amixer -q sset Master ${v}%`);
    }
    sendLog('BUTLER', `Volume -> ${v}%`);
    return { success: true, level: v };
  });

  ipcMain.handle('butler:mute', async (_, { mute }) => {
    const doMute = mute !== false;
    if (process.platform === 'win32') {
      const cmd = doMute ? 'nircmd mutesysvolume 1' : 'nircmd mutesysvolume 0';
      const r   = await butlerExec(cmd, { timeout: 5000 });
      if (!r.ok) {
        const ps = `$a=(New-Object -ComObject WScript.Shell); $a.SendKeys([char]173)`;
        await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      }
    } else if (process.platform === 'darwin') {
      await butlerExec(doMute ? "osascript -e 'set volume with output muted'" : "osascript -e 'set volume without output muted'");
    } else {
      await butlerExec(doMute ? 'amixer -q sset Master mute' : 'amixer -q sset Master unmute');
    }
    sendLog('BUTLER', doMute ? 'Muted.' : 'Unmuted.');
    return { success: true };
  });

  ipcMain.handle('butler:get-volume', async () => {
    try {
      if (process.platform === 'darwin') {
        const r = await butlerExec(`osascript -e 'output volume of (get volume settings)'`);
        return { success: true, level: parseInt(r.out) || null };
      }
      if (process.platform === 'linux') {
        const r = await butlerExec(`amixer sget Master | grep -oP '\\d+(?=%)' | head -1`);
        return { success: true, level: parseInt(r.out) || null };
      }
      // Windows — best-effort registry read
      const ps  = `[math]::Round([float](Get-ItemPropertyValue 'HKCU:\\Software\\Microsoft\\Multimedia\\Audio' 'MasterVolume' -ErrorAction SilentlyContinue) / 655.35)`;
      const r   = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 8000 });
      const lvl = parseInt(r.out);
      return { success: true, level: !isNaN(lvl) && lvl >= 0 && lvl <= 100 ? lvl : null };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Network ────────────────────────────────────────────────────────────────
  ipcMain.handle('butler:get-ip', async () => {
    try {
      const si    = require('systeminformation');
      const nets  = await si.networkInterfaces();
      const local = nets.filter(n => n.ip4 && !n.internal && n.ip4 !== '127.0.0.1').map(n => ({ name: n.iface, ip: n.ip4, mac: n.mac }));
      let publicIp = null;
      try { const res = await fetch('https://api.ipify.org?format=json'); publicIp = (await res.json()).ip; } catch (_) {}
      return { success: true, local, publicIp };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:ping', async (_, { host }) => {
    const h   = (host || '').trim().replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!h) return { success: false, error: 'Invalid host' };
    const cmd = process.platform === 'win32' ? `ping -n 3 ${h}` : `ping -c 3 ${h}`;
    const r   = await butlerExec(cmd, { timeout: 15000 });
    sendLog('BUTLER', `Ping ${h}: ${r.ok ? 'OK' : 'failed'}`);
    return { success: r.ok, host: h, output: r.out || r.err };
  });

  ipcMain.handle('butler:flush-dns', async (event) => {
    const confirmed = await confirm('Flush DNS cache? (may require admin rights)');
    if (!confirmed) return { success: false, error: 'Cancelled' };
    const cmd = process.platform === 'win32' ? 'ipconfig /flushdns'
      : process.platform === 'darwin'  ? 'sudo dscacheutil -flushcache'
      : 'sudo systemd-resolve --flush-caches';
    const r = await butlerExec(cmd, { timeout: 15000 });
    sendLog('BUTLER', 'DNS flushed: ' + (r.ok ? 'OK' : r.err));
    return { success: r.ok, output: r.out || r.err };
  });

  ipcMain.handle('butler:list-wifi', async () => {
    const cmd = process.platform === 'win32'  ? 'netsh wlan show networks mode=bssid'
      : process.platform === 'darwin' ? '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s'
      : 'nmcli device wifi list';
    const r = await butlerExec(cmd, { timeout: 10000 });
    return { success: r.ok, output: r.out || r.err };
  });

  // ── Environment ────────────────────────────────────────────────────────────
  ipcMain.handle('butler:get-env', (_, { variable }) => {
    const v   = (variable || '').trim();
    const val = process.env[v];
    return { success: true, variable: v, value: val !== undefined ? val : null };
  });

  ipcMain.handle('butler:set-env', async (_event, { variable, value }) => {
    const ok = await confirm(`Set environment variable?\n${variable} = ${value}`);
    if (!ok) return { success: false, error: 'Cancelled' };
    process.env[variable] = value || '';
    if (process.platform === 'win32') {
      const r = await butlerExec(`setx ${variable} "${(value || '').replace(/"/g, '\\"')}"`);
      return { success: r.ok, output: r.out || r.err };
    }
    return { success: true, note: 'Set for current session only on non-Windows' };
  });

  // ── Wallpaper ──────────────────────────────────────────────────────────────
  ipcMain.handle('butler:set-wallpaper', async (_, { imagePath }) => {
    const p = imagePath.trim();
    if (!fs.existsSync(p)) return { success: false, error: `Image not found: ${p}` };
    try {
      if (process.platform === 'win32') {
        const r = await butlerExec(
          `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\")]public static extern bool SystemParametersInfo(int a,int b,string c,int d);}'; [W]::SystemParametersInfo(20,0,'${p.replace(/'/g, "\\'")}',3)"`
        );
        return { success: r.ok || true };
      } else if (process.platform === 'darwin') {
        const r = await butlerExec(`osascript -e 'tell app "Finder" to set desktop picture to POSIX file "${p}"'`);
        return { success: r.ok };
      }
      return { success: false, error: 'Unsupported platform' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Scripting ──────────────────────────────────────────────────────────────
  ipcMain.handle('butler:run-ps', async (_event, { script }) => {
    const ok = await confirm(`Execute PowerShell script?\n\n${script.substring(0, 300)}${script.length > 300 ? '…' : ''}`);
    if (!ok) return { success: false, error: 'Cancelled' };
    const r = await butlerExec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 60000 });
    sendLog('BUTLER', `PS exec: ${r.ok ? 'OK' : r.err}`);
    return { success: r.ok, output: r.out, error: r.err };
  });

  ipcMain.handle('butler:run-cmd', async (_event, { command }) => {
    const ok = await confirm(`Execute CMD command?\n\n${command}`);
    if (!ok) return { success: false, error: 'Cancelled' };
    const tmpFile = path.join(os.tmpdir(), 'hex-butler-' + Date.now() + '.bat');
    try {
      fs.writeFileSync(tmpFile, '@echo off\r\n' + command, 'utf8');
      const r = await butlerExec(`cmd /c "${tmpFile}"`, { timeout: 60000 });
      sendLog('BUTLER', `CMD exec: ${r.ok ? 'OK' : r.err}`);
      return { success: r.ok, output: r.out, error: r.err };
    } finally { try { fs.unlinkSync(tmpFile); } catch (_) {} }
  });

  ipcMain.handle('butler:run-js', async (_event, { code }) => {
    const ok = await confirm(`Execute JavaScript code?\n\n${code.substring(0, 300)}`);
    if (!ok) return { success: false, error: 'Cancelled' };
    try {
      const output  = [];
      const sandbox = {
        console: { log: (...a) => output.push(a.join(' ')), error: (...a) => output.push('[ERR] ' + a.join(' ')) },
        Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
        String, Number, Boolean, Array, Object, RegExp, Error,
        setTimeout: () => null, clearTimeout: () => null,
      };
      const fn     = new Function(...Object.keys(sandbox), `"use strict";\n${code}`);
      const result = fn(...Object.values(sandbox));
      if (result !== undefined) output.push(String(result));
      sendLog('BUTLER', 'run_js: OK, output: ' + output.join(' ').substring(0, 80));
      return { success: true, output: output.join('\n'), result: String(result ?? '') };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Logoff ─────────────────────────────────────────────────────────────────
  ipcMain.handle('butler:logoff', async () => {
    const ok = await confirm('Log off the current user?\nUnsaved work will be lost.');
    if (!ok) return { success: false, error: 'Cancelled' };
    exec('shutdown /l');
    return { success: true };
  });

  function resolveDirectoryAlias(input) {
    const raw = String(input || '').trim();
    const home = os.homedir();
    const aliases = {
      desktop: path.join(home, 'Desktop'),
      documents: path.join(home, 'Documents'),
      downloads: path.join(home, 'Downloads'),
      pictures: path.join(home, 'Pictures'),
      music: path.join(home, 'Music'),
      videos: path.join(home, 'Videos'),
      home
    };
    const key = raw.toLowerCase();
    if (aliases[key]) return aliases[key];
    return raw || aliases.desktop;
  }

  ipcMain.handle('butler:list-dir', async (_, payload = {}) => {
    try {
      const dirPath = resolveDirectoryAlias(payload?.dirPath);
      if (!fs.existsSync(dirPath)) return { success: false, error: 'Directory not found: ' + dirPath };
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) return { success: false, error: 'Path is not a directory: ' + dirPath };

      const items = fs.readdirSync(dirPath, { withFileTypes: true })
        .map((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          let size = 0;
          let modified = null;
          try {
            const entryStat = fs.statSync(fullPath);
            size = entryStat.isFile() ? entryStat.size : 0;
            modified = entryStat.mtime?.toISOString?.() || null;
          } catch (_) {}
          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'dir' : 'file',
            size,
            modified
          };
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      return {
        success: true,
        path: dirPath,
        count: items.length,
        items
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  // ── Smart file operations ──────────────────────────────────────────────────
  ipcMain.handle('butler:batch-rename', async (_, { dir, pattern, replacement }) => {
    try {
      if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found' };
      const regex   = new RegExp(pattern, 'g');
      const entries = fs.readdirSync(dir);
      let renamed   = 0;
      for (const entry of entries) {
        if (regex.test(entry)) {
          regex.lastIndex = 0;
          const newName   = entry.replace(regex, replacement || '');
          if (newName !== entry) {
            fs.renameSync(path.join(dir, entry), path.join(dir, newName));
            renamed++;
          }
          regex.lastIndex = 0;
        }
      }
      return { success: true, renamed };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:organize-files', async (_, { dir }) => {
    try {
      if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found' };
      const CATEGORIES = {
        Images:    ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'],
        Videos:    ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
        Audio:     ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
        Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.csv'],
        Code:      ['.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.sh', '.bat', '.ps1', '.cpp', '.c', '.java', '.go', '.rs', '.rb', '.php'],
        Archives:  ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
      };
      const entries  = fs.readdirSync(dir, { withFileTypes: true });
      let organized  = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        for (const [cat, exts] of Object.entries(CATEGORIES)) {
          if (exts.includes(ext)) {
            const catDir = path.join(dir, cat);
            if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
            fs.renameSync(path.join(dir, entry.name), path.join(catDir, entry.name));
            organized++;
            break;
          }
        }
      }
      return { success: true, organized };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:find-duplicates', async (_, { dir }) => {
    try {
      if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found' };
      const sizeMap = new Map();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fp   = path.join(dir, entry.name);
        const size = fs.statSync(fp).size;
        if (!sizeMap.has(size)) sizeMap.set(size, []);
        sizeMap.get(size).push(fp);
      }
      const duplicates = [];
      let   total      = 0;
      for (const [size, files] of sizeMap) {
        if (files.length > 1) { duplicates.push({ files, size }); total += files.length - 1; }
      }
      return { success: true, duplicates, total };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Screen recording ───────────────────────────────────────────────────────
  let screenRecordProcess = null;

  ipcMain.handle('butler:record-screen', async (_, { action }) => {
    const desktopDir = path.join(os.homedir(), 'Desktop');

    if (action === 'start' || action === 'START') {
      if (screenRecordProcess) return { success: false, error: 'Already recording' };
      const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = path.join(desktopDir, `recording_${ts}.mp4`);
      try {
        const ffmpegPaths = ['ffmpeg', 'D:\\Tools\\ffmpeg.exe', path.join(os.homedir(), 'ffmpeg.exe')];
        let ffmpegBin = null;
        for (const p of ffmpegPaths) {
          try { const c = await butlerExec(`"${p}" -version`, { timeout: 3000 }); if (c.ok) { ffmpegBin = p; break; } } catch (_) {}
        }
        if (!ffmpegBin) return { success: false, error: 'ffmpeg not found. Install ffmpeg for screen recording.' };

        const args = ['-f', 'gdigrab', '-framerate', '30', '-i', 'desktop', '-f', 'dshow', '-i', 'audio=Stereo Mix', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', outPath];
        try {
          screenRecordProcess = spawn(ffmpegBin, args, { stdio: 'pipe' });
        } catch (_) {
          const videoArgs = ['-f', 'gdigrab', '-framerate', '30', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-y', outPath];
          screenRecordProcess = spawn(ffmpegBin, videoArgs, { stdio: 'pipe' });
        }
        screenRecordProcess._outPath = outPath;
        screenRecordProcess.on('exit',  () => { screenRecordProcess = null; });
        screenRecordProcess.on('error', (e) => { sendLog('BUTLER', `Recording error: ${e.message}`); screenRecordProcess = null; });
        sendLog('BUTLER', `Screen recording started: ${outPath}`);
        return { success: true, status: 'recording', path: outPath };
      } catch (e) { return { success: false, error: e.message }; }
    }

    if (action === 'stop' || action === 'STOP') {
      if (!screenRecordProcess) return { success: false, error: 'Not recording' };
      const outPath = screenRecordProcess._outPath;
      try {
        screenRecordProcess.stdin.write('q');
        await new Promise(r => setTimeout(r, 2000));
        if (screenRecordProcess) { screenRecordProcess.kill('SIGINT'); screenRecordProcess = null; }
      } catch (_) { screenRecordProcess?.kill(); screenRecordProcess = null; }
      sendLog('BUTLER', `Screen recording saved: ${outPath}`);
      if (outPath && fs.existsSync(outPath)) shell.openPath(outPath);
      return { success: true, status: 'stopped', path: outPath };
    }

    return { success: false, error: 'Invalid action. Use START or STOP.' };
  });

  // ── Weather ────────────────────────────────────────────────────────────────
  ipcMain.handle('butler:weather', async (_, { city }) => {
    try {
      const c   = (city || '').trim().replace(/[^a-zA-Z0-9 ,.-]/g, '') || 'auto';
      const res = await fetch(`https://wttr.in/${encodeURIComponent(c)}?format=j1`, { headers: { 'User-Agent': 'HEX/1.1' } });
      if (!res.ok) return { success: false, error: `Weather API HTTP ${res.status}` };
      const data = await res.json();
      const cur  = data.current_condition?.[0] || {};
      const area = data.nearest_area?.[0]      || {};
      return {
        success: true,
        city:         area.areaName?.[0]?.value     || city || '?',
        country:      area.country?.[0]?.value       || '?',
        temp_c:       cur.temp_C                     || '?',
        temp_f:       cur.temp_F                     || '?',
        feels_like_c: cur.FeelsLikeC                 || '?',
        humidity:     cur.humidity                   || '?',
        wind_kmph:    cur.windspeedKmph              || '?',
        wind_dir:     cur.winddir16Point             || '?',
        description:  cur.weatherDesc?.[0]?.value   || '?',
        uv:           cur.uvIndex                    || '?',
        visibility_km:cur.visibility                 || '?',
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── QR code ────────────────────────────────────────────────────────────────
  ipcMain.handle('butler:qr-code', async (_, { text }) => {
    try {
      const input = (text || '').trim();
      if (!input) return { success: false, error: 'No text provided' };
      const outPath = path.join(os.homedir(), 'Desktop', `qr_${Date.now()}.png`);
      const qrUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(input)}`;
      const ps      = `Invoke-WebRequest -Uri '${qrUrl}' -OutFile '${outPath}'`;
      const r       = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 15000 });
      if (r.ok && fs.existsSync(outPath)) {
        shell.openPath(outPath);
        sendLog('BUTLER', `QR code saved: ${outPath}`);
        return { success: true, path: outPath };
      }
      return { success: false, error: r.err || 'QR generation failed' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Speed test ─────────────────────────────────────────────────────────────
  ipcMain.handle('butler:speed-test', async () => {
    try {
      const start  = Date.now();
      const res    = await fetch('https://speed.cloudflare.com/__down?bytes=10000000');
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const buffer  = await res.arrayBuffer();
      const elapsed = (Date.now() - start) / 1000;
      const sizeMB  = buffer.byteLength / (1024 * 1024);
      const mbps    = Math.round((sizeMB * 8 / elapsed) * 10) / 10;
      sendLog('BUTLER', `Speed test: ${mbps} Mbps (${sizeMB.toFixed(1)} MB in ${elapsed.toFixed(1)}s)`);
      return { success: true, download_mbps: mbps, size_mb: Math.round(sizeMB * 10) / 10, elapsed_sec: Math.round(elapsed * 10) / 10 };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Morning digest ─────────────────────────────────────────────────────────
  const LAST_DIGEST_PATH = path.join(app.getPath('userData'), 'last_digest.json');

  ipcMain.handle('butler:morning-digest', async () => {
    try {
      try {
        if (fs.existsSync(LAST_DIGEST_PATH)) {
          const last = JSON.parse(fs.readFileSync(LAST_DIGEST_PATH, 'utf8'));
          if (last.date === new Date().toDateString()) return { success: true, skipped: true, reason: 'Already briefed today' };
        }
      } catch (_) {}

      const results = {};

      try {
        const wRes = await fetch('https://wttr.in/?format=j1', { headers: { 'User-Agent': 'HEX/1.1' } });
        if (wRes.ok) {
          const w   = await wRes.json();
          const cur = w.current_condition?.[0] || {};
          const area= w.nearest_area?.[0]      || {};
          results.weather = { city: area.areaName?.[0]?.value || '?', temp: cur.temp_C + '°C', description: cur.weatherDesc?.[0]?.value || '?', humidity: cur.humidity + '%', wind: cur.windspeedKmph + ' km/h' };
        }
      } catch (_) { results.weather = null; }

      try {
        results.system = {
          uptime:   `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
          freeRAM:  Math.round(os.freemem()  / 1e9 * 10) / 10 + ' GB',
          totalRAM: Math.round(os.totalmem() / 1e9 * 10) / 10 + ' GB',
          cpuCores: os.cpus().length,
          platform: os.platform() + ' ' + os.release(),
        };
      } catch (_) { results.system = null; }

      try {
        const pending = [];
        if (activeReminders) {
          for (const [id, data] of activeReminders) pending.push({ id, label: data.label, fireAt: data.fireAt });
        }
        results.reminders = pending;
      } catch (_) { results.reminders = []; }

      results.date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      results.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      fs.writeFileSync(LAST_DIGEST_PATH, JSON.stringify({ date: new Date().toDateString() }));
      return { success: true, skipped: false, digest: results };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Dictionary define ──────────────────────────────────────────────────────
  ipcMain.handle('butler:define', async (_, { word }) => {
    try {
      const w = (word || '').trim().replace(/[^a-zA-Z\s-]/g, '');
      if (!w) return { success: false, error: 'No word provided' };
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
      if (!res.ok) return { success: false, error: `Word "${w}" not found` };
      const data  = await res.json();
      const entry = data[0] || {};
      return {
        success: true,
        word:     entry.word || w,
        phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
        meanings: (entry.meanings || []).slice(0, 3).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions:  (m.definitions || []).slice(0, 2).map(d => d.definition),
          example:      m.definitions?.[0]?.example || null,
        })),
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Translate ──────────────────────────────────────────────────────────────
  ipcMain.handle('butler:translate', async (_, { text, from, to }) => {
    try {
      const t = (text || '').trim();
      if (!t) return { success: false, error: 'No text provided' };
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.substring(0, 500))}&langpair=${from || 'en'}|${to || 'ru'}`;
      const res = await fetch(url);
      if (!res.ok) return { success: false, error: `Translation API HTTP ${res.status}` };
      const data = await res.json();
      return { success: true, original: t, translated: data.responseData?.translatedText || '?', from: from || 'en', to: to || 'ru' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Send email ─────────────────────────────────────────────────────────────
  ipcMain.handle('butler:send-email', async (_, { to, subject, body }) => {
    try {
      if (!to || !subject) return { success: false, error: 'Missing to/subject' };
      const smtp = getConfig().smtp;
      if (!smtp || !smtp.server || !smtp.user) return { success: false, error: 'Email not configured. Set smtp.server, smtp.port, smtp.user, smtp.pass in config.' };
      const ps = [
        `$pass = ConvertTo-SecureString '${smtp.pass}' -AsPlainText -Force`,
        `$cred = New-Object System.Management.Automation.PSCredential('${smtp.user}', $pass)`,
        `Send-MailMessage -From '${smtp.user}' -To '${to}' -Subject '${(subject || '').replace(/'/g, "''")}' -Body '${(body || '').replace(/'/g, "''")}' -SmtpServer '${smtp.server}' -Port ${smtp.port || 587} -UseSsl -Credential $cred`,
      ].join('; ');
      const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      if (r.ok) { sendLog('BUTLER', `Email sent to ${to}`); return { success: true, to, subject }; }
      return { success: false, error: r.err || 'Send failed' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Media download ─────────────────────────────────────────────────────────
  ipcMain.handle('butler:download-media', async (_, { url, format }) => {
    try {
      if (!url) return { success: false, error: 'No URL provided' };
      const desktopDir  = path.join(os.homedir(), 'Desktop');
      const fmt         = format || 'best';
      const ytdlpPaths  = ['yt-dlp', path.join(os.homedir(), 'yt-dlp.exe'), 'D:\\Tools\\yt-dlp.exe'];
      let ytdlpBin = null;
      for (const p of ytdlpPaths) {
        try { const c = await butlerExec(`"${p}" --version`, { timeout: 5000 }); if (c.ok) { ytdlpBin = p; break; } } catch (_) {}
      }
      if (ytdlpBin) {
        sendLog('BUTLER', `Downloading via yt-dlp: ${url}`);
        const outputTmpl = path.join(desktopDir, '%(title)s.%(ext)s');
        let cmd = `"${ytdlpBin}" -o "${outputTmpl}" "${url}"`;
        if (fmt === 'audio') cmd = `"${ytdlpBin}" -x --audio-format mp3 -o "${outputTmpl}" "${url}"`;
        else if (fmt === 'mp4') cmd = `"${ytdlpBin}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" -o "${outputTmpl}" "${url}"`;
        const r = await butlerExec(cmd, { timeout: 300000 });
        if (r.ok) { sendLog('BUTLER', `Download complete: ${url}`); return { success: true, method: 'yt-dlp', output: r.out?.substring(0, 500) || '' }; }
        return { success: false, error: r.err || 'yt-dlp failed' };
      }
      sendLog('BUTLER', `yt-dlp not found. Direct download: ${url}`);
      const ext     = url.match(/\.(mp4|mp3|webm|mkv|avi|wav|flac|ogg)/i)?.[1] || 'mp4';
      const outPath = path.join(desktopDir, `download_${Date.now()}.${ext}`);
      const ps      = `Invoke-WebRequest -Uri '${url}' -OutFile '${outPath}'`;
      const r       = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 120000 });
      if (r.ok && fs.existsSync(outPath)) { shell.openPath(outPath); return { success: true, method: 'direct', path: outPath }; }
      return { success: false, error: 'yt-dlp not installed and direct download failed.' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Local helper ───────────────────────────────────────────────────────────
  async function confirm(msg) {
    const win = getWindow();
    if (!win) return true;
    const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancel', 'Confirm'], title: 'H.E.X. Confirmation', message: msg });
    return result.response === 1;
  }
};

