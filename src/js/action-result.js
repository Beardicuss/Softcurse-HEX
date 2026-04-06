'use strict';
// ── action-result.js — H.E.X. Action Response Standard ──────────────────────
//
// Standardizes AI action outcomes across the entire application.
// Replaces ad-hoc { success, error } returns with a rigid structure.

class ActionResult {
    /**
     * @param {Object} params
     * @param {boolean} params.success - Did the action succeed?
     * @param {string} params.action - The tag name (e.g., "scan", "download_media")
     * @param {string} [params.method] - Implementation method used (e.g., "yt-dlp", "ffmpeg")
     * @param {*} [params.data] - Data to return to the AI context
     * @param {string} [params.error] - Error message if failed
     * @param {number} [params.durationMs] - Execution time
     */
    constructor({ success, action, method = 'direct', data = null, error = null, durationMs = 0 }) {
        this.success = success;
        this.action = action;
        this.method = method;
        this.data = data;
        this.error = error;
        this.durationMs = durationMs;
        this.timestamp = Date.now();
    }

    static ok(action, data = null, method = 'direct', durationMs = 0) {
        return new ActionResult({ success: true, action, method, data, durationMs });
    }

    static fail(action, error, method = 'direct', durationMs = 0) {
        return new ActionResult({ success: false, action, method, error, durationMs });
    }

    toJSON() {
        return {
            success: this.success,
            action: this.action,
            method: this.method,
            data: this.data,
            error: this.error,
            durationMs: this.durationMs,
            timestamp: this.timestamp
        };
    }
}

module.exports = ActionResult;
