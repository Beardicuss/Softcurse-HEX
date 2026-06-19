window.hexDeviceActionHandler = (() => {
  async function handle(action) {
    switch (action.type) {
      case 'send_keys': {
        let keys = action.args.join(':');
        if (keys.startsWith('{') && keys.endsWith('}')) {
          const inner = keys.slice(1, -1).toUpperCase();
          const valid = ['BACKSPACE', 'BS', 'BKSP', 'BREAK', 'CAPSLOCK', 'DELETE', 'DEL', 'DOWN', 'END', 'ENTER', 'ESC', 'HELP', 'HOME', 'INSERT', 'INS', 'LEFT', 'NUMLOCK', 'PGDN', 'PGUP', 'PRINT', 'RIGHT', 'SCROLLLOCK', 'TAB', 'UP', 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'];
          if (!valid.includes(inner) && !/^F\d{1,2}$/.test(inner)) {
            keys = keys.slice(1, -1);
          }
        }
        const r = await window.hexAPI.butler.sendKeys(keys);
        addLog('BUTLER', `Sent keystrokes: ${keys}`);
        if (!r.success) addHexMessage(`Keystroke failure: ${r.error}`);
        return { handled: true };
      }

      case 'mouse_move': {
        const r = await window.hexAPI.butler.mouseMove(action.args[0] || '0', action.args[1] || '0');
        if (!r.success) addHexMessage(`Mouse error: ${r.error}`);
        return { handled: true };
      }

      case 'mouse_click': {
        const r = await window.hexAPI.butler.mouseClick(action.args[0] || 'left');
        if (!r.success) addHexMessage(`Mouse error: ${r.error}`);
        return { handled: true };
      }

      case 'paste_clipboard': {
        const r = await window.hexAPI.butler.pasteClipboard();
        if (!r.success) addHexMessage(`Paste error: ${r.error}`);
        return { handled: true };
      }

      case 'get_clipboard_img': {
        const r = await window.hexAPI.butler.getClipboardImg();
        if (r.success) {
          addHexMessage('**Clipboard Image Extracted.**');
          return { handled: true, result: { data: 'Clipboard contains an image.' } };
        }
        return { handled: true, result: { data: `Clipboard image error: ${r.error}` } };
      }

      case 'get_clipboard': {
        const r = await window.hexAPI.butler.getClipboard();
        if (r.success) {
          addHexMessage(`**Clipboard contents:**\n${r.text.substring(0, 400)}${r.text.length > 400 ? '…' : ''}`);
        }
        return { handled: true };
      }

      case 'set_clipboard': {
        const text = action.args.join(':');
        await window.hexAPI.butler.setClipboard(text);
        addLog('BUTLER', 'Clipboard set.');
        addHexMessage('**Clipboard updated.**');
        return { handled: true };
      }

      case 'clear_clipboard': {
        await window.hexAPI.butler.clearClipboard();
        addLog('BUTLER', 'Clipboard cleared.');
        return { handled: true };
      }

      case 'set_volume': {
        const level = parseInt(action.args[0], 10) || 50;
        await window.hexAPI.butler.setVolume(level);
        addLog('BUTLER', `Volume → ${level}%`);
        addHexMessage(`**Volume set to ${level}%.**`);
        return { handled: true };
      }

      case 'mute': {
        await window.hexAPI.butler.mute(true);
        addLog('BUTLER', 'Muted.');
        addHexMessage('**Audio muted.**');
        return { handled: true };
      }

      case 'unmute': {
        await window.hexAPI.butler.mute(false);
        addLog('BUTLER', 'Unmuted.');
        addHexMessage('**Audio unmuted.**');
        return { handled: true };
      }

      case 'get_volume': {
        const r = await window.hexAPI.butler.getVolume();
        addHexMessage(r.success ? `**Volume:** ${r.level}%${r.note ? ' — ' + r.note : ''}` : `Could not read volume: ${r.error}`);
        return { handled: true };
      }

      case 'get_ip': {
        const r = await window.hexAPI.butler.getIp();
        if (r.success) {
          const local = r.local.map((n) => `${n.name}: ${n.ip}`).join(', ');
          const ipInfo = `Local IPs: ${local} | Public IP: ${r.publicIp || 'unavailable'}`;
          addLog('BUTLER', ipInfo);
          return { handled: true, result: { data: ipInfo } };
        }
        return { handled: true };
      }

      case 'ping': {
        addHexMessage(`Pinging ${action.args[0]}…`);
        const r = await window.hexAPI.butler.ping(action.args[0]);
        addHexMessage(`**Ping ${action.args[0]}:**\n\`\`\`\n${r.output.substring(0, 300)}\n\`\`\``);
        return { handled: true };
      }

      case 'flush_dns': {
        const r = await window.hexAPI.butler.flushDns();
        addLog('BUTLER', `DNS flush: ${r.success ? 'OK' : r.error}`);
        addHexMessage(r.success ? '**DNS cache flushed.**' : `DNS flush failed: ${r.error}`);
        return { handled: true };
      }

      case 'list_wifi': {
        const r = await window.hexAPI.butler.listWifi();
        addHexMessage(
          r.success
            ? `**Wi-Fi Networks:**\n\`\`\`\n${r.output.substring(0, 600)}\n\`\`\``
            : `Wi-Fi scan failed: ${r.error}`
        );
        return { handled: true };
      }

      case 'connect_wifi': {
        const r = await window.hexAPI.butler.connectWifi(action.args[0], action.args[1]);
        addHexMessage(r.success ? `Connected to Wi-Fi: \`${action.args[0]}\`` : `Wi-Fi connection failed: ${r.error}`);
        return { handled: true };
      }

      case 'net_adapter': {
        const r = await window.hexAPI.butler.netAdapter(action.args[0], action.args[1] || 'disable');
        addHexMessage(r.success ? `Network adapter \`${action.args[0]}\` is now modified.` : `Adapter modification failed: ${r.error}`);
        return { handled: true };
      }

      case 'eject_usb': {
        const r = await window.hexAPI.butler.ejectUsb(action.args[0]);
        addHexMessage(r.success ? `Safely ejected USB drive: \`${action.args[0]}:\`` : `Eject failed: ${r.error}`);
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();
