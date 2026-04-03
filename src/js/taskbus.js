'use strict';
// ── taskbus.js — Real-time task status bus for H.E.X. ──────────────────────
// Components push their current operation status here.
// The orb animation reads from it to display what HEX is actually doing.

window.hexTaskBus = {
    _current: 'System idle',
    _queue: [],          // [{ text, ts }]
    _maxQueue: 20,
    _idleTimeout: null,

    // Push a real task status (components call this)
    push(text) {
        this._current = text;
        this._queue.push({ text, ts: Date.now() });
        if (this._queue.length > this._maxQueue) this._queue.shift();
        // Auto-revert to idle after 4s if nothing new comes in
        clearTimeout(this._idleTimeout);
        this._idleTimeout = setTimeout(() => { this._current = 'System idle'; }, 4000);
    },

    // Get current task (orb reads this)
    current() {
        return this._current;
    },

    // Get recent task log
    recent(n = 5) {
        return this._queue.slice(-n).map(q => q.text);
    }
};
