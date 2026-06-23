window.hexServicesActionHandler = (() => {
  const noteDesktopOutcome = (...args) => window.hexActionHelpers?.noteDesktopOutcome?.(...args);

  function recordMemoryOutcome(key, success, error) {
    if (window.hexMemory?.recordActionOutcome) {
      window.hexMemory.recordActionOutcome(key, success, error || '');
    }
  }

  function recordBrainOutcome(key, success, error) {
    if (window.hexBrain?.recordOutcome) {
      window.hexBrain.recordOutcome(key, success, error || '');
    }
  }

  async function handle(action) {
    switch (action.type) {
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
          recordMemoryOutcome('weather', true);
        } else {
          addHexMessage(`Weather lookup failed: ${r.error}`);
          recordMemoryOutcome('weather', false, r.error);
        }
        return { handled: true };
      }

      case 'send_email': {
        const to = action.args[0] || '';
        const subject = action.args[1] || 'Message from H.E.X.';
        const body = action.args.slice(2).join(':') || '';
        const r = await window.hexAPI.butler.sendEmail(to, subject, body);
        if (r.success) {
          addHexMessage(`📧 **Email sent** to \`${r.to}\`\nSubject: ${r.subject}`);
          recordMemoryOutcome('send_email', true);
        } else {
          addHexMessage(`Email failed: ${r.error}`);
          recordMemoryOutcome('send_email', false, r.error);
        }
        return { handled: true };
      }

      case 'download_media': {
        const mediaUrl = action.args[0] || '';
        const fmt = action.args[1] || 'best';
        addHexMessage(`⬇ Downloading media... (${fmt})`);
        const r = await window.hexAPI.butler.downloadMedia(mediaUrl, fmt);
        if (r.success) {
          addHexMessage(`✅ **Download complete** via ${r.method}\n${r.path || r.output || ''}`);
          recordMemoryOutcome('download_media', true);
        } else {
          addHexMessage(`Download failed: ${r.error}`);
          recordMemoryOutcome('download_media', false, r.error);
        }
        return { handled: true };
      }

      case 'plugin': {
        const pluginId = action.args[0] || '';
        const pluginAction = action.args[1] || 'default';
        const pluginArgs = action.args.slice(2);
        const r = await window.hexAPI.plugins.execute(pluginId, pluginAction, pluginArgs);
        if (r.success) {
          const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
          recordMemoryOutcome(`plugin:${pluginId}:${pluginAction}`, true);
          return { handled: true, result: { data: `[Plugin: ${pluginId}:${pluginAction}] ${resultStr}` } };
        }

        addHexMessage(`Plugin error: ${r.error}`);
        recordMemoryOutcome(`plugin:${pluginId}:${pluginAction}`, false, r.error);
        return { handled: true };
      }

      case 'play_media': {
        const query = action.args.join(' ').trim();
        if (!query) {
          return { handled: true };
        }

        addLog('BUTLER', `Playing media: ${query}`);
        addHexMessage(`*Searching for and playing "**${query}**"...* 🎵`);
        const rMusic = await window.hexAPI.butler.findFiles(query, 'music');
        let foundFile = null;
        if (rMusic?.files?.length) {
          foundFile = rMusic.files[0];
        } else {
          const rVideo = await window.hexAPI.butler.findFiles(query, 'video');
          if (rVideo?.files?.length) {
            foundFile = rVideo.files[0];
          }
        }

        if (foundFile) {
          addHexMessage(`**Playing:** ${foundFile.name}`);
          window.hexAPI.butler.openFile(foundFile.path);
          noteDesktopOutcome({
            kind: 'file',
            label: foundFile.name || String(foundFile.path || '').split(/[\/]/).pop() || query,
            path: foundFile.path || null,
            value: foundFile.path || foundFile.name || query,
            meta: { targetType: 'media', source: 'play-media' }
          }, 'file', true);
          recordMemoryOutcome(`play_media:${query}`, true);
          recordBrainOutcome(`play_media:${query}`, true);
        } else {
          addHexMessage(`I couldn't find any playable media matching "**${query}**" on your PC.`);
          noteDesktopOutcome({
            kind: 'file',
            label: query,
            value: query,
            meta: { targetType: 'media', source: 'play-media' }
          }, 'file', false, 'not found');
          recordMemoryOutcome(`play_media:${query}`, false, 'not found');
          recordBrainOutcome(`play_media:${query}`, false, 'not found');
        }
        return { handled: true };
      }

      case 'launch_game': {
        const gameName = action.args.join(' ').trim();
        if (!gameName) {
          addHexMessage('Which game should I launch?');
          return { handled: true };
        }

        addHexMessage(`Looking for **${gameName}**…`);
        addLog('BUTLER', `Searching for game: ${gameName}`);
        const r = await window.hexAPI.butler.launchGame(gameName);
        if (r.success) {
          const plat = r.platform ? ` [${r.platform.toUpperCase()}]` : '';
          addHexMessage(`**Launching ${r.game}**${plat}. Loading…`);
          addLog('BUTLER', `Game launched: ${r.game}${plat}`);
          noteDesktopOutcome({
            kind: 'game',
            label: r.game || gameName,
            value: r.game || gameName,
            meta: { platform: r.platform || null, source: 'launch-game' }
          }, 'game', true);
          recordMemoryOutcome(`launch_game:${gameName}`, true);
          recordBrainOutcome(`launch_game:${gameName}`, true);
        } else {
          addHexMessage(`**Could not launch** "${gameName}". ${r.error || 'Not found in Steam, Epic, or installed apps.'}`);
          addLog('BUTLER', `Game not found: ${gameName}`, 'error');
          noteDesktopOutcome({
            kind: 'game',
            label: gameName,
            value: gameName,
            meta: { source: 'launch-game' }
          }, 'game', false, r.error || 'not found');
          recordMemoryOutcome(`launch_game:${gameName}`, false, r.error || 'not found');
          recordBrainOutcome(`launch_game:${gameName}`, false, r.error || 'not found');
        }
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();

