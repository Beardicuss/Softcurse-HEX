'use strict';
// ── Hello World Plugin — H.E.X. Plugin API Reference ─────────────────────────
// This is a sample plugin that demonstrates all available lifecycle hooks.

let loadTime = null;

module.exports = {
    /**
     * Called when the plugin is loaded. Use for initialization.
     * @param {Object} ctx - { pluginDir, manifest }
     */
    onLoad(ctx) {
        loadTime = Date.now();
        console.log(`Hello World plugin loaded from ${ctx.pluginDir}`);
    },

    /**
     * Called when the plugin is unloaded. Use for cleanup.
     */
    onUnload() {
        console.log('Hello World plugin unloaded.');
        loadTime = null;
    },

    /**
     * Called when an action is triggered.
     * @param {string} action - The action name (must be in manifest.actions)
     * @param {string[]} args - Arguments from the AI action tag
     * @returns {*} Result data to surface in chat
     */
    execute(action, args) {
        switch (action) {
            case 'greet': {
                const name = args[0] || 'User';
                return `👋 Hello, ${name}! This message is from the Hello World plugin.`;
            }
            case 'info': {
                const uptime = loadTime ? Math.round((Date.now() - loadTime) / 1000) : 0;
                return `📦 Hello World Plugin v1.0.0\nUptime: ${uptime}s\nActions: greet, info`;
            }
            default:
                return `Unknown action: ${action}`;
        }
    },
};
