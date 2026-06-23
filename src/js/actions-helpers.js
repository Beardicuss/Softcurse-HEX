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

  function browserMemoryItems(candidates, browserStatus, context = '') {
    return (Array.isArray(candidates) ? candidates : []).map((item) => ({
      kind: item.kind || 'browser',
      label: item.label || item.text || '',
      value: item.text || item.label || '',
      path: item.url || browserStatus?.url || null,
      meta: {
        source: 'browser-candidate',
        browserUrl: browserStatus?.url || null,
        browserTitle: browserStatus?.title || null,
        candidateKind: item.kind || 'browser',
        context,
        index: item.index || null
      }
    }));
  }

  function noteBrowserOutcome(item, success, detail = '') {
    if (!item) return null;
    return window.hexPcEntityMemory?.noteActionOutcome?.({
      kind: item.kind || 'browser',
      label: item.label || item.text || item.value || '',
      value: item.text || item.value || item.label || '',
      path: item.url || item.path || null,
      meta: item.meta || {}
    }, item.kind || 'browser', success, detail);
  }

  function noteDesktopOutcome(item, kindHint = 'item', success = true, detail = '') {
    if (!item) return null;
    const normalized = {
      kind: item.kind || kindHint,
      label: item.label || item.text || item.value || item.path || '',
      value: item.value || item.text || item.label || item.path || '',
      path: item.path || item.value || null,
      meta: item.meta || {}
    };
    if (!normalized.label) return null;
    window.hexCandidatePublishers?.rememberRecent?.(normalized);
    if (window.hexContextState?.state) {
      window.hexContextState.state.lastResolvedReference = {
        ...normalized,
        surface: 'desktop',
        source: normalized.meta?.source || 'desktop-action'
      };
      window.hexContextState.persist?.();
    }
    return window.hexPcEntityMemory?.noteActionOutcome?.(normalized, normalized.kind || kindHint, success, detail);
  }

  async function refreshBrowserReferenceCandidates(context = '') {
    if (!window.hexAPI?.browser?.extractCandidates) return null;
    try {
      const result = await window.hexAPI.browser.extractCandidates();
      if (result?.success) {
        const browserStatus = {
          open: true,
          url: result.url || null,
          title: result.title || null
        };
        window.hexContextState?.updateBrowserCandidates?.(result.candidates || [], browserStatus);
        window.hexPcEntityMemory?.ingest?.(browserMemoryItems(result.candidates || [], browserStatus, context), 'browser', 1.25);
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
    browserMemoryItems,
    noteBrowserOutcome,
    noteDesktopOutcome,
    refreshBrowserReferenceCandidates
  };
})();
