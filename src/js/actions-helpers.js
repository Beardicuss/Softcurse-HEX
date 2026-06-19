'use strict';

window.hexActionHelpers = (() => {
  async function captureWebVision(context = '') {
    if (!window.hexAPI?.browser?.screenshot) return null;
    try {
      const snap = await window.hexAPI.browser.screenshot();
      if (!snap.success || !snap.image) return null;
      window._webVisionData = snap.image;
      window._webVisionMeta = {
        url: snap.url || null,
        title: snap.title || null,
        capturedAt: Date.now(),
        context
      };
      addLog('VISION', `Browser screenshot captured: ${snap.title || snap.url}`);
      return `[BROWSER VISION — screenshot captured of: ${snap.title || snap.url}${context ? ' | ' + context : ''}. Analyze the screenshot to see what is on the page. Use visible text/labels for clicks instead of CSS selectors.]`;
    } catch (e) {
      addLog('VISION', `Screenshot failed: ${e.message}`);
      return null;
    }
  }

  function autoEnableWebVision() {
    if (window.visionEnabled) return;
    if (window.hexAPI?.browser?.screenshot || window.hexAPI?.captureScreenBase64) {
      window.visionEnabled = true;
      const btn = document.getElementById('vision-btn');
      if (btn) {
        btn.style.filter = 'drop-shadow(0 0 6px var(--cyan))';
        btn.style.color = 'var(--cyan)';
      }
      addLog('VISION', 'Auto-enabled vision for web interaction.');
    }
  }

  async function refreshBrowserReferenceCandidates(context = '') {
    if (!window.hexAPI?.browser?.extractCandidates) return null;
    try {
      const result = await window.hexAPI.browser.extractCandidates();
      if (result?.success) {
        window.hexContextState?.updateBrowserCandidates?.(result.candidates || [], {
          open: true,
          url: result.url || null,
          title: result.title || null
        });
        addLog('WEB', `Captured ${result.count || 0} browser candidates${context ? ' (' + context + ')' : ''}`);
        return result;
      }
    } catch (e) {
      addLog('WEB', `Candidate extraction failed: ${e.message}`, 'warn');
    }
    return null;
  }

  return {
    captureWebVision,
    autoEnableWebVision,
    refreshBrowserReferenceCandidates
  };
})();
