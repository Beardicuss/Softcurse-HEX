// ============================================================
// PATCH: Softcurse-HEX-main/src/index.html
// Phase 4 — Add interceptor client script tag
//
// HOW TO APPLY:
//   Find the line that loads ai.js and add ONE line after it.
// ============================================================

// ── FIND ──────────────────────────────────────────────────────
  <script src="js/ai.js"></script>

// ── REPLACE WITH ──────────────────────────────────────────────
  <script src="js/ai.js"></script>
  <script src="js/hex-interceptor-client.js"></script>

// ── WHY AFTER ai.js ───────────────────────────────────────────
// hex-interceptor-client.js only depends on window (fetch, crypto).
// It must load before actions.js and renderer.js, which use
// window.hexInterceptor. Loading it right after ai.js guarantees
// correct load order with zero risk of undefined references.
