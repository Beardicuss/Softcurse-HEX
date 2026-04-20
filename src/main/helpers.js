'use strict';
// ── main/helpers.js ───────────────────────────────────────────────────────────
// Pure utility functions shared across all main-process modules.
// No Electron imports. No ipcMain. No state.

const { exec } = require('child_process');

// ---------------------------------------------------------------------------
// Byte formatting
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ---------------------------------------------------------------------------
// Human-readable uptime
// ---------------------------------------------------------------------------
function formatUptime(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return (d > 0 ? d + 'd ' : '') + (h > 0 ? h + 'h ' : '') + m + 'm';
}

// ---------------------------------------------------------------------------
// Promise-wrapped exec (rejects on non-zero exit)
// ---------------------------------------------------------------------------
function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Butler-style exec: always resolves, returns { ok, out, err }
// Used by butler handlers that handle errors themselves.
// ---------------------------------------------------------------------------
function butlerExec(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { shell: true, timeout: opts.timeout || 30000, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok:  !err,
        out: (stdout || '').trim(),
        err: (err ? (stderr || err.message) : '').trim(),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Confirmation dialog helper (shows a Yes/No dialog; resolves true/false)
// Requires { dialog, getWindow } injected at call site.
// ---------------------------------------------------------------------------
function makeButlerConfirm(dialog, getWindow) {
  return async function butlerConfirm(msg) {
    const win = getWindow();
    if (!win) return true; // no window → auto-confirm (headless / test)
    const result = await dialog.showMessageBox(win, {
      type:    'question',
      buttons: ['Cancel', 'Confirm'],
      title:   'H.E.X. Confirmation',
      message: msg,
    });
    return result.response === 1;
  };
}

module.exports = { formatBytes, formatUptime, runCmd, butlerExec, makeButlerConfirm };
