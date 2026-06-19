window.hexAssistantActionHandler = (() => {
  function recordMemoryOutcome(key, success, error) {
    if (window.hexMemory?.recordActionOutcome) {
      window.hexMemory.recordActionOutcome(key, success, error || '');
    }
  }

  async function handle(action) {
    switch (action.type) {
      case 'qr_code': {
        const qrText = action.args.join(':');
        const r = await window.hexAPI.butler.qrCode(qrText);
        addLog('BUTLER', r.success ? `QR saved: ${r.path}` : `QR failed: ${r.error}`);
        recordMemoryOutcome('qr_code', r.success, r.error);
        if (r.success) {
          addHexMessage(`**QR code saved** to \`${r.path}\``);
        }
        return { handled: true };
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
          recordMemoryOutcome('speed_test', true);
        } else {
          addHexMessage(`Speed test failed: ${r.error}`);
          recordMemoryOutcome('speed_test', false, r.error);
        }
        return { handled: true };
      }

      case 'morning_digest': {
        const r = await window.hexAPI.butler.morningDigest();
        if (r.success && !r.skipped) {
          const d = r.digest;
          let msg = `☀ **Morning Briefing — ${d.date}**\n\n`;
          if (d.weather) msg += `🌡 **${d.weather.city}**: ${d.weather.temp}, ${d.weather.description}, 💧 ${d.weather.humidity}, 💨 ${d.weather.wind}\n`;
          if (d.system) msg += `💻 Uptime: ${d.system.uptime} | RAM: ${d.system.freeRAM} free / ${d.system.totalRAM}\n`;
          if (d.reminders?.length) msg += `⏰ ${d.reminders.length} pending reminder(s): ${d.reminders.map((item) => item.label).join(', ')}\n`;
          else msg += '✅ No pending reminders.\n';
          addHexMessage(msg);
        } else if (r.skipped) {
          addHexMessage('Already briefed today. Say "morning digest" again tomorrow!');
        }
        return { handled: true };
      }

      case 'define': {
        const word = action.args.join(' ');
        const r = await window.hexAPI.butler.define(word);
        if (r.success) {
          let msg = `📖 **${r.word}** ${r.phonetic}\n\n`;
          for (const meaning of r.meanings) {
            msg += `*${meaning.partOfSpeech}*\n`;
            for (const definition of meaning.definitions) {
              msg += `  • ${definition}\n`;
            }
            if (meaning.example) {
              msg += `  _"${meaning.example}"_\n`;
            }
          }
          addHexMessage(msg);
        } else {
          addHexMessage(`Dictionary: ${r.error}`);
        }
        return { handled: true };
      }

      case 'translate': {
        const parts = action.args.join(':').split(':');
        const text = parts[0] || '';
        const from = parts[1] || 'en';
        const to = parts[2] || 'ru';
        const r = await window.hexAPI.butler.translate(text, from, to);
        addHexMessage(
          r.success
            ? `🌐 **${r.from} → ${r.to}**\n\n"${r.original}"\n↓\n"${r.translated}"`
            : `Translation failed: ${r.error}`
        );
        return { handled: true };
      }

      case 'browser_scrape': {
        const targetUrl = action.args.join(':');
        addHexMessage(`🕷 Scraping \`${targetUrl}\`...`);
        try {
          const r = await window.hexAPI.browser.scrape(targetUrl);
          if (r.success) {
            addHexMessage(`✅ Scraped **"${r.title}"** (${r.charCount} chars)`);
            return { handled: true, result: { data: `Scraped content from ${r.title} (${r.url}):\n\n${r.text}` } };
          }
          addHexMessage(`Scrape failed: ${r.error}`);
        } catch (error) {
          addHexMessage(`Scrape error: ${error.message}`);
        }
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();
