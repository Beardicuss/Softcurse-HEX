window.hexSmartActionHandler = (() => {
  async function handle(action) {
    switch (action.type) {
      case 'schedule_recurring': {
        const cron = action.args[0] || '';
        const label = action.args.slice(1).join(' ') || 'Recurring task';
        const r = await window.hexAPI.recurring.add(cron, label);
        addHexMessage(
          r.success
            ? `🔄 **Recurring schedule set**: "${r.label}"\nCron: \`${r.cron}\` | ID: \`${r.id}\``
            : `Schedule error: ${r.error}`
        );
        return { handled: true };
      }

      case 'clipboard_history': {
        const r = await window.hexAPI.clipboard.history();
        if (r.success && r.items.length) {
          const list = r.items
            .slice(0, 10)
            .map((c, i) => `${i + 1}. "${c.text.substring(0, 80)}${c.text.length > 80 ? '…' : ''}"`)
            .join('\n');
          addHexMessage(`📋 **Clipboard History** (last ${r.items.length})\n\n${list}`);
        } else {
          addHexMessage('📋 Clipboard history is empty.');
        }
        return { handled: true };
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
          return { handled: true, result: { data: JSON.stringify(h) } };
        }
        return { handled: true };
      }

      case 'organize_files': {
        const dir = action.args.join(':') || action.args[0];
        const r = await window.hexAPI.smartFiles.organize(dir);
        addHexMessage(
          r.success
            ? `📂 **Organized ${r.organized} files** in \`${dir}\` into category folders.`
            : `Organize failed: ${r.error}`
        );
        return { handled: true };
      }

      case 'batch_rename': {
        const dir = action.args[0] || '';
        const pattern = action.args[1] || '';
        const replacement = action.args[2] || '';
        const r = await window.hexAPI.smartFiles.batchRename(dir, pattern, replacement);
        addHexMessage(
          r.success
            ? `✏ **Renamed ${r.renamed} files** matching \`${pattern}\``
            : `Rename failed: ${r.error}`
        );
        return { handled: true };
      }

      case 'find_duplicates': {
        const dir = action.args.join(':') || action.args[0];
        const r = await window.hexAPI.smartFiles.findDuplicates(dir);
        if (r.success) {
          if (r.duplicates.length) {
            const list = r.duplicates
              .slice(0, 5)
              .map((d) => `${d.files.join(', ')} (${Math.round(d.size / 1024)} KB)`)
              .join('\n');
            addHexMessage(`🔍 **Found ${r.total} potential duplicates** (by size)\n\n${list}`);
          } else {
            addHexMessage('✅ No duplicates found.');
          }
        } else {
          addHexMessage(`Duplicate scan failed: ${r.error}`);
        }
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();
