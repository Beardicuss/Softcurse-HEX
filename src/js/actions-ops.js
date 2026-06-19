window.hexOpsActionHandler = (() => {
  async function handle(action) {
    switch (action.type) {
      case 'list_software': {
        const r = await window.hexAPI.butler.listSoftware();
        if (r.success) {
          window.hexCandidatePublishers?.publishApps(r.software || []);

          const top = r.software
            .slice(0, 15)
            .map((s) => s.DisplayName + (s.DisplayVersion ? ` (${s.DisplayVersion})` : ''))
            .join(', ');
          addLog('BUTLER', `Found ${r.software.length} apps installed`);
          return { handled: true, result: { data: `Total software installed: ${r.software.length}. Sample list: ${top}` } };
        }
        return { handled: true, result: { data: `Failed to list software: ${r.error}` } };
      }

      case 'check_updates': {
        addHexMessage('Checking Windows package manager (winget) for updates... This may take a moment.');
        const r = await window.hexAPI.butler.checkUpdates();
        if (r.success) {
          addLog('BUTLER', 'Winget check complete.');
          return { handled: true, result: { data: `Winget output: ${r.result}` } };
        }
        return { handled: true, result: { data: `Winget failed: ${r.error}` } };
      }

      case 'install_pkg': {
        addHexMessage(`Attempting to install \`${action.args[0]}\`... Please accept the UAC prompt if it appears.`);
        const r = await window.hexAPI.butler.installPkg(action.args[0]);
        addHexMessage(r.success ? `Successfully installed \`${action.args[0]}\`.` : `Installation failed: ${r.error}`);
        return { handled: true };
      }

      case 'uninstall': {
        addHexMessage(`Attempting to uninstall \`${action.args[0]}\`... Please accept the UAC prompt.`);
        const r = await window.hexAPI.butler.uninstall(action.args[0]);
        addHexMessage(r.success ? `Successfully uninstalled \`${action.args[0]}\`.` : `Uninstall failed: ${r.error}`);
        return { handled: true };
      }

      case 'zip': {
        const r = await window.hexAPI.butler.zip(action.args[0], action.args[1]);
        addHexMessage(r.success ? `Zipped to \`${action.args[1]}\`` : `Zip failed: ${r.error}`);
        return { handled: true };
      }

      case 'unzip': {
        const r = await window.hexAPI.butler.unzip(action.args[0], action.args[1]);
        addHexMessage(r.success ? `Extracted to \`${action.args[1]}\`` : `Extraction failed: ${r.error}`);
        return { handled: true };
      }

      case 'clean_temp': {
        const r = await window.hexAPI.butler.cleanTemp();
        if (r.success) {
          addLog('BUTLER', r.freed ? `Temp cleaned: ${r.freed} freed` : 'Temp cleaned');
          addHexMessage(r.freed
            ? `**Temp files cleaned:** ${r.freed} freed, ${r.count} items removed, ${r.skipped} skipped (in use).`
            : 'Cleaned local temporary environment files.');
        } else {
          addHexMessage(`Clean temp failed: ${r.error}`);
        }
        return { handled: true };
      }

      case 'chkdsk': {
        const r = await window.hexAPI.butler.chkdsk(action.args[0]);
        addHexMessage(r.success ? 'Check Disk initialized. It will run in a separate elevated window.' : `Check Disk failed: ${r.error}`);
        return { handled: true };
      }

      case 'get_env': {
        const r = await window.hexAPI.butler.getEnv(action.args[0]);
        addHexMessage(
          r.value !== null
            ? `**${r.variable}** = \`${r.value}\``
            : `Environment variable \`${r.variable}\` is not set.`
        );
        return { handled: true };
      }

      case 'set_env': {
        const r = await window.hexAPI.butler.setEnv(action.args[0], action.args[1]);
        addLog('BUTLER', r.success ? `ENV set: ${action.args[0]}` : r.error);
        return { handled: true };
      }

      case 'run_ps': {
        const script = action.args.join(':');
        const r = await window.hexAPI.butler.runPs(script);
        addLog('BUTLER', r.success ? `PS: ${r.output.substring(0, 80)}` : `PS error: ${r.error}`);
        if (r.output) {
          addHexMessage(`**PowerShell output:**\n\`\`\`\n${r.output.substring(0, 500)}\n\`\`\``);
        }
        return { handled: true };
      }

      case 'run_cmd': {
        const command = action.args.join(':');
        const r = await window.hexAPI.butler.runCmd(command);
        addLog('BUTLER', r.success ? `CMD: ${r.output.substring(0, 80)}` : `CMD error: ${r.error}`);
        if (r.output) {
          addHexMessage(`**CMD output:**\n\`\`\`\n${r.output.substring(0, 500)}\n\`\`\``);
        }
        return { handled: true };
      }

      default:
        return { handled: false };
    }
  }

  return { handle };
})();

