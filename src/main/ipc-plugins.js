'use strict';
// ── main/ipc-plugins.js ───────────────────────────────────────────────────────
// Plugin system IPC: discover, list, load, unload, execute, install-local,
// remove, get-action-tags, open-folder.
// Also seeds bundled sample plugins on first run.

const fs = require('fs');
const path = require('path');

module.exports = function registerPluginsIPC({
  ipcMain, app, shell, dialog,
  PluginLoader,
  sendLog,
  butlerExec,
}) {
  const pluginsDir = path.join(app.getPath('userData'), 'plugins');
  const pluginLoader = new PluginLoader(pluginsDir, (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    sendLog('PLUGINS', msg);
  });

  // ── Seed bundled sample plugins on first run ───────────────────────────────
  function seedBundledPlugins() {
    const bundledDir = path.join(__dirname, '..', '..', 'plugins');
    if (!fs.existsSync(bundledDir)) return;
    try {
      const entries = fs.readdirSync(bundledDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dest = path.join(pluginsDir, entry.name);
        if (!fs.existsSync(dest)) {
          fs.cpSync(path.join(bundledDir, entry.name), dest, { recursive: true });
          console.log(`[Plugins] Copied bundled plugin: ${entry.name}`);
        }
      }
    } catch (e) { console.warn('Plugin copy error:', e.message); }
  }

  // ── Auto-load all discovered plugins on app ready ──────────────────────────
  function loadAll() {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    seedBundledPlugins();
    const loaded = pluginLoader.loadAll();
    if (loaded.length) sendLog('PLUGINS', `${loaded.length} plugin(s) active.`);
  }

  // ── IPC handlers ──────────────────────────────────────────────────────────
  ipcMain.handle('plugins:open-folder', async () => {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    await shell.openPath(pluginsDir);
    return { success: true };
  });

  ipcMain.handle('plugins:list', () => ({
    success: true,
    plugins: pluginLoader.listLoaded(),
  }));

  ipcMain.handle('plugins:discover', () => ({
    success: true,
    plugins: pluginLoader.discover().map(m => ({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      actions: m.actions,
    })),
  }));

  ipcMain.handle('plugins:install-local', async () => {
    try {
      const result = await dialog.showOpenDialog(null, {
        title: 'Select Plugin ZIP File',
        filters: [{ name: 'Plugin Archives', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths.length) return null;

      const zipPath = result.filePaths[0];
      const zipName = path.basename(zipPath, '.zip');
      const pluginId = zipName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const destDir = path.join(pluginsDir, pluginId);

      sendLog('PLUGINS', `Installing local plugin: ${pluginId} from ${zipPath}`);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });

      const r = await butlerExec(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
      if (!r.ok) throw new Error(r.err || 'Plugin extraction failed');

      // Hot-load the newly extracted plugin
      try {
        const manifestPath = path.join(destDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          manifest._dir = destDir;
          manifest._mainPath = path.join(destDir, manifest.main);
          pluginLoader.loadPlugin(manifest);
        }
      } catch (e) {
        sendLog('PLUGINS', `Hot-load failed: ${e.message}`);
      }

      sendLog('PLUGINS', `Plugin "${pluginId}" installed successfully.`);
      return { success: true, pluginId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('plugins:remove', async (_, { id }) => {
    try {
      pluginLoader.unloadPlugin(id);
      const destDir = path.join(pluginsDir, id);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      sendLog('PLUGINS', `Removed plugin: ${id}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('plugins:load', (_, { id }) => {
    const manifests = pluginLoader.discover();
    const manifest = manifests.find(m => m.id === id);
    if (!manifest) return { success: false, error: `Plugin "${id}" not found` };
    const ok = pluginLoader.loadPlugin(manifest);
    return { success: ok, error: ok ? null : 'Failed to load plugin' };
  });

  ipcMain.handle('plugins:unload', (_, { id }) => ({
    success: pluginLoader.unloadPlugin(id),
  }));

  ipcMain.handle('plugins:execute', async (_, { pluginId, action, args }) => {
    return await pluginLoader.execute(pluginId, action, args || []);
  });

  ipcMain.handle('plugins:get-action-tags', () => ({
    success: true,
    tags: pluginLoader.getActionTags(),
  }));

  return { loadAll };
};
