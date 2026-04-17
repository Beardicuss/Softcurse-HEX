// ============================================================
// PATCH: Softcurse-HEX-main/src/js/renderer.js
// Phase 4 — Interceptor integration
//
// HOW TO APPLY:
//   Find each "── FIND ──" block exactly as it appears in renderer.js
//   Replace it with the matching "── REPLACE WITH ──" block.
//   There are exactly 3 changes total.
// ============================================================


// ════════════════════════════════════════════════════════════════
// CHANGE 1 of 3
// Add a stable session ID near the top of renderer.js (after the
// existing `let visionEnabled = false;` line, around line 406).
//
// ── FIND ──────────────────────────────────────────────────────
let visionEnabled = false;

// ── REPLACE WITH ──────────────────────────────────────────────
let visionEnabled = false;

// ── Interceptor session ID ─────────────────────────────────────
// Stable UUID per app launch. Stored in sessionStorage so it
// survives renderer reloads but resets on full app restart.
const _hexSessionId = (() => {
  const KEY = 'hex_interceptor_session';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
})();
// ══════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════
// CHANGE 2 of 3
// Wrap the main AI chat call with precheck (before) and postlog (after).
//
// ── FIND ──────────────────────────────────────────────────────
    const result = await window.hexAI.chat(text, systemState, config.language || 'en', visionData);
    hideTyping();
    window.hexAudio.stop('processing');
    const hexText = result.text || '…';
    addHexMessage(hexText);
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

// ── REPLACE WITH ──────────────────────────────────────────────
    // ── Phase 4: Interceptor precheck ──────────────────────────
    // Runs sanitization + tool-policy BEFORE the AI call.
    // Degrades gracefully if the interceptor is unreachable.
    let _interceptorMeta = { traceId: null, sanitized: text, allowedTools: [] };
    if (window.hexInterceptor) {
      window.hexTaskBus?.push('Interceptor precheck...');
      const _pre = await window.hexInterceptor.precheck(text, _hexSessionId, config.llm?.provider === 'none' ? 'sandbox' : 'normal');
      if (_pre.rateLimited) {
        hideTyping();
        window.hexAudio.stop('processing');
        addHexMessage(`⚠ Rate limit active. Retry in ${Math.ceil((_pre.retryAfterMs || 60000) / 1000)}s.`);
        return;
      }
      _interceptorMeta = { traceId: _pre.traceId, sanitized: _pre.sanitized, allowedTools: _pre.allowedTools };
      if (_pre.warnings?.length) {
        _pre.warnings.forEach(w => addLog('INTERCEPTOR', w));
      }
    }

    const result = await window.hexAI.chat(_interceptorMeta.sanitized, systemState, config.language || 'en', visionData);
    hideTyping();
    window.hexAudio.stop('processing');
    const hexText = result.text || '…';
    addHexMessage(hexText);
    addLog('HEX', `→ ${String(hexText).substring(0, 100)}${hexText.length > 100 ? '…' : ''}`);

    // ── Phase 4: Interceptor postlog ────────────────────────────
    // Log the completed AI response (fire-and-forget, non-blocking).
    if (window.hexInterceptor && _interceptorMeta.traceId) {
      window.hexInterceptor.postlog(
        _interceptorMeta.traceId, _hexSessionId,
        config.llm?.provider === 'none' ? 'sandbox' : 'normal',
        text, hexText, _interceptorMeta.allowedTools
      ).catch(() => {}); // never block UX on logging failure
    }

    // ── Phase 4: Link traceId to memory turn ────────────────────
    // Enables "why did HEX do that?" debugging via /trace/:id
    if (window.hexMemory && _interceptorMeta.traceId) {
      const lastTurn = window.hexMemory.history?.[window.hexMemory.history.length - 1];
      if (lastTurn) lastTurn._interceptorTraceId = _interceptorMeta.traceId;
    }
// ══════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════
// CHANGE 3 of 3
// Gate actions through the interceptor before executing them.
// This replaces the two handleAIAction call sites (parallel + sequential).
//
// ── FIND (parallel batch map) ─────────────────────────────────
      const promises = parallelBatch.map(async (action) => {
        window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);\n        const start = Date.now();
        const rawResult = await handleAIAction(action);

// ── REPLACE WITH ──────────────────────────────────────────────
      const promises = parallelBatch.map(async (action) => {
        // ── Phase 4: Gate tool through interceptor policy ──────
        if (window.hexInterceptor && !window.hexInterceptor.allowAction(action.type, _hexSessionId)) {
          addLog('INTERCEPTOR', `Blocked action: ${action.type}`);
          return null;
        }
        window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
        const start = Date.now();
        const rawResult = await handleAIAction(action);
// ══════════════════════════════════════════════════════════════


// ── FIND (sequential queue loop) ──────────────────────────────
    for (const action of sequentialQueue) {
      window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
      const actionResult = await handleAIAction(action);

// ── REPLACE WITH ──────────────────────────────────────────────
    for (const action of sequentialQueue) {
      // ── Phase 4: Gate tool through interceptor policy ────────
      if (window.hexInterceptor && !window.hexInterceptor.allowAction(action.type, _hexSessionId)) {
        addLog('INTERCEPTOR', `Blocked sequential action: ${action.type}`);
        continue;
      }
      window.hexTaskBus?.push(`Executing: ${action.type} ${(action.args || []).join(' ')}`);
      const actionResult = await handleAIAction(action);
// ══════════════════════════════════════════════════════════════
