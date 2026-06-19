window.hexButlerActionHandler = (() => {
  async function handle(action) {
    switch (action.type) {
      case 'open_app': {
        const appName = action.args.join(' ').trim();
        if (!appName) {
          return { handled: true };
        }

        addLog('BUTLER', `Launching: ${appName}`);

        if (window.hexMemory && window.hexMemory.nodes) {
          const aliasLower = appName.toLowerCase();
          const targetNodes = window.hexMemory.nodes.filter((n) => {
            if (!n || !n.content) return false;
            const cLower = n.content.toLowerCase();
            if (cLower.includes('start menu') || cLower.includes('programdata\\microsoft')) return false;
            return (cLower.includes(':\\') || cLower.includes(':/')) &&
              aliasLower.split(/\s+/).every((word) => cLower.includes(word));
          });

          if (targetNodes.length > 0) {
            const bestNode = targetNodes.sort((a, b) => {
              const aIsAppPath = a.content.toLowerCase().startsWith('app_path:');
              const bIsAppPath = b.content.toLowerCase().startsWith('app_path:');
              if (aIsAppPath && !bIsAppPath) return -1;
              if (bIsAppPath && !aIsAppPath) return 1;

              const aHasName = a.content.toLowerCase().includes(appName.toLowerCase());
              const bHasName = b.content.toLowerCase().includes(appName.toLowerCase());
              if (aHasName && !bHasName) return -1;
              if (bHasName && !aHasName) return 1;

              return b.confidence - a.confidence;
            })[0];

            const match = bestNode.content.match(/[A-Za-z]:\\[a-zA-Z0-9\s\\._\-\(\)\[\],]+/, '');
            if (match) {
              let savedPath = match[0].trim();
              if (savedPath) {
                addLog('BUTLER', `Memory recall: "${appName}" → ${savedPath}`);
                if (!savedPath.toLowerCase().endsWith('.exe') && !savedPath.toLowerCase().endsWith('.lnk')) {
                  const exePath = await window.hexAPI.butler.findExeInFolder(savedPath, appName);
                  if (exePath) {
                    savedPath = exePath;
                  }
                }

                const openResult = await window.hexAPI.butler.openFile(savedPath);
                if (openResult?.success) {
                  addHexMessage(`**Opening** ${appName} (remembered path)`);
                  return { handled: true };
                }
              }
            }
          }
        }

        if (window.hexMemory && window.hexMemory.nodes) {
          const aliasLower = appName.toLowerCase();
          const targetNodes = window.hexMemory.nodes.filter((n) => {
            const cLower = n.content.toLowerCase();
            return (cLower.includes('http://') || cLower.includes('https://')) &&
              aliasLower.split(/\s+/).some((word) => word.length > 3 && cLower.includes(word));
          });

          if (targetNodes.length > 0) {
            const bestNode = targetNodes.sort((a, b) => b.confidence - a.confidence)[0];
            const match = bestNode.content.match(/https?:\/\/[^\s]+/);
            if (match) {
              const url = match[0];
              addLog('BUTLER', `Memory resolved alias "${appName}" to URL: ${url}`);
              const r = await window.hexAPI.browser.open(url);
              if (r.success) {
                addHexMessage(`**Opening resolved link:** ${url}`);
                window.hexMemory.recordActionOutcome(`open_app:${appName}`, true);
              } else {
                addHexMessage(`**Failed to open link:** ${url}`);
                window.hexMemory.recordActionOutcome(`open_app:${appName}`, false, r.error || '');
              }
              return { handled: true };
            }
          }
        }

        let r;
        let fuzzyMatch = null;
        if (window.hexAppCache && window.hexAppCache.length > 0) {
          const searchWords = appName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
          if (searchWords.length > 0) {
            fuzzyMatch = window.hexAppCache.find((a) => {
              const anl = (a.name || '').toLowerCase();
              return searchWords.every((w) => anl.includes(w));
            });
          }
        }

        if (fuzzyMatch?.path) {
          r = await window.hexAPI.butler.openFile(fuzzyMatch.path);
          if (r.success) {
            addHexMessage(`**Opening** ${fuzzyMatch.name} (Cache Bypass)`);
            addLog('BUTLER', `Launched via Cache: ${fuzzyMatch.name}`);
            window.hexCandidatePublishers?.rememberRecent({
              kind: 'app',
              label: fuzzyMatch.name || appName,
              path: fuzzyMatch.path,
              value: fuzzyMatch.name || appName
            });
            return { handled: true };
          }
        }

        r = await window.hexAPI.butler.openApp(appName);
        if (r.success) {
          const found = r.found || appName;
          addHexMessage(`**Opening** ${found}${r.method ? ` (${r.method})` : ''}.`);
          addLog('BUTLER', `Launched: ${found}`);
          window.hexCandidatePublishers?.rememberRecent({
            kind: 'app',
            label: found,
            path: r.path || null,
            value: found,
            meta: { method: r.method || null }
          });
          window.hexMemory?.recordActionOutcome(`open_app:${appName}`, true);
          window.hexBrain?.recordOutcome(`open_app:${appName}`, true);
        } else {
          addHexMessage(`**Could not open** "${appName}". ${r.error || ''}${r.hint ? ` ${r.hint}` : ''}`);
          addLog('BUTLER', `Launch failed: ${appName} — ${r.error || ''}`, 'error');
          window.hexMemory?.recordActionOutcome(`open_app:${appName}`, false, r.error || '');
          window.hexBrain?.recordOutcome(`open_app:${appName}`, false, r.error || '');
          addHexMessage(`I couldn't find "**${appName}**" on your system. Could you tell me the **exact app name** and **where the .exe file is located**? For example: \`VLC is at D:\\Programs\\VLC\\vlc.exe\`. I'll remember it for next time! 🧠`);
        }
        return { handled: true };
      }

      case 'save_app_path': {
        const qParams = action.args.join(' ').trim().split(':');
        const appName = (qParams.shift() || '').trim().toLowerCase();
        const appPath = qParams.join(':').trim();
        let cleanPath = appPath;
        if (!cleanPath.toLowerCase().endsWith('.exe') && !cleanPath.toLowerCase().endsWith('.lnk')) {
          addLog('BUTLER', `User provided partial path: ${cleanPath}`);
        }
        if (appName && cleanPath && window.hexMemory) {
          window.hexMemory.saveFact(`app_path:${appName}=${cleanPath}`);
          addHexMessage(`**Saved!** I've learned that you keep **${appName}** at \`${cleanPath}\`. I'll use this next time you ask to open it.`);
        }
        return { handled: true };
      }

      case 'open_url': {
        const url = action.args.join(':').trim();
        if (url) {
          addLog('BUTLER', `Opening URL: ${url}`);
          const r = await window.hexAPI.browser.open(url);
          if (r?.success) {
            addHexMessage(`**Opened:** ${url}`);
            window.hexMemory?.recordActionOutcome(`open_url:${url}`, true);
            window.hexBrain?.recordOutcome(`open_url:${url}`, true);
          } else {
            addHexMessage(`**Failed to open:** ${url}`);
            window.hexMemory?.recordActionOutcome(`open_url:${url}`, false, r?.error || '');
            window.hexBrain?.recordOutcome(`open_url:${url}`, false, r?.error || '');
          }
        }
        return { handled: true };
      }

      case 'empty_trash': {
        const trashResult = await window.hexAPI.butler.emptyTrash();
        addLog('BUTLER', trashResult.success ? 'Recycle bin emptied.' : `Trash: ${trashResult.error}`);
        return { handled: true };
      }

      case 'screenshot': {
        addLog('BUTLER', 'Taking screenshot...');
        const ssResult = await window.hexAPI.butler.screenshot();
        if (ssResult.success) {
          addLog('BUTLER', `Screenshot saved: ${ssResult.path}`);
          addHexMessage('**Screenshot taken** and saved to your Desktop.');
        } else {
          addLog('BUTLER', `Screenshot failed: ${ssResult.error}`, 'error');
          addHexMessage(`**Screenshot failed:** ${ssResult.error}`);
        }
        return { handled: true };
      }

      case 'lock_screen': {
        const lockResult = await window.hexAPI.butler.lockScreen();
        if (lockResult.success) addLog('BUTLER', 'Screen locked.');
        return { handled: true };
      }

      case 'shutdown': {
        const shutResult = await window.hexAPI.butler.shutdown();
        if (shutResult.success) addLog('BUTLER', 'Shutdown initiated.');
        return { handled: true };
      }

      case 'restart': {
        const restartResult = await window.hexAPI.butler.restart();
        if (restartResult.success) addLog('BUTLER', 'Restart initiated.');
        return { handled: true };
      }

      case 'clear_memory': {
        const act = action.args[0] || '';
        const cmd = action.args[1] || '';
        const name = action.args[2] || '';
        const r = await window.hexAPI.butler.startup(act, cmd, name);
        addHexMessage(r.success ? 'Startup item updated successfully.' : `Startup modification failed: ${r.error}`);
        return { handled: true };
      }

      case 'set_wallpaper': {
        const r = await window.hexAPI.butler.setWallpaper(action.args[0]);
        addLog('BUTLER', r.success ? `Wallpaper set: ${action.args[0]}` : r.error);
        if (r.success) addHexMessage('**Wallpaper updated.**');
        return { handled: true };
      }

      case 'logoff': {
        const r = await window.hexAPI.butler.logoff();
        addLog('BUTLER', r.success ? 'Logging off…' : r.error);
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();

