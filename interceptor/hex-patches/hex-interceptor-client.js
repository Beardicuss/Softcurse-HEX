'use strict';
// ============================================================
// H.E.X — Interceptor Client (Phase 4)
// This is the ONLY file in the H.E.X project that knows
// the interceptor exists. Everything else stays untouched.
//
// Drop this file into: Softcurse-HEX-main/src/js/
// ============================================================

const INTERCEPTOR_URL = (
  typeof window !== 'undefined' && window.__INTERCEPTOR_URL__
) || 'http://localhost:3500';

// Cached allowed tools per session (avoids extra round-trips)
const _sessionAllowedTools = new Map(); // sessionId → string[]
const _sessionTraceIds     = new Map(); // sessionId → last traceId

// ── Public API ────────────────────────────────────────────────

/**
 * Call BEFORE window.hexAI.chat()
 * Returns sanitized input, allowed tools, traceId, and flags.
 * If the interceptor is unreachable, returns a passthrough result
 * so H.E.X degrades gracefully (interceptor is optional in dev).
 */
async function interceptorPrecheck(userInput, sessionId, mode = 'normal') {
  try {
    const res = await fetch(`${INTERCEPTOR_URL}/precheck`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userInput, sessionId, mode }),
    });

    if (res.status === 429) {
      const data = await res.json();
      console.warn('[interceptor] Rate limited:', data);
      return {
        ok:           false,
        rateLimited:  true,
        retryAfterMs: data.retryAfterMs ?? 60000,
        traceId:      data.traceId,
        sanitized:    userInput,
        allowedTools: [],
        warnings:     data.warnings ?? [],
        flags:        { unsafePatternDetected: false, contextTruncated: false, toolsRestricted: false },
      };
    }

    if (!res.ok) throw new Error(`Interceptor precheck returned ${res.status}`);

    const data = await res.json();
    _sessionAllowedTools.set(sessionId, data.allowedTools ?? []);
    _sessionTraceIds.set(sessionId, data.traceId);

    return {
      ok:           true,
      rateLimited:  false,
      traceId:      data.traceId,
      sanitized:    data.sanitized ?? userInput,
      allowedTools: data.allowedTools ?? [],
      warnings:     data.warnings ?? [],
      flags:        data.flags ?? {},
    };
  } catch (err) {
    // Interceptor unreachable — degrade gracefully
    console.warn('[interceptor] Precheck unreachable, passing through:', err.message);
    return {
      ok:           true,   // don't block H.E.X
      passthrough:  true,
      traceId:      null,
      sanitized:    userInput,
      allowedTools: _getFallbackTools(),
      warnings:     [],
      flags:        {},
    };
  }
}

/**
 * Call AFTER window.hexAI.chat() returns.
 * Logs the full trace and returns post-processed content + warnings.
 * Fire-and-forget is fine — H.E.X doesn't need to await this.
 */
async function interceptorPostlog(traceId, sessionId, mode, rawInput, aiResponse, allowedTools) {
  if (!traceId) return; // passthrough mode — nothing to log
  try {
    await fetch(`${INTERCEPTOR_URL}/postlog`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        traceId,
        sessionId,
        mode,
        rawInput,
        aiResponse,
        allowedTools: allowedTools ?? [],
      }),
    });
  } catch (err) {
    console.warn('[interceptor] Postlog failed (non-critical):', err.message);
  }
}

/**
 * Check if a specific action type is allowed for this session.
 * Uses the cached allowedTools from the last precheck.
 * Maps H.E.X action names → interceptor tool IDs.
 */
function interceptorAllowAction(actionType, sessionId) {
  const allowed = _sessionAllowedTools.get(sessionId);
  if (!allowed) return true; // no cache yet → allow (fail-open for UX)

  const toolId = ACTION_TO_TOOL[actionType];
  if (!toolId) return true;  // unmapped action → not interceptor's concern

  return allowed.includes(toolId);
}

/**
 * Get the last traceId for a session.
 * Useful for linking H.E.X memory turns to the interceptor trace.
 */
function interceptorLastTraceId(sessionId) {
  return _sessionTraceIds.get(sessionId) ?? null;
}

// ── Action → Tool ID mapping ──────────────────────────────────
// Maps H.E.X [ACTION:*] types to interceptor tool policy IDs.
// Only actions that map to a restricted tool need to be listed here.
const ACTION_TO_TOOL = {
  // File operations
  'create_file':    'file.write',
  'create_doc':     'file.write',
  'create_folder':  'file.write',
  'rename':         'file.write',
  'move':           'file.write',
  'batch_rename':   'file.write',
  'organize_files': 'file.write',
  'delete':         'file.delete',
  'delete_perm':    'file.delete',
  'unzip':          'file.write',
  'zip':            'file.write',
  'set_wallpaper':  'file.write',
  'open_file':      'file.read',
  'open_folder':    'file.read',
  'list_dir':       'file.read',
  'find_file':      'file.read',
  'find_files':     'file.read',
  'file_info':      'file.read',
  'grep_file':      'file.read',
  'find_duplicates':'file.read',
  // Shell / execution
  'run':            'shell.exec',
  'run_as_admin':   'shell.exec',
  'run_cmd':        'shell.exec',
  'run_ps':         'shell.exec',
  'run_python':     'shell.exec',
  'run_js':         'shell.exec',
  'git':            'shell.exec',
  'install_pkg':    'shell.exec',
  'uninstall':      'shell.exec',
  'chkdsk':         'shell.exec',
  'reg_read':       'shell.exec',
  'reg_write':      'shell.exec',
  'startup':        'shell.exec',
  'shutdown':       'shell.exec',
  'restart':        'shell.exec',
  'logoff':         'shell.exec',
  'lock_screen':    'shell.exec',
  'kill_process':   'shell.exec',
  'kill_pid':       'shell.exec',
  // Network
  'browser_search': 'network.fetch',
  'browser_open':   'network.fetch',
  'browser_scrape': 'network.fetch',
  'open_url':       'network.fetch',
  'download_media': 'network.fetch',
  'speed_test':     'network.fetch',
  'ping':           'network.fetch',
  'send_email':     'network.fetch',
  'get_ip':         'network.fetch',
  'connect_wifi':   'network.fetch',
  'weather':        'network.fetch',
  'translate':      'network.fetch',
  // Memory
  'set_reminder':   'memory.write',
  'schedule_once':  'memory.write',
  'schedule_recurring': 'memory.write',
};

// ── Fallback tool list (when interceptor is unreachable) ──────
function _getFallbackTools() {
  return ['file.read', 'memory.read', 'network.fetch', 'memory.write', 'file.write'];
}

// ── Expose on window for use in renderer.js and actions.js ───
window.hexInterceptor = {
  precheck:      interceptorPrecheck,
  postlog:       interceptorPostlog,
  allowAction:   interceptorAllowAction,
  lastTraceId:   interceptorLastTraceId,
};
