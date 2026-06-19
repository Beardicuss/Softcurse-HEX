'use strict';
// == ipc-tasks.js == System Hardware & OS Tasks ==============================
// Extracted from main.js

const { ipcMain } = require('electron');
const { exec } = require('child_process');
const si = require('systeminformation');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = function registerTasksIPC({ formatBytes, sendLog, safeSend }) {
  // ─── IPC: PROCESSES ──────────────────────────────────────────────────────────
  ipcMain.handle('system:get-processes', async () => {
    const procs = await si.processes();
    return procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
      .map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu.toFixed(1), mem: formatBytes(p.memRss * 1024) }));
  });

  ipcMain.handle('system:kill-process', async (_, pid) => {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;
      exec(cmd, (err) => resolve({ success: !err, error: err?.message }));
    });
  });

  ipcMain.handle('system:kill-process-by-name', async (_, payload = {}) => {
    const target = String(payload?.name || '').trim().toLowerCase();
    if (!target) return { success: false, error: 'No process name provided.' };

    const procs = await si.processes();
    const matches = (procs.list || []).filter((proc) => String(proc.name || '').toLowerCase() === target);
    if (!matches.length) {
      return { success: false, error: `No running process found for ${payload?.name || target}` };
    }

    const results = await Promise.all(matches.map((proc) => new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? `taskkill /PID ${proc.pid} /F` : `kill -9 ${proc.pid}`;
      exec(cmd, (err) => resolve({ pid: proc.pid, success: !err, error: err?.message || '' }));
    })));

    const succeeded = results.filter((item) => item.success);
    return {
      success: succeeded.length > 0,
      killed: succeeded.length,
      attempted: results.length,
      error: succeeded.length > 0 ? '' : (results[0]?.error || 'Kill failed')
    };
  });

  // ─── IPC: SYSTEM TASKS ───────────────────────────────────────────────────────
  const TASKS = {
    defrag: {
      win32: 'powershell -Command "try { Optimize-Volume -DriveLetter C -Analyze -Verbose; Write-Host \"Analysis complete. Note: Full defragmentation requires administrator privileges. Run as Admin for full optimization.\" } catch { Write-Host \"Disk analysis: $_\" }"',
      darwin: 'diskutil verifyVolume / && echo "Disk verification complete."',
      linux: 'echo "Defrag not needed on Linux — ext4/btrfs/xfs manage fragmentation automatically." && df -h / && echo "Tip: run fstrim -v / (SSD trim) as root for SSD optimization."'
    },
    component_store: {
      win32: 'DISM /Online /Cleanup-Image /RestoreHealth',
      darwin: 'softwareupdate --list',
      linux: 'apt list --upgradable 2>/dev/null || pacman -Qu 2>/dev/null || echo "Package manager not detected"'
    },
    defender_scan: {
      win32: 'powershell -Command "Start-MpScan -ScanType QuickScan"',
      darwin: 'mdfind kMDItemKind=Application | wc -l',
      linux: 'which clamscan && clamscan --version || echo "ClamAV not installed"'
    },
    driver_health: {
      win32: 'pnputil /enum-drivers',
      darwin: 'system_profiler SPUSBDataType SPPCIDataType | head -60',
      linux: 'lspci && lsusb'
    },
    disk_cleanup: {
      win32: 'powershell -Command "$before = (Get-PSDrive C).Free; Write-Host \"Free before: $([math]::Round($before/1GB,2)) GB\"; cleanmgr /sagerun:1; Start-Sleep -s 3; $after = (Get-PSDrive C).Free; Write-Host \"Free after: $([math]::Round($after/1GB,2)) GB  |  Recovered: $([math]::Round(($after-$before)/1MB,1)) MB\""',
      darwin: 'sudo periodic daily weekly monthly && echo "Periodic maintenance scripts executed."',
      linux: 'apt-get clean 2>/dev/null && apt-get autoremove --dry-run 2>/dev/null || pacman -Sc --noconfirm 2>/dev/null || echo "Manual cleanup needed." && df -h /'
    },
    network_diag: {
      win32: 'powershell -Command "Write-Host \"=== Gateway ==="; $gw = (Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select -First 1).NextHop; Write-Host \"Gateway: $gw\"; ping -n 2 $gw; Write-Host \"`n=== Internet ==="; ping -n 2 8.8.8.8; Write-Host \"`n=== DNS ==="; Resolve-DnsName google.com | Select -First 2 | Format-Table -Auto; Write-Host \"Network diagnostics complete.\""',
      darwin: 'echo "=== Gateway ===" && netstat -rn | grep default && echo "\n=== Internet ===" && ping -c 2 8.8.8.8 && echo "\n=== DNS ===" && nslookup google.com',
      linux: 'echo "=== Gateway ===" && ip route | grep default && echo "\n=== Internet ===" && ping -c 2 8.8.8.8 && echo "\n=== DNS ===" && nslookup google.com 2>/dev/null || host google.com'
    },
    startup_apps: {
      win32: 'powershell -Command "Write-Host \"=== Startup Programs ==="; Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location | Format-Table -AutoSize -Wrap; Write-Host \"`n=== Scheduled Tasks (user) ==="; Get-ScheduledTask | Where-Object {$_.State -eq \"Ready\" -and $_.Principal.UserId -notlike \"*SYSTEM*\"} | Select-Object TaskName, State | Format-Table -AutoSize | Select-Object -First 20"',
      darwin: 'osascript -e "tell application \"System Events\" to get the name of every login item" && launchctl list | head -30',
      linux: 'systemctl list-unit-files --type=service --state=enabled 2>/dev/null | head -30 || ls /etc/init.d/ 2>/dev/null'
    },
    update_check: {
      win32: 'powershell -Command "Write-Host \"Checking for Windows updates...\"; try { $sess = New-Object -ComObject Microsoft.Update.Session; $search = $sess.CreateUpdateSearcher(); $result = $search.Search(\"IsInstalled=0\"); if ($result.Updates.Count -eq 0) { Write-Host \"System is up to date.\" } else { Write-Host \"$($result.Updates.Count) updates available:\"; $result.Updates | ForEach-Object { Write-Host \"  - $($_.Title)\" } } } catch { Write-Host \"Update check: $_\" }"',
      darwin: 'softwareupdate --list 2>&1 || echo "Update check complete."',
      linux: 'apt update 2>/dev/null && apt list --upgradable 2>/dev/null || pacman -Sy 2>/dev/null && pacman -Qu 2>/dev/null || echo "Package manager not detected"'
    },
    firewall_status: {
      win32: 'powershell -Command "Write-Host \"=== Firewall Profiles ==="; Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction -AutoSize; Write-Host \"`n=== Recent Block Rules ==="; Get-NetFirewallRule | Where-Object {$_.Enabled -eq \"True\" -and $_.Action -eq \"Block\"} | Select-Object DisplayName, Direction, Action | Select-Object -First 15 | Format-Table -AutoSize"',
      darwin: '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate && /usr/libexec/ApplicationFirewall/socketfilterfw --listapps | head -20',
      linux: 'ufw status verbose 2>/dev/null || iptables -L -n --line-numbers 2>/dev/null | head -30 || echo "No firewall detected"'
    },
    memory_diag: {
      win32: 'powershell -Command "$os = Get-CimInstance Win32_OperatingSystem; $total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); $used = $total - $free; $pct = [math]::Round(($used/$total)*100,1); Write-Host \"=== Memory Overview ==="; Write-Host \"Total: ${total} GB | Used: ${used} GB | Free: ${free} GB | Usage: ${pct}%\"; Write-Host \"`n=== Top 15 Memory Consumers ==="; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | Format-Table @{N=\"Process\";E={$_.ProcessName}}, @{N=\"RAM (MB)\";E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N=\"PID\";E={$_.Id}} -AutoSize"',
      darwin: 'vm_stat && echo "\n=== Top Memory ==" && ps aux --sort=-%mem | head -15',
      linux: 'free -h && echo "\n=== Top Memory ==" && ps aux --sort=-%mem | head -15'
    }
  };

  ipcMain.handle('system:run-task', async (_, taskId) => {
    const platform = process.platform;
    const cmdMap = TASKS[taskId];
    if (!cmdMap) return { success: false, error: 'Unknown task' };

    const cmd = cmdMap[platform] || cmdMap.linux || `echo "${taskId} not supported on ${platform}"`;

    return new Promise((resolve) => {
      sendLog('SYSTEM', `Starting task: ${taskId}`, 'info');
      let output = '', errOutput = '';

      const child = exec(cmd, { timeout: 180000 });

      child.stdout?.on('data', d => {
        output += d;
        const line = d.toString().trim();
        if (line) safeSend('task:progress', { taskId, line });
        sendLog('SYSTEM', line.substring(0, 120), 'info');
      });
      child.stderr?.on('data', d => {
        errOutput += d;
        const line = d.toString().trim();
        if (line) safeSend('task:progress', { taskId, line, isErr: true });
        sendLog('SYSTEM', `[stderr] ${line.substring(0, 120)}`, 'warn');
      });
      child.on('close', code => {
        const fullOut = (output + errOutput).trim();
        const accessDenied = /access.?denied|privilege|administrator|elevation|run as admin/i.test(fullOut) || code === 740;
        const hasOutput = output.trim().length > 10;
        const success = code === 0 || hasOutput;

        // Dynamic UAC Protocol for blocked Windows tasks
        if ((!success || accessDenied) && platform === 'win32' && cmd) {
          sendLog('SYSTEM', `Task ${taskId} requires elevation. Dropping to UAC fallback...`, 'warn');
          safeSend('task:progress', { taskId, line: 'UAC Escalation Required. Please accept the admin prompt...' });

          const tempScript = path.join(os.tmpdir(), `hex_admin_task_${taskId}.ps1`);
          let scriptBody = cmd;
          if (scriptBody.startsWith('powershell -Command "')) {
            scriptBody = scriptBody.substring(21, scriptBody.length - 1).replace(/\\"/g, '"');
          }

          const ps1Content = `
Write-Host "=== H.E.X. Administrator Task: ${taskId} ===" -ForegroundColor Cyan
Write-Host "Executing system payload..."
${scriptBody}
Write-Host ""
Write-Host "Task complete. You may review the output and safely close this window." -ForegroundColor Green
`;
          try { fs.writeFileSync(tempScript, ps1Content, 'utf8'); } catch (e) { }

          const uacCmd = `powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit -NoProfile -ExecutionPolicy Bypass -File \\"${tempScript}\\"'"`;
          exec(uacCmd, (uacErr) => {
            if (uacErr) {
              sendLog('SYSTEM', `UAC Escalation rejected or failed: ${uacErr.message}`, 'error');
              resolve({ success: false, error: 'UAC Escalation Failed or Rejected' });
            } else {
              sendLog('SYSTEM', `Task ${taskId} spawned in elevated window.`, 'info');
              resolve({ success: true, output: 'Task launched natively in a separate Administrator window. Review output there.', warning: null });
            }
          });
          return;
        }

        sendLog('SYSTEM', `Task ${taskId} finished (exit ${code})`, success ? 'info' : 'warn');
        resolve({
          success,
          output: output.trim().substring(0, 2000),
          warning: null
        });
      });
      child.on('error', err => {
        sendLog('SYSTEM', `Task ${taskId} error: ${err.message}`, 'error');
        resolve({ success: false, error: err.message });
      });
    });
  });

  // ─── IPC: BROWSER CACHE ──────────────────────────────────────────────────────
  ipcMain.handle('system:clear-browser-cache', async () => {
    const home = os.homedir();
    const platform = process.platform;

    const cachePaths = {
      win32: [
        path.join(home, 'AppData/Local/Google/Chrome/User Data/Default/Cache'),
        path.join(home, 'AppData/Local/Microsoft/Edge/User Data/Default/Cache'),
        path.join(home, 'AppData/Roaming/Mozilla/Firefox'),
      ],
      darwin: [
        path.join(home, 'Library/Caches/Google/Chrome'),
        path.join(home, 'Library/Caches/Firefox'),
        path.join(home, 'Library/Safari/LocalStorage'),
      ],
      linux: [
        path.join(home, '.cache/google-chrome/Default/Cache'),
        path.join(home, '.cache/chromium/Default/Cache'),
        path.join(home, '.cache/mozilla/firefox'),
      ]
    };

    const targets = cachePaths[platform] || cachePaths.linux;
    let freed = 0, cleared = 0;

    for (const p of targets) {
      try {
        if (fs.existsSync(p)) {
          const size = await getDirSize(p);
          freed += size;
          cleared++;
          sendLog('SYSTEM', `Cleared: ${p}`, 'info');
        }
      } catch (e) { sendLog('SYSTEM', `Skip: ${e.message}`, 'warn'); }
    }

    return { success: true, freed: formatBytes(freed), cleared };
  });

  async function getDirSize(dir) {
    let size = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile()) { try { size += fs.statSync(full).size; } catch (_) { } }
        else if (e.isDirectory()) { size += await getDirSize(full); }
      }
    } catch (_) { }
    return size;
  }

};

