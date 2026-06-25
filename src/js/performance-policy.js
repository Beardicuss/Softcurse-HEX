'use strict';

window.hexPerformancePolicy = (() => {
  const DESKTOP_INTENT = /\b(open|launch|start|run|close|kill|process|task|service|pid|window|focus|switch|app|program|software|game|file|folder|directory|document|desktop|downloads|documents|browser|tab|website|search|youtube|chrome|edge|steam)\b/i;
  const VISION_INTENT = /\b(see|look|watch|screen|screenshot|vision|visual|image|picture|photo|what is on|what's on|read this|browser page|current page|видишь|экран|скрин|картин|фото|страниц|ხედავ|ეკრან|სურათ|ფოტო|გვერდ)\b/i;

  function config() {
    return window._hexConfig || {};
  }

  function perf() {
    return config().performance || {};
  }

  function mode() {
    return String(perf().mode || 'lite').toLowerCase();
  }

  function isLite() {
    return mode() === 'lite';
  }

  function isBalanced() {
    return mode() === 'balanced';
  }

  function isDeepLocal() {
    return mode() === 'deep-local';
  }

  function isSystemUnderPressure(stats = window.sysStats || {}) {
    const cpu = Number(stats.cpu || 0);
    const ram = Number(stats.ram || 0);
    const disk = Number(stats.disk || 0);
    return cpu >= 85 || ram >= 88 || disk >= 96;
  }

  function allowLocalModelAutostart() {
    const p = perf();
    return isDeepLocal() && p.localModelAutostart === true && !isSystemUnderPressure();
  }

  function allowAutoVoice() {
    const p = perf();
    if (p.continuousVoice !== true) return false;
    return !isLite() && !isSystemUnderPressure();
  }

  function allowLocalTts() {
    const p = perf();
    return !isLite() && p.localTts !== false && !isSystemUnderPressure();
  }

  function awarenessMultiplier() {
    if (isLite()) return 4;
    if (isBalanced()) return 2;
    return 1;
  }

  function allowStartupInventoryScan() {
    const p = perf();
    return !isLite() && p.awareness !== 'off' && !isSystemUnderPressure();
  }

  function needsDesktopContext(text = '') {
    return DESKTOP_INTENT.test(String(text || ''));
  }

  function needsVisionContext(text = '') {
    return VISION_INTENT.test(String(text || ''));
  }

  function allowVisionCapture(text = '', context = {}) {
    if (isSystemUnderPressure()) return false;
    if (!isLite()) return true;
    if (context?.explicit === true) return true;
    return needsVisionContext(text);
  }

  function allowDecorativeEffects(context = {}) {
    if (isSystemUnderPressure(context.stats)) return false;
    if (context.voiceSurface === true || window.isVoiceAgiActive?.() === true) return false;
    return !isLite();
  }

  function allowHiddenPanelRefresh(context = {}) {
    if (isSystemUnderPressure(context.stats)) return false;
    if (context.voiceSurface === true || window.isVoiceAgiActive?.() === true) return false;
    return true;
  }

  function uiRefreshIntervalMs(context = {}) {
    if (!allowHiddenPanelRefresh(context)) return 60000;
    if (isSystemUnderPressure(context.stats)) return 45000;
    if (isLite()) return 30000;
    if (isBalanced()) return 18000;
    return 10000;
  }

  function allowTelemetryUiChatter(context = {}) {
    if (context.voiceSurface === true || window.isVoiceAgiActive?.() === true) return false;
    return !isLite() && !isSystemUnderPressure(context.stats);
  }

  return {
    mode,
    isLite,
    isBalanced,
    isDeepLocal,
    isSystemUnderPressure,
    allowLocalModelAutostart,
    allowAutoVoice,
    allowLocalTts,
    awarenessMultiplier,
    allowStartupInventoryScan,
    needsDesktopContext,
    needsVisionContext,
    allowVisionCapture,
    allowDecorativeEffects,
    allowHiddenPanelRefresh,
    uiRefreshIntervalMs,
    allowTelemetryUiChatter
  };
})();