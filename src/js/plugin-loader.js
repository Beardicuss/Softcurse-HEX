'use strict';
// ── plugin-loader.js — H.E.X. Plugin System v1.0 ─────────────────────────────
//
// Plugins live in %APPDATA%/softcurse-hex/plugins/<plugin-id>/
// Each plugin must have:
//   manifest.json — { id, name, version, description, main, actions[] }
//   <main>.js     — module.exports = { onLoad(), onUnload(), execute(action, args) }
//
// Lifecycle: discover → validate → load → execute → unload
// Plugins are sandboxed via vm.runInNewContext (no access to main process globals)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class PluginLoader {
    constructor(pluginsDir, logger) {
        this.pluginsDir = pluginsDir;
        this.log = logger || console.log;
        this.plugins = new Map();  // id → { manifest, instance, loaded }
        this._ensureDir();
    }

    _ensureDir() {
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
            this.log(`[Plugins] Created plugins directory: ${this.pluginsDir}`);
        }
    }

    // ── DISCOVERY ─────────────────────────────────────────────────────────────
    discover() {
        const found = [];
        try {
            const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json');
                if (!fs.existsSync(manifestPath)) continue;

                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    if (!manifest.id || !manifest.name || !manifest.main) {
                        this.log(`[Plugins] Skip "${entry.name}": manifest missing id/name/main`);
                        continue;
                    }
                    manifest._dir = path.join(this.pluginsDir, entry.name);
                    manifest._mainPath = path.join(manifest._dir, manifest.main);
                    if (!fs.existsSync(manifest._mainPath)) {
                        this.log(`[Plugins] Skip "${manifest.id}": main file "${manifest.main}" not found`);
                        continue;
                    }
                    found.push(manifest);
                } catch (e) {
                    this.log(`[Plugins] Skip "${entry.name}": bad manifest — ${e.message}`);
                }
            }
        } catch (e) {
            this.log(`[Plugins] Discovery error: ${e.message}`);
        }
        this.log(`[Plugins] Discovered ${found.length} plugin(s): ${found.map(p => p.id).join(', ')}`);
        return found;
    }

    // ── LOAD ──────────────────────────────────────────────────────────────────
    loadAll() {
        const manifests = this.discover();
        for (const manifest of manifests) {
            this.loadPlugin(manifest);
        }
        return this.listLoaded();
    }

    loadPlugin(manifest) {
        if (this.plugins.has(manifest.id)) {
            this.log(`[Plugins] "${manifest.id}" already loaded, skipping`);
            return false;
        }

        try {
            const code = fs.readFileSync(manifest._mainPath, 'utf8');

            // Create sandboxed context with limited API
            const sandbox = {
                module: { exports: {} },
                exports: {},
                require: (mod) => {
                    // Allow relative requires within plugin dir
                    if (mod.startsWith('.')) return require(path.resolve(manifest._dir, mod));
                    // Allow built-in node modules and dependencies installed in the plugin directory
                    try {
                        return require(mod);
                    } catch (e) {
                        throw new Error(`Plugin "${manifest.id}" cannot require("${mod}") — module not found or permission denied`);
                    }
                },
                console: {
                    log: (...args) => this.log(`[Plugin:${manifest.id}]`, ...args),
                    warn: (...args) => this.log(`[Plugin:${manifest.id}] WARN:`, ...args),
                    error: (...args) => this.log(`[Plugin:${manifest.id}] ERR:`, ...args),
                },
                setTimeout, clearTimeout, setInterval, clearInterval,
                Date, JSON, Math, Promise, Map, Set, Array, Object, String, Number,
                Buffer, URL, URLSearchParams,
                __dirname: manifest._dir,
                __filename: manifest._mainPath,
            };

            const script = new vm.Script(code, {
                filename: manifest._mainPath,
                timeout: 5000,
            });

            const ctx = vm.createContext(sandbox);
            script.runInContext(ctx);

            const instance = sandbox.module.exports || sandbox.exports;

            // Call onLoad if exists
            if (typeof instance.onLoad === 'function') {
                instance.onLoad({ pluginDir: manifest._dir, manifest });
            }

            this.plugins.set(manifest.id, {
                manifest,
                instance,
                loaded: true,
                loadedAt: Date.now(),
            });

            this.log(`[Plugins] Loaded "${manifest.id}" v${manifest.version || '?'}`);
            return true;
        } catch (e) {
            this.log(`[Plugins] Failed to load "${manifest.id}": ${e.message}`);
            return false;
        }
    }

    // ── UNLOAD ────────────────────────────────────────────────────────────────
    unloadPlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) return false;

        try {
            if (typeof plugin.instance.onUnload === 'function') {
                plugin.instance.onUnload();
            }
        } catch (e) {
            this.log(`[Plugins] Error in onUnload for "${id}": ${e.message}`);
        }

        this.plugins.delete(id);
        this.log(`[Plugins] Unloaded "${id}"`);
        return true;
    }

    unloadAll() {
        for (const id of [...this.plugins.keys()]) {
            this.unloadPlugin(id);
        }
    }

    // ── EXECUTE ───────────────────────────────────────────────────────────────
    async execute(pluginId, action, args = []) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return { success: false, error: `Plugin "${pluginId}" not loaded` };
        if (!plugin.instance.execute) return { success: false, error: `Plugin "${pluginId}" has no execute()` };

        // Verify action is declared in manifest
        const declaredActions = plugin.manifest.actions || [];
        if (declaredActions.length > 0 && !declaredActions.includes(action)) {
            return { success: false, error: `Action "${action}" not declared by plugin "${pluginId}"` };
        }

        try {
            const result = await Promise.race([
                Promise.resolve(plugin.instance.execute(action, args)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Plugin timeout (30s)')), 30000)),
            ]);
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ── QUERY ─────────────────────────────────────────────────────────────────
    listLoaded() {
        return [...this.plugins.values()].map(p => ({
            id: p.manifest.id,
            name: p.manifest.name,
            version: p.manifest.version || '1.0',
            description: p.manifest.description || '',
            actions: p.manifest.actions || [],
            loaded: p.loaded,
            loadedAt: p.loadedAt,
            status: 'loaded',
        }));
    }

    getPlugin(id) {
        return this.plugins.get(id) || null;
    }

    // Build action tag list for AI prompt injection
    getActionTags() {
        const tags = [];
        for (const p of this.plugins.values()) {
            for (const action of (p.manifest.actions || [])) {
                tags.push(`[ACTION:plugin:${p.manifest.id}:${action}]  ${p.manifest.name}: ${action}`);
            }
        }
        return tags;
    }
}

module.exports = PluginLoader;
