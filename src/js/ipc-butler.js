'use strict';
// == ipc-butler.js == PC Actions & Filesystem ================================
// Extracted from main.js

const { ipcMain } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = function registerButlerIPC({ sendLog, dialog, shell, mainWindow, runCmd, butlerExec }) {

  // Build a PS script that finds ANY installed app by fuzzy name and launches it.
  // Strategy (tried in order):
  //  1. Get-StartApps fuzzy match   → covers 99% of installed apps on Win10/11
  //  2. Registry App Paths          → covers Chrome, Firefox, VLC, VS Code etc.
  //  3. PATH + common exe names     → covers CLI tools
  //  4. Program Files recursive     → last resort filesystem search
  function buildAppFinderPS(name) {
    const safe = name.replace(/'/g, "''").replace(/"/g, '');
    return `
$n = '${safe}'; $nl = $n.ToLower(); $found = $null

# 1. Get-StartApps — searches Start Menu (Win10/11 built-in)
try {
  $apps = Get-StartApps | Where-Object { $_.Name -like "*$n*" }
  if ($apps) {
    $exact = $apps | Where-Object { $_.Name.ToLower() -eq $nl }
    $app   = if ($exact) { $exact[0] } else { $apps[0] }
    Write-Host "FOUND:startapp:$($app.AppID):$($app.Name)"
    exit 0
  }
} catch {}

# 2. Registry App Paths (HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths)
try {
  $base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
  $keys = Get-ChildItem $base -ErrorAction SilentlyContinue |
          Where-Object { $_.PSChildName -like "*$n*" }
  if ($keys) {
    $path = (Get-ItemProperty $keys[0].PSPath).'(default)'
    if ($path -and (Test-Path $path)) {
      Write-Host "FOUND:path:$path:$($keys[0].PSChildName)"
      exit 0
    }
  }
} catch {}

# 3. Search common install directories
$dirs = @(
  $env:ProgramFiles,
  (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'),  // safe
  "$env:LOCALAPPDATA\\Programs",
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
)
foreach ($dir in $dirs) {
  if (-not $dir) { continue }
  # Search .lnk shortcuts first (faster, covers all Start Menu entries)
  $lnks = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName -like "*$n*" } | Select-Object -First 1
  if ($lnks) {
    Write-Host "FOUND:lnk:$($lnks.FullName):$($lnks.BaseName)"
    exit 0
  }
  # Search .exe files
  $exes = Get-ChildItem -Path $dir -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName -like "*$n*" -and $_.BaseName -notlike "*uninstall*" -and $_.BaseName -notlike "*setup*" } |
          Select-Object -First 1
  if ($exes) {
    Write-Host "FOUND:exe:$($exes.FullName):$($exes.BaseName)"
    exit 0
  }
}

Write-Host "NOTFOUND"
`.trim();
  }

  ipcMain.handle('butler:open-app', async (_, appName) => {
    // Strip trailing punctuation that LLMs sometimes append (e.g. "chrome." from a sentence)
    const name = (appName || '').trim().replace(/[.!?,;:]+$/, '').trim();
    const nl = name.toLowerCase();
    sendLog('BUTLER', `Finding and launching: ${name}`);

    if (process.platform !== 'win32') {
      // macOS / Linux simple approach
      return new Promise(resolve => {
        const cmd = process.platform === 'darwin'
          ? `open -a "${name.replace(/"/g, '\\"')}" || open "${name.replace(/"/g, '\\\"')}"`
          : `xdg-open "${name}" 2>/dev/null || gtk-launch "${name}" 2>/dev/null || "${name}" &`;
        exec(cmd, { shell: true, timeout: 10000 }, err =>
          resolve(err ? { success: false, error: err.message } : { success: true, app: name })
        );
      });
    }

    // ── Windows ───────────────────────────────────────────────────────────────
    // Instant mappings for things guaranteed to be in System32 / PATH
    const INSTANT = {
      'notepad': 'notepad.exe', 'wordpad': 'write.exe',
      'calculator': 'calc.exe', 'calc': 'calc.exe',
      'paint': 'mspaint.exe', 'mspaint': 'mspaint.exe',
      'cmd': 'cmd.exe', 'command prompt': 'cmd.exe',
      'powershell': 'powershell.exe',
      'terminal': 'wt.exe', 'windows terminal': 'wt.exe',
      'explorer': 'explorer.exe', 'file explorer': 'explorer.exe',
      'this pc': 'explorer.exe =', 'my computer': 'explorer.exe =',
      'chrome': 'chrome.exe', 'google chrome': 'chrome.exe',
      'firefox': 'firefox.exe', 'edge': 'msedge.exe',
      'windows media player': 'wmplayer.exe',
      'taskmgr': 'taskmgr.exe', 'task manager': 'taskmgr.exe',
      'control panel': 'control.exe', 'control': 'control.exe',
      'settings': 'ms-settings:', 'windows settings': 'ms-settings:',
      'snipping tool': 'snippingtool.exe', 'snip': 'snippingtool.exe',
      'regedit': 'regedit.exe', 'registry': 'regedit.exe',
      'mmc': 'mmc.exe', 'services': 'services.msc',
      'devmgmt': 'devmgmt.msc', 'device manager': 'devmgmt.msc',
      'msconfig': 'msconfig.exe', 'system configuration': 'msconfig.exe',
      'msinfo32': 'msinfo32.exe', 'system information': 'msinfo32.exe',
      'dxdiag': 'dxdiag.exe',
    };

    if (INSTANT[nl]) {
      return new Promise(resolve => {
        exec(`start "" "${INSTANT[nl]}"`, { shell: true }, err =>
          resolve({ success: true, app: name, method: 'instant' })
        );
      });
    }

    // URI protocols — launch via shell open
    const URI_MAP = {
      'spotify': 'spotify:', 'discord': 'discord:', 'steam': 'steam:',
      'telegram': 'tg:', 'slack': 'slack:', 'zoom': 'zoommtg:',
      'whatsapp': 'whatsapp:', 'skype': 'skype:',
    };
    if (URI_MAP[nl]) {
      shell.openExternal(URI_MAP[nl]);
      sendLog('BUTLER', `Launched via URI: ${name}`);
      return { success: true, app: name, method: 'uri' };
    }

    // Write finder script to temp file (avoids all quoting hell)
    const tmpPs = path.join(os.tmpdir(), 'hex-find-' + Date.now() + '.ps1');
    try {
      fs.writeFileSync(tmpPs, buildAppFinderPS(name), 'utf8');
      const r = await butlerExec(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
        { timeout: 20000 }
      );
      const out = (r.out || '').trim();
      sendLog('BUTLER', `Finder result for "${name}": ${out.substring(0, 80)}`);

      if (out.startsWith('FOUND:startapp:')) {
        const parts = out.split(':');
        const appId = parts[2];
        // Start-Process with AppID — works for UWP, Win32, and packaged apps
        exec(`powershell -NoProfile -Command "Start-Process '${appId.replace(/'/g, "''")}'"`,
          { shell: true, timeout: 10000 }, () => { });
        return { success: true, app: name, method: 'startapp', found: parts[3] || name };
      }

      if (out.startsWith('FOUND:path:') || out.startsWith('FOUND:exe:')) {
        const parts = out.split(':');
        // parts[2] might be split if path has drive letter — rejoin with :
        const filePath = parts.slice(2, -1).join(':').trim();
        if (filePath) {
          shell.openPath(filePath);
          return { success: true, app: name, method: 'path', found: filePath };
        }
      }

      if (out.startsWith('FOUND:lnk:')) {
        const parts = out.split(':');
        const lnkPath = parts.slice(2, -1).join(':').trim();
        if (lnkPath) {
          shell.openPath(lnkPath);
          return { success: true, app: name, method: 'lnk', found: lnkPath };
        }
      }

      // NOTFOUND — last resort: Start-Process with raw name (may work for PATH apps)
      sendLog('BUTLER', `App not found by finder, trying Start-Process directly...`);
      const r2 = await butlerExec(
        `powershell -NoProfile -Command "Start-Process '${name.replace(/'/g, "''")}'"`,
        { timeout: 8000 }
      );
      if (r2.ok) return { success: true, app: name, method: 'startprocess-direct' };
      return { success: false, error: `"${name}" not found. Is it installed?`, hint: 'Try the exact app name or check if it appears in Start Menu.' };

    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      try { fs.unlinkSync(tmpPs); } catch (_) { }
    }
  });

  ipcMain.handle('butler:scan-apps', async () => {
    if (process.platform !== 'win32') return { success: false, error: 'Not supported on non-Windows' };
    const ps = `
$apps = @()
try {
  Get-StartApps | ForEach-Object { $apps += @{ name=$_.Name; appId=$_.AppID; type='startapp' } }
} catch {}
$dirs = @("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs", "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs", "$env:PUBLIC\\Desktop", "$env:USERPROFILE\\Desktop", (process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'), $env:ProgramFiles)
foreach ($d in $dirs) {
  if (Test-Path $d) {
    Get-ChildItem -Path $d -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      $apps += @{ name=$_.BaseName; path=$_.FullName; type='lnk' }
    }
  }
}
$apps | ConvertTo-Json -Compress
`;
    const tmpPs = path.join(os.tmpdir(), 'hex-scan-' + Date.now() + '.ps1');
    try {
      fs.writeFileSync(tmpPs, ps, 'utf8');
      const r = await butlerExec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, { timeout: 30000 });
      const jsonStr = (r.out || '').trim();
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        sendLog('BUTLER', `Scanned ${parsed.length} apps locally.`, 'info');
        return { success: true, apps: parsed };
      }
      return { success: false, error: 'No output' };
    } catch (e) {
      sendLog('BUTLER', `Scan fail: ${e.message}`, 'error');
      return { success: false, error: e.message };
    } finally {
      try { fs.unlinkSync(tmpPs); } catch (_) { }
    }
  });

  ipcMain.handle('butler:create-file', async (_, { name, content }) => {
    try {
      const desktop = path.join(os.homedir(), 'Desktop');
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
      const ext = path.extname(safeName) || '.txt';
      const baseName = ext === '.txt' ? safeName.replace(/\.txt$/i, '') : path.basename(safeName, ext);
      const filePath = path.join(desktop, baseName + ext);
      fs.writeFileSync(filePath, content || '', 'utf8');
      sendLog('BUTLER', `Created file: ${filePath}`, 'info');
      return { success: true, path: filePath };
    } catch (e) {
      sendLog('BUTLER', `File creation failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  });

  // Create a Word-compatible .docx on Desktop (minimal Open XML)
  ipcMain.handle('butler:create-doc', async (_, { name, content }) => {
    try {
      const desktop = path.join(os.homedir(), 'Desktop');
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.docx$/i, '');
      const filePath = path.join(desktop, safeName + '.docx');

      // Build minimal .docx (it's a ZIP with XML inside)
      // We use a simple approach: create the XML and use the built-in zlib
      const { createDocx } = require('./butler-docx');
      await createDocx(filePath, content || '');

      sendLog('BUTLER', `Created document: ${filePath}`, 'info');
      return { success: true, path: filePath };
    } catch (e) {
      // Fallback: create as .rtf if docx fails
      try {
        const desktop = path.join(os.homedir(), 'Desktop');
        const safeName = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.(docx|rtf)$/i, '');
        const filePath = path.join(desktop, safeName + '.rtf');
        const rtfContent = `{ \\rtf1\\ansi\\deff0{ \\fonttbl{ \\f0 Calibri; }} \n{ \\colortbl; \\red0\\green0\\blue0; } \n\\f0\\fs24 ${(content || '').replace(/\n/g, '\\par\n')} \n
    }`;
        fs.writeFileSync(filePath, rtfContent, 'utf8');
        sendLog('BUTLER', `Created RTF document: ${filePath} `, 'info');
        return { success: true, path: filePath, format: 'rtf' };
      } catch (e2) {
        sendLog('BUTLER', `Document creation failed: ${e2.message} `, 'error');
        return { success: false, error: e2.message };
      }
    }
  });

  // Open a folder in file explorer
  ipcMain.handle('butler:open-folder', async (_, folderPath) => {
    try {
      // Support common folder aliases
      const FOLDER_ALIASES = {
        'desktop': path.join(os.homedir(), 'Desktop'),
        'documents': path.join(os.homedir(), 'Documents'),
        'downloads': path.join(os.homedir(), 'Downloads'),
        'pictures': path.join(os.homedir(), 'Pictures'),
        'music': path.join(os.homedir(), 'Music'),
        'videos': path.join(os.homedir(), 'Videos'),
        'home': os.homedir(),
        'appdata': app.getPath('userData'),
      };
      const resolved = FOLDER_ALIASES[folderPath.toLowerCase()] || folderPath;
      if (!fs.existsSync(resolved)) {
        return { success: false, error: `Folder not found: ${resolved} ` };
      }
      shell.openPath(resolved);
      sendLog('BUTLER', `Opened folder: ${resolved} `, 'info');
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Open a file with default application
  ipcMain.handle('butler:open-file', async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath} ` };
      }
      shell.openPath(filePath);
      sendLog('BUTLER', `Opened file: ${filePath} `, 'info');
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Empty recycle bin (with confirmation)
  ipcMain.handle('butler:empty-trash', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Empty'],
      title: 'Empty Recycle Bin',
      message: 'Are you sure you want to permanently delete all items in the Recycle Bin?'
    });
    if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
    try {
      if (process.platform === 'win32') {
        await runCmd('powershell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Host \"Recycle Bin emptied.\""');
      } else if (process.platform === 'darwin') {
        await runCmd('osascript -e \'tell application "Finder" to empty trash\'');
      } else {
        await runCmd('rm -rf ~/.local/share/Trash/files/* ~/.local/share/Trash/info/*');
      }
      sendLog('BUTLER', 'Recycle bin emptied.', 'info');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Lock workstation
  ipcMain.handle('butler:lock-screen', async () => {
    try {
      if (process.platform === 'win32') {
        exec('rundll32.exe user32.dll,LockWorkStation');
      } else if (process.platform === 'darwin') {
        exec('pmset displaysleepnow');
      } else {
        exec('loginctl lock-session || xdg-screensaver lock');
      }
      sendLog('BUTLER', 'Workstation locked.', 'info');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Shutdown (with confirmation)
  ipcMain.handle('butler:shutdown', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Shut Down'],
      title: 'Shutdown Computer',
      message: 'Are you sure you want to shut down the computer?\nSave all work before proceeding.'
    });
    if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
    sendLog('BUTLER', 'Shutting down...', 'warn');
    if (process.platform === 'win32') exec('shutdown /s /t 5');
    else if (process.platform === 'darwin') exec('sudo shutdown -h +1');
    else exec('shutdown -h now');
    return { success: true };
  });

  // Restart (with confirmation)
  ipcMain.handle('butler:restart', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Restart'],
      title: 'Restart Computer',
      message: 'Are you sure you want to restart the computer?\nSave all work before proceeding.'
    });
    if (result.response !== 1) return { success: false, error: 'Cancelled by user' };
    sendLog('BUTLER', 'Restarting...', 'warn');
    if (process.platform === 'win32') exec('shutdown /r /t 5');
    else if (process.platform === 'darwin') exec('sudo shutdown -r +1');
    else exec('shutdown -r now');
    return { success: true };
  });

  // ── PHASE 9.1: SOFTWARE & REGISTRY ────────────────────────

  ipcMain.handle('butler:reg-read', async (_, { hive, key, value }) => {
    try {
      const q = value ? `/v "${value}"` : '/ve';
      const cmd = `reg query "${hive}\\${key}" ${q}`;
      const r = await butlerExec(cmd, { timeout: 10000 });
      sendLog('BUTLER', `Read registry: ${hive}\\${key}`, 'info');
      return { success: true, data: (r.out || '').trim() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('butler:reg-write', async (_, { hive, key, value, data, type }) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Write to Registry'], title: 'Registry Modification',
      message: `Warning: You are about to modify the Windows Registry.\n\nKey: ${hive}\\${key}\nValue: ${value}\nData: ${data}`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      // Escape for PowerShell script block encoding
      const safeData = (data || '').replace(/'/g, "''");
      const safeValue = (value || '').replace(/'/g, "''");
      const safeHiveKey = `${hive}\\${key}`.replace(/'/g, "''");

      const psBlock = `New-Item -Path 'Registry::${safeHiveKey}' -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path 'Registry::${safeHiveKey}' -Name '${safeValue}' -Value '${safeData}' -Force`;
      const encodedPs = Buffer.from(psBlock, 'utf16le').toString('base64');

      const ps = `Start-Process powershell -ArgumentList '-NoProfile -EncodedCommand ${encodedPs}' -Verb RunAs -Wait -WindowStyle Hidden`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      sendLog('BUTLER', `Wrote registry: ${hive}\\${key}`, 'warn');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('butler:list-software', async () => {
    try {
      const ps = `Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -ne $null } | Select-Object DisplayName, DisplayVersion, Publisher | ConvertTo-Json -Compress`;
      const r = await butlerExec(`powershell -NoProfile -Command "${ps}"`, { timeout: 20000 });
      return { success: true, software: JSON.parse(r.out || '[]') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('butler:check-updates', async () => {
    try {
      sendLog('BUTLER', 'Checking winget updates...', 'info');
      const r = await butlerExec('winget upgrade --accept-source-agreements', { timeout: 45000 });
      return { success: true, result: (r.out || '').trim() };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:install-pkg', async (_, { name }) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'question', buttons: ['Cancel', 'Install'], title: 'Installer',
      message: `H.E.X. is requesting to install winget package: ${name}\nProceed?`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      sendLog('BUTLER', `Installing ${name}`, 'info');
      const ps = `Start-Process winget -ArgumentList 'install --id "${name}" --exact --accept-package-agreements --accept-source-agreements --silent' -Verb RunAs -Wait`;
      await runCmd(`powershell -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:uninstall', async (_, { name }) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Uninstall'], title: 'Uninstaller',
      message: `Warning: This will uninstall ${name}. Proceed?`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      sendLog('BUTLER', `Uninstalling ${name}`, 'warn');
      const ps = `Start-Process winget -ArgumentList 'uninstall --name "${name}" --silent' -Verb RunAs -Wait`;
      await runCmd(`powershell -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── PHASE 9.2: ADVANCED PROCESS CONTROL ─────────────────

  ipcMain.handle('butler:run', async (_, { cmd, args }) => {
    try {
      const a = args ? ` ${args}` : '';
      sendLog('BUTLER', `Running: ${cmd}${a}`, 'info');
      const ps = `Start-Process "${cmd}" -ArgumentList '${a}'`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:run-as-admin', async (_, { cmd }) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Run as Administrator'], title: 'UAC Elevation',
      message: `Warning: This action requires Administrator (UAC) elevation.\n\nCommand: ${cmd}`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      sendLog('BUTLER', `UAC Elevation: ${cmd}`, 'warn');
      const b64Cmd = Buffer.from(cmd, 'utf16le').toString('base64');
      const ps = `Start-Process powershell -ArgumentList '-NoProfile -EncodedCommand ${b64Cmd}' -Verb RunAs`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:sleep', async (_, { seconds }) => {
    try {
      const ms = (parseFloat(seconds) || 1) * 1000;
      await new Promise(r => setTimeout(r, ms));
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:schedule-once', async (_, { time, command }) => {
    try {
      const taskName = `HEX_Task_${Date.now()}`;
      const ps = `schtasks /create /tn "${taskName}" /tr "${command}" /sc ONCE /st ${time} /f`;
      await runCmd(`powershell -Command "${ps}"`);
      sendLog('BUTLER', `Task scheduled for ${time}`, 'info');
      return { success: true, taskName };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:cancel-task', async (_, { taskName }) => {
    try {
      const ps = `schtasks /delete /tn "${taskName}" /f`;
      await runCmd(`powershell -Command "${ps}"`);
      sendLog('BUTLER', `Cancelled task ${taskName}`, 'info');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:startup', async (_, { action, cmd, name }) => {
    try {
      const safeName = (name || 'HEX_App').replace(/"/g, '');
      const safeCmd = (cmd || '').replace(/"/g, '""');

      let ps = '';
      if (action.toUpperCase() === 'ADD') {
        ps = `New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${safeName}" -Value '"${safeCmd}"' -PropertyType String -Force`;
        sendLog('BUTLER', `Added ${safeName} to Startup`, 'warn');
      } else {
        ps = `Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${safeName}" -ErrorAction SilentlyContinue`;
        sendLog('BUTLER', `Removed ${safeName} from Startup`, 'warn');
      }
      await runCmd(`powershell -NoProfile -Command '${ps}'`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── PHASE 9.3: WINDOW MANAGEMENT & INPUT ──────────────────

  ipcMain.handle('butler:list-windows', async () => {
    try {
      const ps = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress`;
      const r = await butlerExec(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 });
      return { success: true, windows: JSON.parse(r.out || '[]') };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:window-action', async (_, { action, title }) => {
    try {
      const ps = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
          }
"@
        $proc = Get-Process | Where-Object { $_.MainWindowTitle -match '${title.replace(/'/g, "''")}' } | Select-Object -First 1
        if ($proc) {
          $hwnd = $proc.MainWindowHandle
          if ('${action}' -eq 'maximize') { [Win32]::ShowWindow($hwnd, 3) }
          elseif ('${action}' -eq 'minimize') { [Win32]::ShowWindow($hwnd, 6) }
          elseif ('${action}' -eq 'restore') { [Win32]::ShowWindow($hwnd, 9) }
          elseif ('${action}' -eq 'focus') { [Win32]::SetForegroundWindow($hwnd) }
          elseif ('${action}' -eq 'close') { [Win32]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
        }
      `;
      await runCmd(`powershell -NoProfile -Command "${ps.replace(/\n|"/g, ';')}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:send-keys', async (_, { keys }) => {
    try {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys.replace(/'/g, "''")}')`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:mouse-move', async (_, { x, y }) => {
    try {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:mouse-click', async (_, { button }) => {
    try {
      const safeButton = (button || 'left').toString().toLowerCase().replace(/[^a-z]/g, '');
      const ps = `
        Add-Type @"
          using System.Runtime.InteropServices;
          public class Mouse {
            [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
          }
"@
        if ('${safeButton}' -eq 'right') { [Mouse]::mouse_event(0x0008 -bor 0x0010, 0, 0, 0, 0) }
        else { [Mouse]::mouse_event(0x0002 -bor 0x0004, 0, 0, 0, 0) }
      `;
      await runCmd(`powershell -NoProfile -Command "${ps.replace(/\n|"/g, ';')}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:paste-clipboard', async () => {
    try {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:get-clipboard-img', async () => {
    try {
      const { clipboard } = require('electron');
      const img = clipboard.readImage();
      if (img.isEmpty()) return { success: false, error: 'No image in clipboard' };
      return { success: true, dataURL: img.toDataURL() };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── PHASE 9.4: NETWORK & DEVICES ────────────────────────────────

  ipcMain.handle('butler:connect-wifi', async (_, { ssid, password }) => {
    try {
      const xmlPath = require('path').join(require('os').tmpdir(), 'hex_wifi.xml');
      const xml = `<?xml version="1.0"?>\n<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">\n<name>${ssid}</name>\n<SSIDConfig><SSID><name>${ssid}</name></SSID></SSIDConfig>\n<connectionType>ESS</connectionType>\n<connectionMode>auto</connectionMode>\n<MSM>\n<security>\n<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>\n<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${password}</keyMaterial></sharedKey>\n</security>\n</MSM>\n</WLANProfile>`;
      require('fs').writeFileSync(xmlPath, xml);
      await runCmd(`netsh wlan add profile filename="${xmlPath}"`);
      await runCmd(`netsh wlan connect name="${ssid}"`);
      require('fs').unlinkSync(xmlPath);
      sendLog('BUTLER', `Wi-Fi connected: ${ssid}`, 'info');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:net-adapter', async (_, { adapter, action }) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Confirm Action'], title: 'Network Adapter',
      message: `System is requesting to ${action.toUpperCase()} network adapter: ${adapter}`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      const a = action.toLowerCase() === 'enable' ? 'Enable-NetAdapter' : 'Disable-NetAdapter';
      const ps = `Start-Process powershell -ArgumentList '-NoProfile -Command ${a} -Name "${adapter}" -Confirm:$false' -Verb RunAs -Wait`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:eject-usb', async (_, { letter }) => {
    try {
      const drive = letter.replace(':', '');
      const ps = `$vol = Get-WmiObject -Class Win32_Volume | Where-Object { $_.DriveLetter -eq '${drive}:' }; if ($vol) { $vol.Dismount($false, $false) }`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      sendLog('BUTLER', `Ejected USB: ${drive}`, 'warn');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── PHASE 9.5: UTILITIES & SYSTEM SCHEDULING ────────────────

  ipcMain.handle('butler:zip', async (_, { source, output }) => {
    try {
      const ps = `Compress-Archive -Path "${source}" -DestinationPath "${output}" -Force`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      sendLog('BUTLER', `Zipped ${source} -> ${output}`, 'info');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:unzip', async (_, { zipPath, dest }) => {
    try {
      if (!require('fs').existsSync(dest)) require('fs').mkdirSync(dest, { recursive: true });
      const ps = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${dest}" -Force`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      sendLog('BUTLER', `Unzipped ${zipPath} -> ${dest}`, 'info');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:clean-temp', async () => {
    try {
      const ps = `Remove-Item -Path "$env:TEMP\\*" -Force -Recurse -ErrorAction SilentlyContinue`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      sendLog('BUTLER', 'Cleaned Temporary Files', 'info');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:chkdsk', async (_, { drive }) => {
    const d = (drive || 'C:').replace(/\\$/, '').replace(':', '') + ':';
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Run Disk Check'], title: 'Check Disk',
      message: `System will run CHKDSK on ${d}\nNote: System drives may require a reboot to scan.`
    });
    if (res.response !== 1) return { success: false, error: 'Cancelled' };
    try {
      sendLog('BUTLER', `Checking disk: ${d}`, 'warn');
      const ps = `Start-Process cmd.exe -ArgumentList '/c chkdsk ${d} /f /v' -Verb RunAs`;
      await runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── PHASE 10: GHOST TAG / ADVANCED DEV CAPABILITIES ───────────

  ipcMain.handle('butler:find-file', async (_, { name, root }) => {
    try {
      const ps = `Get-ChildItem -Path '${root}' -Filter '*${name}*' -Recurse -ErrorAction SilentlyContinue | Select-Object FullName -First 10 | Format-Table -HideTableHeaders`;
      const r = await butlerExec(`powershell -NoProfile -Command "${ps}"`, { timeout: 30000 });
      return { success: true, output: r.out || 'No results found.' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:grep-file', async (_, { pattern, file }) => {
    try {
      const ps = `Select-String -Path '${file}' -Pattern '${pattern}' | Select-Object Line -First 15 | Format-Table -HideTableHeaders`;
      const r = await butlerExec(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 });
      return { success: true, output: r.out || 'No matches found.' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:run-python', async (_, { script }) => {
    try {
      const r = await butlerExec(`python "${script}"`, { timeout: 30000 });
      return { success: true, output: r.out };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:git', async (_, { cmd, repo }) => {
    try {
      const r = await butlerExec(`git -C "${repo}" ${cmd}`, { timeout: 15000 });
      return { success: true, output: r.out || 'Success.' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:docker-status', async () => {
    try {
      const r = await butlerExec(`docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"`, { timeout: 10000 });
      return { success: true, output: r.out || 'Docker is running but no containers are active.' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:notify', async (_, { title, message }) => {
    try {
      const ps = `
        Add-Type -AssemblyName System.Windows.Forms
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.BalloonTipTitle = '${title.replace(/'/g, "''")}'
        $notify.BalloonTipText = '${message.replace(/'/g, "''")}'
        $notify.Visible = $true
        $notify.ShowBalloonTip(5000)
      `;
      runCmd(`powershell -NoProfile -Command "${ps}"`);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('butler:record-screen', async (_, { action }) => {
    try {
      if (action === 'START') {
        const desktop = path.join(os.homedir(), 'Desktop', 'hex_capture_' + Date.now() + '.mp4');
        const ps = `Start-Process ffmpeg -ArgumentList "-f gdigrab -framerate 30 -i desktop -c:v libx264 \`"${desktop}\`"" -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id`;
        const r = await butlerExec(`powershell -NoProfile -Command "${ps}"`);
        global.hexRecordPid = parseInt((r.out || '').trim());
      } else {
        if (global.hexRecordPid) {
          await runCmd(`taskkill /PID ${global.hexRecordPid} /T /F`);
          global.hexRecordPid = null;
        }
      }
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Expose buildAppFinderPS so ipc-games can use it
  return { buildAppFinderPS };
};
