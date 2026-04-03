'use strict';
// ── system.js — Renderer-side system utilities ────────────────────────────────
// Wraps hexAPI calls with UI feedback and provides shared helper functions
// used across renderer, ai, and activity modules.

const HexSystem = {

  // ── Formatters ─────────────────────────────────────────────
  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  clamp(val, min, max) { return Math.min(Math.max(val, min), max); },

  // ── Platform detection (renderer) ──────────────────────────
  // window.navigator.platform is deprecated but still works in Electron
  getPlatformLabel() {
    const p = navigator.userAgent;
    if (p.includes('Win'))   return 'Windows';
    if (p.includes('Mac'))   return 'macOS';
    if (p.includes('Linux')) return 'Linux';
    return 'Unknown';
  },

  // ── Execute a safe system command (non-destructive) ────────
  async safeExec(cmd) {
    try {
      return await window.hexAPI.safeExec(cmd);
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ── Execute with dialog confirmation ────────────────────────
  async execWithConfirm(cmd) {
    try {
      return await window.hexAPI.execWithConfirm(cmd);
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ── Clipboard via navigator (Electron allows this) ─────────
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  },

  // ── Number animation helper ────────────────────────────────
  animateNumber(el, from, to, duration = 600, suffix = '') {
    if (!el) return;
    const steps    = 30;
    const stepTime = duration / steps;
    let   current  = from;
    let   step     = 0;
    const tick = setInterval(() => {
      step++;
      current = from + (to - from) * (step / steps);
      el.textContent = Math.round(current).toLocaleString() + suffix;
      if (step >= steps) {
        clearInterval(tick);
        el.textContent = to.toLocaleString() + suffix;
      }
    }, stepTime);
  },

  // ── Debounce ───────────────────────────────────────────────
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // ── Throttle ───────────────────────────────────────────────
  throttle(fn, limit) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= limit) { last = now; fn(...args); }
    };
  },

  // ── Timestamp ─────────────────────────────────────────────
  ts() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  },

  tsShort() {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  },

  // ── Parse common duration phrases ─────────────────────────
  // Returns ms, or 0 if not parseable
  parseDurationMs(text) {
    let ms = 0;
    const h = text.match(/(\d+)\s*h(our)?s?/i);
    const m = text.match(/(\d+)\s*m(in(ute)?s?)?/i);
    const s = text.match(/(\d+)\s*s(ec(ond)?s?)?/i);
    if (h) ms += parseInt(h[1]) * 3600000;
    if (m) ms += parseInt(m[1]) * 60000;
    if (s) ms += parseInt(s[1]) * 1000;
    return ms;
  },

  // ── Simple event bus ──────────────────────────────────────
  _listeners: {},

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },

  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
};

window.HexSystem = HexSystem;
