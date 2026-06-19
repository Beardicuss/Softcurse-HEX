// == actions.js == AI Action Dispatcher ========================================
// Extracted from renderer.js -- handles all [ACTION:*] tags from AI responses.
// Depends on globals: addLog, addHexMessage, showToast, speakWithConfig,
//   runTask, openProcesses, openSettings, window.hexAPI, window.hexBrowser,
//   window.reminders

// ── Web Vision Helper ───────────────────────────────────────────────────────
// Captures browser screenshot and stores for follow-up AI vision processing.
// Returns a text description and sets window._webVisionData for the follow-up call.
window._webVisionData = null;
window._webVisionMeta = null;

function _publishGameCandidates(games) {
  return window.hexCandidatePublishers?.publishGames?.(games) || [];
}

async function handleAIAction(action) {
  const delegatedBrowserAction = await window.hexBrowserActionHandler?.handle?.(action);
  if (delegatedBrowserAction?.handled) {
    return delegatedBrowserAction.result;
  }
  const delegatedFileAction = await window.hexFileActionHandler?.handle?.(action);
  if (delegatedFileAction?.handled) {
    return delegatedFileAction.result;
  }
  const delegatedSystemAction = await window.hexSystemActionHandler?.handle?.(action);
  if (delegatedSystemAction?.handled) {
    return delegatedSystemAction.result;
  }
  const delegatedDeviceAction = await window.hexDeviceActionHandler?.handle?.(action);
  if (delegatedDeviceAction?.handled) {
    return delegatedDeviceAction.result;
  }
  const delegatedOpsAction = await window.hexOpsActionHandler?.handle?.(action);
  if (delegatedOpsAction?.handled) {
    return delegatedOpsAction.result;
  }
  const delegatedServicesAction = await window.hexServicesActionHandler?.handle?.(action);
  if (delegatedServicesAction?.handled) {
    return delegatedServicesAction.result;
  }
  const delegatedAssistantAction = await window.hexAssistantActionHandler?.handle?.(action);
  if (delegatedAssistantAction?.handled) {
    return delegatedAssistantAction.result;
  }
  const delegatedSmartAction = await window.hexSmartActionHandler?.handle?.(action);
  if (delegatedSmartAction?.handled) {
    return delegatedSmartAction.result;
  }
  const delegatedButlerAction = await window.hexButlerActionHandler?.handle?.(action);
  if (delegatedButlerAction?.handled) {
    return delegatedButlerAction.result;
  }

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

    // ── Utilities ──
    case 'set_reminder':
      if (action.args.length >= 2) {
        const label = action.args[0];
        const min = parseInt(action.args[1]) || 30;
        await window.reminders.set(label, min * 60000);
      }
      break;

    // ── AUTOMATION ───────────────────────────────────────
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
      _publishGameCandidates([...(stR.games || []), ...(epR.games || [])]);
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
    case 'switch_mode': {
      // [ACTION:switch_mode:cardinal] or [ACTION:switch_mode:hex]
      const target = (action.args[0] || 'toggle').toLowerCase().trim();
      switchMode(target);
      break;
    }
  }
}
