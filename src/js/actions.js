'use strict';
// == actions.js == AI Action Dispatcher ========================================
// Extracted from renderer.js -- handles all [ACTION:*] tags from AI responses.
// Depends on globals: addLog, addHexMessage, showToast, speakWithConfig,
//   runTask, openProcesses, openSettings, window.hexAPI, window.hexBrowser,
//   window.reminders
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
    case 'run_update_check': await runTask('update_check'); break;
    case 'check_firewall': await runTask('firewall_status'); break;
    case 'run_memory_diag': await runTask('memory_diag'); break;
    case 'open_settings': openSettings(); break;

    // ── Butler / PC control ──
    case 'open_app': {
      const appName = action.args.join(' ').trim();
      if (appName) {
        addLog('BUTLER', `Launching: ${appName}`);

        // Intercept: Memory-aware URL alias resolution
        if (window.hexMemory && window.hexMemory.nodes) {
          const aliasLower = appName.toLowerCase();
          const targetNodes = window.hexMemory.nodes.filter(n => {
            const cLower = n.content.toLowerCase();
            return (cLower.includes('http://') || cLower.includes('https://')) &&
              aliasLower.split(/\s+/).some(word => word.length > 3 && cLower.includes(word));
          });

          if (targetNodes.length > 0) {
            const bestNode = targetNodes.sort((a, b) => b.confidence - a.confidence)[0];
            const match = bestNode.content.match(/https?:\/\/[^\s]+/);
            if (match) {
              const url = match[0];
              addLog('BUTLER', `Memory resolved alias "${appName}" to URL: ${url}`);
              const r = await window.hexAPI.openUrl(url);
              if (r.success) {
                addHexMessage(`**Opening resolved link:** ${url}`);
                if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_app:${appName}`, true);
              } else {
                addHexMessage(`**Failed to open link:** ${url}`);
                if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_app:${appName}`, false, r.error || '');
              }
              break;   // Exit the open_app case completely, we handled it as a URL
            }
          }
        }

        let r;

        let fuzzyMatch = null;
        if (window.hexAppCache && window.hexAppCache.length > 0) {
          const searchWords = appName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
          if (searchWords.length > 0) {
            fuzzyMatch = window.hexAppCache.find(a => {
              const anl = (a.name || '').toLowerCase();
              return searchWords.every(w => anl.includes(w));
            });
          }
        }

        if (fuzzyMatch && fuzzyMatch.path) {
          r = await window.hexAPI.butler.openFile(fuzzyMatch.path);
          if (r.success) {
            addHexMessage('**Opening** ' + fuzzyMatch.name + ' (Cache Bypass)');
            addLog('BUTLER', 'Launched via Cache: ' + fuzzyMatch.name);
            break;
          }
        }

        r = await window.hexAPI.butler.openApp(appName);
        if (r.success) {
          const found = r.found || appName;
          addHexMessage('**Opening** ' + found + (r.method ? ' (' + r.method + ')' : '') + '.');
          addLog('BUTLER', 'Launched: ' + found);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_app:${appName}`, true);
        } else {
          addHexMessage('**Could not open** "' + appName + '". ' + (r.error || '') + (r.hint ? ' ' + r.hint : ''));
          addLog('BUTLER', 'Launch failed: ' + appName + ' — ' + (r.error || ''), 'error');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_app:${appName}`, false, r.error || '');
        }
      }
      break;
    }

    case 'open_url': {
      const url = action.args.join(':').trim();
      if (url) {
        addLog('BUTLER', `Opening URL: ${url}`);
        const r = await window.hexAPI.openUrl(url);
        if (r?.success) {
          addHexMessage(`**Opened:** ${url}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_url:${url}`, true);
        } else {
          addHexMessage(`**Failed to open:** ${url}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_url:${url}`, false, r?.error || '');
        }
      }
      break;
    }

    case 'browser_open': {
      const bUrl = action.args.join(':').trim();
      if (bUrl) {
        addLog('BUTLER', `Browser open: ${bUrl}`);
        const r = await window.hexAPI.openUrl(bUrl);
        if (r?.success) {
          addHexMessage(`**Opened in browser:** ${bUrl}`);
        } else {
          addHexMessage(`**Failed:** ${bUrl} — ${r?.error || 'Unknown error'}`);
        }
      }
      break;
    }

    case 'browser_search': {
      const query = action.args.join(' ').trim();
      if (query) {
        addLog('BUTLER', `Browser search: ${query}`);
        try {
          const r = await window.hexAPI.butler.browserSearch(query);
          addHexMessage(`**Searching Google:** ${query}`);
        } catch (e) {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          await window.hexAPI.openUrl(searchUrl);
          addHexMessage(`**Searching Google:** ${query}`);
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
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${action.args[0]}`, true);
        } else {
          addLog('BUTLER', `File creation failed: ${fileResult.error}`, 'error');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${action.args[0]}`, false, fileResult.error);
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
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${action.args[0]}`, true);
        } else {
          addLog('BUTLER', `Document creation failed: ${docResult.error}`, 'error');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${action.args[0]}`, false, docResult.error);
        }
      }
      break;

    case 'open_folder':
      if (action.args[0]) {
        const p = action.args.join(':');
        const folderResult = await window.hexAPI.butler.openFolder(p);
        if (folderResult.success) {
          addLog('BUTLER', `Opened folder: ${folderResult.path}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_folder:${p}`, true);
        } else {
          addLog('BUTLER', `Folder error: ${folderResult.error}`, 'error');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_folder:${p}`, false, folderResult.error);
        }
      }
      break;

    case 'open_file':
      if (action.args[0]) {
        const p = action.args.join(':');
        const openResult = await window.hexAPI.butler.openFile(p);
        if (openResult.success) {
          addLog('BUTLER', `Opened file: ${openResult.path}`);
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_file:${p}`, true);
        } else {
          addLog('BUTLER', `File error: ${openResult.error}`, 'error');
          if (window.hexMemory) window.hexMemory.recordActionOutcome(`open_file:${p}`, false, openResult.error);
        }
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

    case 'weather': {
      const city = action.args.join(':') || '';
      const r = await window.hexAPI.butler.weather(city);
      if (r.success) {
        addHexMessage(
          `**${r.city}, ${r.country}**\n` +
          `🌡 ${r.temp_c}°C (feels like ${r.feels_like_c}°C)\n` +
          `💧 Humidity: ${r.humidity}% | 💨 Wind: ${r.wind_kmph} km/h ${r.wind_dir}\n` +
          `☁ ${r.description} | UV: ${r.uv} | Visibility: ${r.visibility_km} km`
        );
        if (window.hexMemory) window.hexMemory.recordActionOutcome('weather', true);
      } else {
        addHexMessage(`Weather lookup failed: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('weather', false, r.error);
      }
      break;
    }

    case 'qr_code': {
      const qrText = action.args.join(':');
      const r = await window.hexAPI.butler.qrCode(qrText);
      addLog('BUTLER', r.success ? `QR saved: ${r.path}` : `QR failed: ${r.error}`);
      if (r.success) {
        addHexMessage(`**QR code saved** to \`${r.path}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('qr_code', true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome('qr_code', false, r.error);
      }
      break;
    }

    case 'speed_test': {
      addHexMessage('Running speed test...');
      const r = await window.hexAPI.butler.speedTest();
      if (r.success) {
        addHexMessage(
          `**Speed Test Result**\n` +
          `⬇ Download: **${r.download_mbps} Mbps**\n` +
          `📦 ${r.size_mb} MB in ${r.elapsed_sec}s`
        );
        if (window.hexMemory) window.hexMemory.recordActionOutcome('speed_test', true);
      } else {
        addHexMessage(`Speed test failed: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('speed_test', false, r.error);
      }
      break;
    }

    case 'morning_digest': {
      const r = await window.hexAPI.butler.morningDigest();
      if (r.success && !r.skipped) {
        const d = r.digest;
        let msg = `☀ **Morning Briefing — ${d.date}**\n\n`;
        if (d.weather) msg += `🌡 **${d.weather.city}**: ${d.weather.temp}, ${d.weather.description}, 💧 ${d.weather.humidity}, 💨 ${d.weather.wind}\n`;
        if (d.system) msg += `💻 Uptime: ${d.system.uptime} | RAM: ${d.system.freeRAM} free / ${d.system.totalRAM}\n`;
        if (d.reminders?.length) msg += `⏰ ${d.reminders.length} pending reminder(s): ${d.reminders.map(r => r.label).join(', ')}\n`;
        else msg += `✅ No pending reminders.\n`;
        addHexMessage(msg);
      } else if (r.skipped) {
        addHexMessage('Already briefed today. Say "morning digest" again tomorrow!');
      }
      break;
    }

    case 'define': {
      const word = action.args.join(' ');
      const r = await window.hexAPI.butler.define(word);
      if (r.success) {
        let msg = `📖 **${r.word}** ${r.phonetic}\n\n`;
        for (const m of r.meanings) {
          msg += `*${m.partOfSpeech}*\n`;
          for (const d of m.definitions) msg += `  • ${d}\n`;
          if (m.example) msg += `  _"${m.example}"_\n`;
        }
        addHexMessage(msg);
      } else {
        addHexMessage(`Dictionary: ${r.error}`);
      }
      break;
    }

    case 'translate': {
      const parts = action.args.join(':').split(':');
      const text = parts[0] || '';
      const from = parts[1] || 'en';
      const to = parts[2] || 'ru';
      const r = await window.hexAPI.butler.translate(text, from, to);
      if (r.success) {
        addHexMessage(`🌐 **${r.from} → ${r.to}**\n\n"${r.original}"\n↓\n"${r.translated}"`);
      } else {
        addHexMessage(`Translation failed: ${r.error}`);
      }
      break;
    }

    case 'send_email': {
      const to = action.args[0] || '';
      const subject = action.args[1] || 'Message from H.E.X.';
      const body = action.args.slice(2).join(':') || '';
      const r = await window.hexAPI.butler.sendEmail(to, subject, body);
      if (r.success) {
        addHexMessage(`📧 **Email sent** to \`${r.to}\`\nSubject: ${r.subject}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('send_email', true);
      } else {
        addHexMessage(`Email failed: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('send_email', false, r.error);
      }
      break;
    }

    case 'download_media': {
      const mediaUrl = action.args[0] || '';
      const fmt = action.args[1] || 'best';  // best | audio | mp4
      addHexMessage(`⬇ Downloading media... (${fmt})`);
      const r = await window.hexAPI.butler.downloadMedia(mediaUrl, fmt);
      if (r.success) {
        addHexMessage(`✅ **Download complete** via ${r.method}\n${r.path || r.output || ''}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('download_media', true);
      } else {
        addHexMessage(`Download failed: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome('download_media', false, r.error);
      }
      break;
    }

    case 'plugin': {
      const pluginId = action.args[0] || '';
      const pluginAction = action.args[1] || 'default';
      const pluginArgs = action.args.slice(2);
      const r = await window.hexAPI.plugins.execute(pluginId, pluginAction, pluginArgs);
      if (r.success) {
        addHexMessage(typeof r.result === 'string' ? r.result : `Plugin \`${pluginId}\` → ${JSON.stringify(r.result)}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`plugin:${pluginId}:${pluginAction}`, true);
      } else {
        addHexMessage(`Plugin error: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`plugin:${pluginId}:${pluginAction}`, false, r.error);
      }
      break;
    }

    case 'browser_open': {
      const url = action.args.join(':');
      const r = await window.hexAPI.browser.open(url);
      if (r.success) addHexMessage(`🌐 Opened: ${r.url}`);
      else addHexMessage(`Browser open failed: ${r.error}`);
      break;
    }

    case 'browser_search': {
      const query = action.args.join(' ');
      const r = await window.hexAPI.browser.search(query);
      if (r.success) addHexMessage(`🔍 Searching: "${r.query}"`);
      else addHexMessage(`Search failed: ${r.error}`);
      break;
    }

    case 'browser_scrape': {
      const scrapeUrl = action.args.join(':');
      addHexMessage(`🕷 Scraping \`${scrapeUrl}\`...`);
      const r = await window.hexAPI.browser.scrape(scrapeUrl);
      if (r.success) {
        return { data: r.text };  // Feed into follow-up AI call
      } else {
        addHexMessage(`Scrape failed: ${r.error}`);
      }
      break;
    }

    case 'schedule_recurring': {
      const cron = action.args[0] || '';
      const label = action.args.slice(1).join(' ') || 'Recurring task';
      const r = await window.hexAPI.recurring.add(cron, label);
      if (r.success) addHexMessage(`🔄 **Recurring schedule set**: "${r.label}"\nCron: \`${r.cron}\` | ID: \`${r.id}\``);
      else addHexMessage(`Schedule error: ${r.error}`);
      break;
    }

    case 'clipboard_history': {
      const r = await window.hexAPI.clipboard.history();
      if (r.success && r.items.length) {
        const list = r.items.slice(0, 10).map((c, i) => `${i + 1}. "${c.text.substring(0, 80)}${c.text.length > 80 ? '…' : ''}"`).join('\n');
        addHexMessage(`📋 **Clipboard History** (last ${r.items.length})\n\n${list}`);
      } else {
        addHexMessage('📋 Clipboard history is empty.');
      }
      break;
    }

    case 'system_health': {
      const r = await window.hexAPI.systemHealth();
      if (r.success) {
        const h = r.health;
        let msg = `💻 **System Health Report**\n\n`;
        msg += `🖥 CPU: ${h.cpu.load}% (${h.cpu.cores} cores)\n`;
        msg += `🧠 RAM: ${h.ram.used_gb}/${h.ram.total_gb} GB (${h.ram.percent}%)\n`;
        for (const d of h.disks) msg += `💾 ${d.mount}: ${d.used_gb}/${d.size_gb} GB (${d.percent}%)\n`;
        if (h.temperature) msg += `🌡 CPU Temp: ${h.temperature}\n`;
        if (h.battery) msg += `🔋 Battery: ${h.battery.percent}%${h.battery.charging ? ' ⚡' : ''}\n`;
        if (h.network) msg += `🌐 Net: ↓${h.network.rx_sec} ↑${h.network.tx_sec}\n`;
        msg += `⏱ Uptime: ${h.uptime_hrs}h`;
        if (h.alerts.length) msg += `\n\n${h.alerts.join('\n')}`;
        addHexMessage(msg);
        return { data: JSON.stringify(h) };
      }
      break;
    }

    case 'organize_files': {
      const dir = action.args.join(':') || action.args[0];
      const r = await window.hexAPI.smartFiles.organize(dir);
      if (r.success) addHexMessage(`📂 **Organized ${r.organized} files** in \`${dir}\` into category folders.`);
      else addHexMessage(`Organize failed: ${r.error}`);
      break;
    }

    case 'batch_rename': {
      const dir = action.args[0] || '';
      const pattern = action.args[1] || '';
      const replacement = action.args[2] || '';
      const r = await window.hexAPI.smartFiles.batchRename(dir, pattern, replacement);
      if (r.success) addHexMessage(`✏ **Renamed ${r.renamed} files** matching \`${pattern}\``);
      else addHexMessage(`Rename failed: ${r.error}`);
      break;
    }

    case 'find_duplicates': {
      const dir = action.args.join(':') || action.args[0];
      const r = await window.hexAPI.smartFiles.findDuplicates(dir);
      if (r.success) {
        if (r.duplicates.length) {
          const list = r.duplicates.slice(0, 5).map(d => `${d.files.join(', ')} (${Math.round(d.size / 1024)} KB)`).join('\n');
          addHexMessage(`🔍 **Found ${r.total} potential duplicates** (by size)\n\n${list}`);
        } else {
          addHexMessage('✅ No duplicates found.');
        }
      } else addHexMessage(`Duplicate scan failed: ${r.error}`);
      break;
    }

    // ── File & Folder ────────────────────────────────────────
    case 'copy': {
      const [src, ...dParts] = action.args; const dest = dParts.join(':');
      const r = await window.hexAPI.butler.copy(src, dest);
      addLog('BUTLER', r.success ? `Copied to ${r.dest}` : `Copy failed: ${r.error}`);
      if (r.success) {
        addHexMessage(`**Copied** to \`${r.dest}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`copy:${src}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`copy:${src}`, false, r.error);
      }
      break;
    }
    case 'move': {
      const [msrc, ...mdParts] = action.args; const mdest = mdParts.join(':');
      const r = await window.hexAPI.butler.move(msrc, mdest);
      addLog('BUTLER', r.success ? `Moved to ${r.dest}` : `Move failed: ${r.error}`);
      if (r.success) {
        addHexMessage(`**Moved** to \`${r.dest}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`move:${msrc}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`move:${msrc}`, false, r.error);
      }
      break;
    }
    case 'delete': {
      const target = action.args.join(':');
      const r = await window.hexAPI.butler.delete(target, false);
      addLog('BUTLER', r.success ? `Deleted: ${target}` : `Delete: ${r.error}`);
      if (r.success) {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete:${target}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete:${target}`, false, r.error);
      }
      break;
    }
    case 'delete_perm': {
      const target = action.args.join(':');
      const r = await window.hexAPI.butler.delete(target, true);
      addLog('BUTLER', r.success ? `Permanently deleted: ${target}` : `Delete: ${r.error}`);
      if (r.success) {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete_perm:${target}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`delete_perm:${target}`, false, r.error);
      }
      break;
    }
    case 'rename': {
      const target = action.args[0];
      const r = await window.hexAPI.butler.rename(target, action.args[1]);
      addLog('BUTLER', r.success ? `Renamed to ${r.path}` : `Rename: ${r.error}`);
      if (r.success) {
        addHexMessage(`**Renamed** to \`${r.path}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`rename:${target}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`rename:${target}`, false, r.error);
      }
      break;
    }
    case 'create_file': {
      const fileName = action.args[0];
      const content = action.args.slice(1).join(':').replace(/\\n/g, '\n');
      const r = await window.hexAPI.butler.createFile(fileName, content);
      addLog('BUTLER', r.success ? `File created: ${r.path}` : `Create File: ${r.error}`);
      if (r.success) {
        addHexMessage(`**File saved:** \`${r.path}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${fileName}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_file:${fileName}`, false, r.error);
      }
      break;
    }
    case 'create_doc': {
      const fileName = action.args[0];
      const content = action.args.slice(1).join(':').replace(/\\n/g, '\n');
      const r = await window.hexAPI.butler.createDoc(fileName, content);
      addLog('BUTLER', r.success ? `Doc created: ${r.path}` : `Create Doc: ${r.error}`);
      if (r.success) {
        addHexMessage(`**Document saved:** \`${r.path}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${fileName}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_doc:${fileName}`, false, r.error);
      }
      break;
    }
    case 'create_folder': {
      const folderPath = action.args.join(':');
      const r = await window.hexAPI.butler.createFolder(folderPath);
      addLog('BUTLER', r.success ? `Folder created: ${r.path}` : `Folder: ${r.error}`);
      if (r.success) {
        addHexMessage(`**Folder created:** \`${r.path}\``);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_folder:${folderPath}`, true);
      } else {
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`create_folder:${folderPath}`, false, r.error);
      }
      break;
    }
    case 'list_dir': {
      const targetDir = action.args.join(':') || 'desktop';
      const r = await window.hexAPI.butler.listDir(targetDir);
      if (r.success) {
        const dirs = r.items.filter(function (i) { return i.type === 'dir'; }).map(function (i) { return '[DIR] ' + i.name; });
        const files = r.items.filter(function (i) { return i.type === 'file'; }).map(function (i) { return '[FILE] ' + i.name; });
        const preview = dirs.slice(0, 8).concat(files.slice(0, 8));
        const more = r.count > 16 ? ('..and ' + (r.count - 16) + ' more') : '';
        addHexMessage('**' + r.path + '** - ' + r.count + ' items\n' + preview.join('\n') + more);
        addLog('BUTLER', 'Listed ' + r.count + ' items in ' + r.path);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`list_dir:${targetDir}`, true);
      } else {
        addHexMessage('Could not list directory: ' + r.error);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`list_dir:${targetDir}`, false, r.error);
      }
      break;
    }
    case 'file_info': {
      const filePath = action.args.join(':');
      const r = await window.hexAPI.butler.fileInfo(filePath);
      if (r.success) {
        addHexMessage(`**${filePath}**\nSize: ${r.sizeHuman}\nType: ${r.isDir ? 'Folder' : 'File'}\nModified: ${r.modified}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`file_info:${filePath}`, true);
      } else {
        addHexMessage(`File info error: ${r.error}`);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`file_info:${filePath}`, false, r.error);
      }
      break;
    }

    // ── Process & System ─────────────────────────────────────
    case 'list_processes': {
      const r = await window.hexAPI.butler.listProcesses();
      if (r.success) {
        const top = r.processes.slice(0, 10).map(function (p) { return p.name + ' CPU:' + p.cpu + ' RAM:' + p.mem; }).join(', ');
        addLog('BUTLER', 'processes: ' + top);
        if (window.hexMemory) window.hexMemory.recordActionOutcome(`list_processes_ok`, true);
        return { data: 'Running processes: ' + top };
      }
      break;
    }
    case 'kill_process': {
      const procName = action.args[0];
      const r = await window.hexAPI.butler.killByName(procName);
      addLog('BUTLER', r.success ? `Killed: ${procName}` : `Kill: ${r.error}`);
      addHexMessage(r.success ? `**Process terminated:** ${procName}` : `Kill failed: ${r.error}`);
      if (window.hexMemory) window.hexMemory.recordActionOutcome(`kill_process:${procName}`, r.success, r.error || '');
      break;
    }
    case 'kill_pid': {
      const pidStr = action.args[0];
      const r = await window.hexAPI.killProcess(parseInt(pidStr));
      addLog('BUTLER', r.success ? `Killed PID ${pidStr}` : `Kill PID: ${r.error}`);
      if (window.hexMemory) window.hexMemory.recordActionOutcome(`kill_pid:${pidStr}`, r.success, r.error || '');
      break;
    }
    case 'sys_info': {
      const r = await window.hexAPI.butler.sysInfo();
      if (r.success) {
        const info = 'OS: ' + r.os + ' | Host: ' + r.hostname + ' | Uptime: ' + r.uptime + ' | CPU: ' + r.cpu + ' | RAM: ' + r.ramUsed + '/' + r.ramTotal + ' (' + r.ramFree + ' free)';
        addLog('BUTLER', 'sys_info: ' + info);
        return { data: info };
      }
      break;
    }
    case 'battery': {
      const r = await window.hexAPI.butler.battery();
      if (r.success) {
        const bInfo = r.hasBattery
          ? 'Battery: ' + r.percent + '% ' + (r.isCharging ? '(charging)' : '(discharging)') + ' time remaining: ' + r.timeRemaining
          : 'No battery (desktop PC)';
        addLog('BUTLER', bInfo);
        return { data: bInfo };
      }
      break;
    }
    case 'disk_usage': {
      const r = await window.hexAPI.butler.diskUsage(action.args[0]);
      if (r.success) {
        const lines = r.disks.map(function (d) { return d.mount + ' (' + d.fs + '): ' + d.used + '/' + d.total + ' used, ' + d.free + ' free (' + d.pct + ')'; }).join(', ');
        addLog('BUTLER', 'disk_usage: ' + lines);
        return { data: 'Disk: ' + lines };
      }
      break;
    }
    case 'list_software': {
      const r = await window.hexAPI.butler.listSoftware();
      if (r.success) {
        const top = r.software.slice(0, 15).map(s => s.DisplayName + (s.DisplayVersion ? ' (' + s.DisplayVersion + ')' : '')).join(', ');
        addLog('BUTLER', `Found ${r.software.length} apps installed`);
        return { data: `Total software installed: ${r.software.length}. Sample list: ` + top };
      }
      return { data: 'Failed to list software: ' + r.error };
    }
    case 'check_updates': {
      addHexMessage('Checking Windows package manager (winget) for updates... This may take a moment.');
      const r = await window.hexAPI.butler.checkUpdates();
      if (r.success) {
        addLog('BUTLER', 'Winget check complete.');
        return { data: 'Winget output: ' + r.result };
      }
      return { data: 'Winget failed: ' + r.error };
    }
    case 'install_pkg': {
      addHexMessage(`Attempting to install \`${action.args[0]}\`... Please accept the UAC prompt if it appears.`);
      const r = await window.hexAPI.butler.installPkg(action.args[0]);
      if (r.success) addHexMessage(`Successfully installed \`${action.args[0]}\`.`);
      else addHexMessage(`Installation failed: ${r.error}`);
      break;
    }
    case 'uninstall': {
      addHexMessage(`Attempting to uninstall \`${action.args[0]}\`... Please accept the UAC prompt.`);
      const r = await window.hexAPI.butler.uninstall(action.args[0]);
      if (r.success) addHexMessage(`Successfully uninstalled \`${action.args[0]}\`.`);
      else addHexMessage(`Uninstall failed: ${r.error}`);
      break;
    }
    case 'reg_read': {
      const parts = action.args.join(':').split('|');
      const r = await window.hexAPI.butler.regRead(parts[0], parts[1], parts[2]);
      if (r.success) {
        addLog('BUTLER', `Registry Read: ${r.data}`);
        return { data: `Registry Data: ${r.data}` };
      }
      return { data: `Registry failed: ${r.error}` };
    }
    case 'reg_write': {
      const parts = action.args.join(':').split('|');
      const r = await window.hexAPI.butler.regWrite(parts[0], parts[1], parts[2], parts[3], parts[4]);
      if (r.success) addHexMessage('Registry key modified successfully.');
      else addHexMessage(`Registry modification failed: ${r.error}`);
      break;
    }
    case 'run': {
      const cmdArgs = [...action.args];
      const cmd = cmdArgs[0];
      const cmdArguments = cmdArgs.slice(1).join(':') || '';
      const r = await window.hexAPI.butler.run(cmd, cmdArguments);
      if (r.success) addHexMessage(`Launched: ${cmd}`);
      else addHexMessage(`Run failed: ${r.error}`);
      break;
    }
    case 'run_as_admin': {
      const cmd = action.args.join(':');
      const r = await window.hexAPI.butler.runAsAdmin(cmd);
      if (r.success) addHexMessage(`Executed via UAC: ${cmd}`);
      else addHexMessage(`UAC Elevation failed: ${r.error}`);
      break;
    }
    case 'sleep': {
      const ms = action.args[0] || '1';
      await window.hexAPI.butler.sleep(ms);
      break;
    }
    case 'schedule_once': {
      const time = action.args[0];
      const cmd = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.scheduleOnce(time, cmd);
      if (r.success) addHexMessage(`System task created: ${r.taskName} at ${time}`);
      else addHexMessage(`Scheduling failed: ${r.error}`);
      break;
    }
    case 'cancel_task': {
      const taskName = action.args.join(':');
      const r = await window.hexAPI.butler.cancelTask(taskName);
      if (r.success) addHexMessage(`Cancelled task: ${taskName}`);
      else addHexMessage(`Cancellation failed: ${r.error}`);
      break;
    }
    case 'startup': {
      const act = action.args[0] || '';
      const cmd = action.args[1] || '';
      const name = action.args[2] || '';
      const r = await window.hexAPI.butler.startup(act, cmd, name);
      if (r.success) addHexMessage(`Startup item updated successfully.`);
      else addHexMessage(`Startup modification failed: ${r.error}`);
      break;
    }
    case 'list_windows': {
      const r = await window.hexAPI.butler.listWindows();
      if (r.success) {
        const wins = r.windows.map(w => w.MainWindowTitle).slice(0, 15).join(', ');
        addLog('BUTLER', `Found ${r.windows.length} open windows.`);
        return { data: `Open Windows: ${wins}` };
      }
      return { data: `Failed to list windows: ${r.error}` };
    }
    case 'window': {
      const act = action.args[0];
      const title = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.windowAction(act, title);
      addHexMessage(r.success ? `Window ${act}: \`${title}\`` : `Window action failed: ${r.error}`);
      break;
    }
    case 'close_window': {
      const title = action.args.join(':');
      const r = await window.hexAPI.butler.windowAction('close', title);
      addHexMessage(r.success ? `Closed window: \`${title}\`` : `Failed to close: ${r.error}`);
      break;
    }
    case 'send_keys': {
      let keys = action.args.join(':');
      if (keys.startsWith('{') && keys.endsWith('}')) {
        const inner = keys.slice(1, -1).toUpperCase();
        const valid = ['BACKSPACE', 'BS', 'BKSP', 'BREAK', 'CAPSLOCK', 'DELETE', 'DEL', 'DOWN', 'END', 'ENTER', 'ESC', 'HELP', 'HOME', 'INSERT', 'INS', 'LEFT', 'NUMLOCK', 'PGDN', 'PGUP', 'PRINT', 'RIGHT', 'SCROLLLOCK', 'TAB', 'UP', 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'];
        if (!valid.includes(inner) && !/^F\d{1,2}$/.test(inner)) {
          keys = keys.slice(1, -1); // Strip hallucinatory {} wrapper
        }
      }
      const r = await window.hexAPI.butler.sendKeys(keys);
      addLog('BUTLER', `Sent keystrokes: ${keys}`);
      if (!r.success) addHexMessage(`Keystroke failure: ${r.error}`);
      break;
    }
    case 'mouse_move': {
      const r = await window.hexAPI.butler.mouseMove(action.args[0] || '0', action.args[1] || '0');
      if (!r.success) addHexMessage(`Mouse error: ${r.error}`);
      break;
    }
    case 'mouse_click': {
      const r = await window.hexAPI.butler.mouseClick(action.args[0] || 'left');
      if (!r.success) addHexMessage(`Mouse error: ${r.error}`);
      break;
    }
    case 'paste_clipboard': {
      const r = await window.hexAPI.butler.pasteClipboard();
      if (!r.success) addHexMessage(`Paste error: ${r.error}`);
      break;
    }
    case 'get_clipboard_img': {
      const r = await window.hexAPI.butler.getClipboardImg();
      if (r.success) {
        addHexMessage(`**Clipboard Image Extracted.**`);
        return { data: 'Clipboard contains an image.' };
      }
      return { data: `Clipboard image error: ${r.error}` };
    }
    case 'connect_wifi': {
      const r = await window.hexAPI.butler.connectWifi(action.args[0], action.args[1]);
      if (r.success) addHexMessage(`Connected to Wi-Fi: \`${action.args[0]}\``);
      else addHexMessage(`Wi-Fi connection failed: ${r.error}`);
      break;
    }
    case 'net_adapter': {
      const r = await window.hexAPI.butler.netAdapter(action.args[0], action.args[1] || 'disable');
      if (r.success) addHexMessage(`Network adapter \`${action.args[0]}\` is now modified.`);
      else addHexMessage(`Adapter modification failed: ${r.error}`);
      break;
    }
    case 'eject_usb': {
      const r = await window.hexAPI.butler.ejectUsb(action.args[0]);
      if (r.success) addHexMessage(`Safely ejected USB drive: \`${action.args[0]}:\``);
      else addHexMessage(`Eject failed: ${r.error}`);
      break;
    }
    case 'zip': {
      const r = await window.hexAPI.butler.zip(action.args[0], action.args[1]);
      if (r.success) addHexMessage(`Zipped to \`${action.args[1]}\``);
      else addHexMessage(`Zip failed: ${r.error}`);
      break;
    }
    case 'unzip': {
      const r = await window.hexAPI.butler.unzip(action.args[0], action.args[1]);
      if (r.success) addHexMessage(`Extracted to \`${action.args[1]}\``);
      else addHexMessage(`Extraction failed: ${r.error}`);
      break;
    }
    case 'clean_temp': {
      const r = await window.hexAPI.butler.cleanTemp();
      if (r.success) addHexMessage(`Cleaned local temporary environment files.`);
      else addHexMessage(`Clean temp failed: ${r.error}`);
      break;
    }
    case 'chkdsk': {
      const r = await window.hexAPI.butler.chkdsk(action.args[0]);
      if (r.success) addHexMessage(`Check Disk initialized. It will run in a separate elevated window.`);
      else addHexMessage(`Check Disk failed: ${r.error}`);
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
        const local = r.local.map(function (n) { return n.name + ': ' + n.ip; }).join(', ');
        const ipInfo = 'Local IPs: ' + local + ' | Public IP: ' + (r.publicIp || 'unavailable');
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
      addLog('BUTLER', r.success ? 'PS: ' + r.output.substring(0, 80) : 'PS error: ' + r.error);
      if (r.output) addHexMessage(`**PowerShell output:**
\`\`\`
${r.output.substring(0, 500)}
\`\`\``);
      break;
    }
    case 'run_cmd': {
      const command = action.args.join(':');
      const r = await window.hexAPI.butler.runCmd(command);
      addLog('BUTLER', r.success ? 'CMD: ' + r.output.substring(0, 80) : 'CMD error: ' + r.error);
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
      addLog('BUTLER', r.success ? 'Zipped: ' + r.output : 'Zip error: ' + r.error);
      break;
    }
    case 'unzip': {
      const zipPath = action.args[0]; const dest = action.args[1] || '';
      if (!zipPath) { addHexMessage('Specify an archive path to extract.'); break; }
      addHexMessage('Extracting **' + zipPath + '**…');
      const r = await window.hexAPI.butler.unzip(zipPath, dest);
      if (r.success) addHexMessage('**Extracted** to `' + r.dest + '`');
      else addHexMessage('Unzip failed: ' + r.error);
      addLog('BUTLER', r.success ? 'Unzipped to: ' + r.dest : 'Unzip error: ' + r.error);
      break;
    }

    // ── PROCESS ─────────────────────────────────────────
    case 'run': {
      const cmd = action.args[0]; const args = action.args.slice(1).join(' ');
      if (!cmd) break;
      addHexMessage('Running **' + cmd + (args ? ' ' + args : '') + '**…');
      const r = await window.hexAPI.butler.run(cmd, args);
      if (r.output) addHexMessage('```\n' + r.output.substring(0, 500) + '\n```');
      addLog('BUTLER', r.success ? 'Ran: ' + cmd : 'Run error: ' + r.error);
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
        const lines = r.windows.slice(0, 15).map(function (w) { return '[' + w.pid + '] ' + w.process + ': ' + w.title; }).join('\n');
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
      addLog('BUTLER', (r.success ? 'Window ' + wAction + ': ' : 'Window err: ') + wTitle);
      addHexMessage(r.success ? '**Window ' + wAction + 'd:** ' + wTitle : 'Could not ' + wAction + ' "' + wTitle + '"');
      break;
    }
    case 'close_window': {
      const r = await window.hexAPI.butler.windowAction('close', action.args.join(':'));
      addLog('BUTLER', r.success ? 'Closed window: ' + action.args.join(':') : r.error);
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
      addLog('BUTLER', r.success ? 'Mouse click: ' + (action.args[0] || 'left') : r.error);
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
      addLog('BUTLER', r.success ? 'WiFi: ' + ssid : 'WiFi error: ' + ssid);
      break;
    }
    case 'net_adapter': {
      const adapter = action.args[0]; const act = action.args[1] || 'enable';
      const r = await window.hexAPI.butler.netAdapter(adapter, act);
      addLog('BUTLER', r.success ? 'Adapter ' + act + ': ' + adapter : r.error);
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
      addLog('BUTLER', r.success ? 'Scheduled: ' + r.taskName : r.error);
      addHexMessage(r.success ? '**Task scheduled** at ' + time + ' (task: ' + r.taskName + ')' : 'Schedule failed: ' + r.error);
      break;
    }
    case 'cancel_task': {
      const r = await window.hexAPI.butler.cancelTask(action.args[0]);
      addLog('BUTLER', r.success ? 'Task cancelled: ' + action.args[0] : r.error);
      addHexMessage(r.success ? '**Task cancelled:** ' + action.args[0] : 'Cancel failed: ' + r.error);
      break;
    }
    case 'startup': {
      const act = action.args[0]; const cmd = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.startup(act, cmd, 'HEX_app');
      addLog('BUTLER', r.success ? 'Startup ' + act : r.error);
      addHexMessage(r.success ? '**Startup ' + act + ':** Done.' : 'Startup error: ' + r.error);
      break;
    }

    // ── REGISTRY ─────────────────────────────────────────

    // ── SOFTWARE ─────────────────────────────────────────
    case 'list_software': {
      addHexMessage('Scanning installed software…');
      const r = await window.hexAPI.butler.listSoftware();
      if (r.success) {
        const top = r.software.slice(0, 20).map(function (s) { return s.name + (s.version ? ' v' + s.version : ''); }).join('\n');
        addHexMessage('**Installed Software (' + r.count + ' total):**\n```\n' + top + '\n```\n_(showing first 20)_');
      } else { addHexMessage('Could not list software: ' + r.error); }
      break;
    }
    case 'check_updates': {
      addHexMessage('Checking for updates via winget…');
      const r = await window.hexAPI.butler.checkUpdates();
      addHexMessage(r.success ? '**Updates:**\n```\n' + r.output.substring(0, 600) + '\n```' : 'Updates check failed: ' + r.error);
      break;
    }
    case 'install_pkg': {
      const pkg = action.args.join(' ');
      addHexMessage('Installing **' + pkg + '** via winget…');
      const r = await window.hexAPI.butler.installPkg(pkg);
      addHexMessage(r.success ? '**Installed ' + pkg + '.**' : 'Install failed: ' + (r.error || r.output));
      addLog('BUTLER', r.success ? 'Installed: ' + pkg : 'Install error: ' + pkg);
      break;
    }
    case 'uninstall': {
      const pkg = action.args.join(' ');
      const r = await window.hexAPI.butler.uninstall(pkg);
      addHexMessage(r.success ? '**Uninstalled ' + pkg + '.**' : 'Uninstall failed: ' + (r.error || r.output));
      addLog('BUTLER', r.success ? 'Uninstalled: ' + pkg : 'Uninstall error: ' + pkg);
      break;
    }

    // ── DEV TOOLS & ADVANCED ─────────────────────────────────────────
    case 'find_file': {
      const fileName = action.args[0];
      const searchRoot = action.args.slice(1).join(':') || 'C:\\Users';
      addHexMessage(`Searching for **${fileName}** in \`${searchRoot}\`…`);
      const r = await window.hexAPI.butler.findFile(fileName, searchRoot);
      if (r.success) addHexMessage('**Found:**\n```\n' + r.output.substring(0, 800) + '\n```');
      else addHexMessage('Search failed: ' + r.error);
      break;
    }
    case 'grep_file': {
      const pattern = action.args[0];
      const filePath = action.args.slice(1).join(':');
      const r = await window.hexAPI.butler.grepFile(pattern, filePath);
      if (r.success) addHexMessage('**Grep match:**\n```\n' + r.output.substring(0, 800) + '\n```');
      else addHexMessage('Grep failed: ' + r.error);
      break;
    }
    case 'run_python': {
      const scriptPath = action.args.join(':');
      addHexMessage(`Running Python script: \`${scriptPath}\``);
      const r = await window.hexAPI.butler.runPython(scriptPath);
      if (r.success) addHexMessage('**Output:**\n```\n' + r.output.substring(0, 800) + '\n```');
      else addHexMessage('Python error: ' + r.error);
      break;
    }
    case 'git': {
      const subcmd = action.args[0];
      const repo = action.args.slice(1).join(':') || '.';
      const r = await window.hexAPI.butler.gitCommand(subcmd, repo);
      if (r.success) addHexMessage('**Git ' + subcmd + ':**\n```\n' + r.output.substring(0, 800) + '\n```');
      else addHexMessage('Git failed: ' + r.error);
      break;
    }
    case 'docker_status': {
      const r = await window.hexAPI.butler.dockerStatus();
      if (r.success) addHexMessage('**Docker Status:**\n```\n' + r.output.substring(0, 800) + '\n```');
      else addHexMessage('Docker error: ' + r.error);
      break;
    }
    case 'notify': {
      const title = action.args[0] || 'HEX Notification';
      const msg = action.args.slice(1).join(':');
      await window.hexAPI.butler.notify(title, msg);
      break;
    }
    case 'record_screen': {
      const state = (action.args[0] || 'START').toUpperCase();
      addHexMessage(state === 'START' ? '🔴 Starting screen recording...' : '⏹ Stopping screen recording...');
      const r = await window.hexAPI.butler.recordScreen(state);
      if (r.success) {
        if (state === 'START') addHexMessage(`🎬 **Recording** → \`${r.path}\``);
        else addHexMessage(`✅ **Recording saved** → \`${r.path}\``);
      } else {
        addHexMessage(`Recording failed: ${r.error}`);
      }
      break;
    }

    // ── PERIPHERALS ──────────────────────────────────────
    case 'eject_usb': {
      const letter = action.args[0] || 'E';
      const r = await window.hexAPI.butler.ejectUsb(letter);
      addLog('BUTLER', r.success ? 'Ejected: ' + r.drive : r.error);
      addHexMessage(r.success ? '**USB drive ' + r.drive + ' ejected safely.**' : 'Eject failed: ' + r.error);
      break;
    }

    // ── SCRIPTING ────────────────────────────────────────
    case 'run_js': {
      const code = action.args.join(':');
      const r = await window.hexAPI.butler.runJs(code);
      addLog('BUTLER', r.success ? 'run_js OK' : 'run_js: ' + r.error);
      if (r.success && r.output) addHexMessage('**JS output:**\n```\n' + r.output.substring(0, 400) + '\n```');
      else if (!r.success) addHexMessage('JS error: ' + r.error);
      break;
    }

    // ── MAINTENANCE ──────────────────────────────────────
    case 'reg_write': {
      const rwR = await window.hexAPI.butler.regWrite(
        action.args[0], action.args[1], action.args[2], action.args[3], action.args[4]);
      addLog('BUTLER', rwR.success ? 'Reg written' : 'Reg write: ' + rwR.error);
      addHexMessage(rwR.success ? 'Registry key written.' : 'Registry write failed: ' + rwR.error);
      break;
    }
    case 'list_games': {
      const [stR, epR] = await Promise.all([
        window.hexAPI.butler.getSteamGames().catch(function () { return { success: false, games: [] }; }),
        window.hexAPI.butler.getEpicGames().catch(function () { return { success: false, games: [] }; }),
      ]);
      const gParts = [];
      if (stR.success && stR.games.length) gParts.push('Steam (' + stR.games.length + '): ' + stR.games.map(function (g) { return g.name; }).join(', '));
      if (epR.success && epR.games.length) gParts.push('Epic (' + epR.games.length + '): ' + epR.games.map(function (g) { return g.name; }).join(', '));
      const gData = gParts.length ? gParts.join(' | ') : 'No games found';
      addLog('BUTLER', 'games: ' + gData.substring(0, 100));
      return { data: 'Installed games: ' + gData };
    }
    case 'chkdsk': {
      const drive = action.args[0] || 'C';
      addHexMessage('Running CHKDSK on **' + drive + ':**… This may take a while.');
      const r = await window.hexAPI.butler.chkdsk(drive);
      addHexMessage('**CHKDSK ' + drive + ':**\n```\n' + (r.output || '').substring(0, 500) + '\n```' + (r.note ? '\n_' + r.note + '_' : ''));
      addLog('BUTLER', 'chkdsk ' + drive + ': done');
      break;
    }


    // ── ZIP / UNZIP ───────────────────────────────────────────────────────────
    case 'zip': {
      const zSrc = action.args[0], zOut = action.args[1] || (action.args[0] + '.zip');
      if (!zSrc) { addHexMessage('Specify a source path to zip.'); break; }
      addHexMessage('Compressing ' + zSrc + '...');
      const zr = await window.hexAPI.butler.zip(zSrc, zOut);
      addHexMessage(zr.success ? 'Zipped to: ' + zr.output : 'Zip failed: ' + zr.error);
      addLog('BUTLER', zr.success ? 'Zipped: ' + zr.output : 'Zip error: ' + zr.error);
      break;
    }
    case 'unzip': {
      const uzPath = action.args[0], uzDest = action.args[1] || '';
      if (!uzPath) { addHexMessage('Specify an archive to extract.'); break; }
      addHexMessage('Extracting ' + uzPath + '...');
      const uzr = await window.hexAPI.butler.unzip(uzPath, uzDest);
      addHexMessage(uzr.success ? 'Extracted to: ' + uzr.dest : 'Unzip failed: ' + uzr.error);
      addLog('BUTLER', uzr.success ? 'Unzipped: ' + uzr.dest : 'Unzip err: ' + uzr.error);
      break;
    }

    // ── RUN / RUN_AS_ADMIN ────────────────────────────────────────────────────
    case 'run': {
      const runCmd = action.args[0], runArgs = action.args.slice(1).join(' ');
      if (!runCmd) break;
      addHexMessage('Running ' + runCmd + (runArgs ? ' ' + runArgs : '') + '...');
      const runR = await window.hexAPI.butler.run(runCmd, runArgs);
      if (runR.output) addHexMessage('Output:\n' + runR.output.substring(0, 500));
      addLog('BUTLER', runR.success ? 'Ran: ' + runCmd : 'Run err: ' + runR.error);
      break;
    }
    case 'run_as_admin': {
      const raaCmd = action.args.join(':');
      const raaR = await window.hexAPI.butler.runAsAdmin(raaCmd);
      addLog('BUTLER', raaR.success ? 'Admin run OK' : 'Admin run: ' + raaR.error);
      break;
    }

    // ── WINDOW MANAGEMENT ─────────────────────────────────────────────────────
    case 'list_windows': {
      const lwR = await window.hexAPI.butler.listWindows();
      if (lwR.success && lwR.windows.length) {
        const lwLines = lwR.windows.slice(0, 15).map(function (w) { return w.process + ': ' + w.title; }).join(', ');
        addLog('BUTLER', 'windows: ' + lwR.windows.length + ' open');
        return { data: 'Open windows (' + lwR.windows.length + '): ' + lwLines };
      } else { addHexMessage(lwR.error || 'No windows found.'); }
      break;
    }
    case 'window': {
      const winAct = action.args[0], winTitle = action.args.slice(1).join(':');
      const winR = await window.hexAPI.butler.windowAction(winAct, winTitle);
      addLog('BUTLER', (winR.success ? 'Window ' + winAct + ': ' : 'Window err: ') + winTitle);
      addHexMessage(winR.success ? 'Window ' + winAct + ': ' + winTitle : 'Could not ' + winAct + ' "' + winTitle + '"');
      break;
    }
    case 'close_window': {
      const cwR = await window.hexAPI.butler.windowAction('close', action.args.join(':'));
      addLog('BUTLER', cwR.success ? 'Closed: ' + action.args.join(':') : cwR.error);
      break;
    }
    case 'send_keys': {
      const skR = await window.hexAPI.butler.sendKeys(action.args.join(':'));
      addLog('BUTLER', skR.success ? 'SendKeys OK' : 'SendKeys: ' + skR.error);
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
      addLog('BUTLER', mcR.success ? 'Clicked: ' + (action.args[0] || 'left') : mcR.error);
      break;
    }
    case 'paste_clipboard': {
      const pcR = await window.hexAPI.butler.pasteClipboard();
      addLog('BUTLER', 'Paste: ' + (pcR.success ? 'OK' : pcR.error));
      break;
    }

    // ── CLIPBOARD IMAGE ───────────────────────────────────────────────────────
    case 'get_clipboard_img': {
      const gciR = await window.hexAPI.butler.getClipboardImg();
      if (gciR.success) {
        addHexMessage('Clipboard image saved to: ' + gciR.path);
        addLog('BUTLER', 'Clip img: ' + gciR.path);
      } else { addHexMessage('No image in clipboard. ' + (gciR.error || '')); }
      break;
    }

    // ── NETWORK EXTRA ─────────────────────────────────────────────────────────
    case 'connect_wifi': {
      const cwfSsid = action.args[0], cwfPwd = action.args[1] || '';
      addHexMessage('Connecting to ' + cwfSsid + '...');
      const cwfR = await window.hexAPI.butler.connectWifi(cwfSsid, cwfPwd);
      addHexMessage(cwfR.success ? 'Connected to ' + cwfSsid + '.' : 'WiFi failed: ' + (cwfR.error || cwfR.output));
      addLog('BUTLER', cwfR.success ? 'WiFi: ' + cwfSsid : 'WiFi err: ' + cwfSsid);
      break;
    }
    case 'net_adapter': {
      const naAdapter = action.args[0], naAct = action.args[1] || 'enable';
      const naR = await window.hexAPI.butler.netAdapter(naAdapter, naAct);
      addLog('BUTLER', naR.success ? 'Adapter ' + naAct + ': ' + naAdapter : naR.error);
      addHexMessage(naR.success ? 'Adapter ' + naAct + 'd: ' + naAdapter : 'Adapter error: ' + naR.error);
      break;
    }

    // ── AUTOMATION ────────────────────────────────────────────────────────────
    case 'sleep': {
      const slSecs = parseFloat(action.args[0]) || 1;
      addHexMessage('Waiting ' + slSecs + 's...');
      await window.hexAPI.butler.sleep(slSecs);
      addLog('BUTLER', 'Slept ' + slSecs + 's');
      break;
    }
    case 'schedule_once': {
      const soTime = action.args[0], soCmd = action.args.slice(1).join(':');
      const soR = await window.hexAPI.butler.scheduleOnce(soTime, soCmd);
      addLog('BUTLER', soR.success ? 'Scheduled: ' + soR.taskName : soR.error);
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
        const rrLines = (rrR.values || []).map(function (v) { return v.name + ' = ' + v.data + ' (' + v.type + ')'; }).join('\n');
        addHexMessage('Registry ' + rrHive + '\\' + rrKey + ':\n' + (rrLines || rrR.raw || '(empty)'));
      } else { addHexMessage('Registry read failed: ' + rrR.error); }
      break;
    }

    // ── SOFTWARE ──────────────────────────────────────────────────────────────
    case 'list_software': {
      const lsR = await window.hexAPI.butler.listSoftware();
      if (lsR.success) {
        const lsTop = lsR.software.slice(0, 30).map(function (s) { return s.name + (s.version ? ' v' + s.version : ''); }).join(', ');
        addLog('BUTLER', 'software: ' + lsR.count + ' installed');
        return { data: 'Installed software (' + lsR.count + ' total): ' + lsTop };
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
      addLog('BUTLER', ipR.success ? 'Installed: ' + ipPkg : 'Install err: ' + ipPkg);
      break;
    }
    case 'uninstall': {
      const unPkg = action.args.join(' ');
      const unR = await window.hexAPI.butler.uninstall(unPkg);
      addHexMessage(unR.success ? 'Uninstalled ' + unPkg + '.' : 'Uninstall failed: ' + (unR.error || unR.output));
      addLog('BUTLER', unR.success ? 'Uninstalled: ' + unPkg : 'Uninstall err: ' + unPkg);
      break;
    }

    // ── PERIPHERALS ───────────────────────────────────────────────────────────
    case 'eject_usb': {
      const euR = await window.hexAPI.butler.ejectUsb(action.args[0] || 'E');
      addHexMessage(euR.success ? 'USB drive ' + euR.drive + ' ejected safely.' : 'Eject failed: ' + euR.error);
      addLog('BUTLER', euR.success ? 'Ejected: ' + euR.drive : euR.error);
      break;
    }

    // ── SCRIPTING ─────────────────────────────────────────────────────────────
    case 'run_js': {
      const rjCode = action.args.join(':');
      const rjR = await window.hexAPI.butler.runJs(rjCode);
      addLog('BUTLER', rjR.success ? 'run_js OK' : 'run_js: ' + rjR.error);
      if (rjR.success && rjR.output) addHexMessage('JS output:\n' + rjR.output.substring(0, 400));
      else if (!rjR.success) addHexMessage('JS error: ' + rjR.error);
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
        lines.push('**Steam (' + steamR.games.length + '):** ' + steamR.games.slice(0, 15).map(function (g) { return g.name; }).join(', ') + (steamR.games.length > 15 ? ' …+' + (steamR.games.length - 15) + ' more' : ''));
      }
      if (epicR.success && epicR.games.length) {
        lines.push('**Epic (' + epicR.games.length + '):** ' + epicR.games.slice(0, 10).map(function (g) { return g.name; }).join(', ') + (epicR.games.length > 10 ? ' …+' + (epicR.games.length - 10) + ' more' : ''));
      }
      if (!lines.length) {
        addHexMessage('No Steam or Epic games found. Are the launchers installed?');
      } else {
        addHexMessage('**Installed Games:**\n' + lines.join('\n'));
      }
      break;
    }

    // ── Plugin Actions ──
    // Format: [ACTION:plugin:PLUGIN_ID:ACTION_NAME:ARG1:ARG2...]
    case 'plugin': {
      const pluginId = action.args[0];
      const pluginAction = action.args[1];
      const pluginArgs = action.args.slice(2);
      if (!pluginId || !pluginAction) {
        addLog('PLUGIN', 'Missing plugin ID or action name');
        break;
      }
      addLog('PLUGIN', `Executing ${pluginId}:${pluginAction}(${pluginArgs.join(', ')})`);
      try {
        const r = await window.hexAPI.plugins.execute(pluginId, pluginAction, pluginArgs);
        if (r.success) {
          const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
          addLog('PLUGIN', `${pluginId}:${pluginAction} → ${resultStr}`);
          return { data: `[Plugin: ${pluginId}] ${resultStr}` };
        } else {
          addLog('PLUGIN', `${pluginId}:${pluginAction} failed: ${r.error}`);
          addHexMessage(`Plugin error: ${r.error}`);
        }
      } catch (e) {
        addLog('PLUGIN', `Plugin execution error: ${e.message}`);
        addHexMessage(`Plugin error: ${e.message}`);
      }
      break;
    }
  }
}
