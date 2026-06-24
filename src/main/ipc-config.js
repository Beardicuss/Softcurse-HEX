'use strict';
// Renderer configuration boundary. Secret values remain in the main process.

module.exports = function registerConfigIPC({
  ipcMain, getConfig, setConfig, saveConfig, applySystemSettings, localVoice,
}) {
  ipcMain.handle('config:get', () => redactConfig(getConfig()));

  ipcMain.handle('config:set', (_, newCfg = {}) => {
    const current = getConfig();
    const merged = mergeConfigPreservingSecrets(current, newCfg);
    setConfig(merged);
    saveConfig(merged);
    applySystemSettings();
    if (localVoice && newCfg.voice?.modelsDir) localVoice.setModelsDir(newCfg.voice.modelsDir);
    return redactConfig(merged);
  });
};

function redactConfig(config) {
  const safe = structuredClone(config || {});
  safe.llm = safe.llm || {};
  safe.llm.hasApiKey = !!safe.llm.apiKey;
  safe.llm.hasVisionApiKey = !!(safe.llm.visionApiKey || safe.llm.geminiVisionKey);
  safe.llm.apiKey = '';
  safe.llm.apiKeys = {};
  safe.llm.manualApiKeys = {};
  safe.llm.visionApiKey = '';
  safe.llm.geminiVisionKey = '';
  safe.voice = safe.voice || {};
  safe.voice.hasGcloudTtsKey = !!safe.voice.gcloudTtsKey;
  safe.voice.gcloudTtsKey = '';
  safe.cloud = safe.cloud || {};
  safe.cloud.hasAccessToken = !!safe.cloud.accessToken;
  safe.cloud.accessToken = '';
  return safe;
}

function mergeConfigPreservingSecrets(current, incoming) {
  const merged = {
    ...current, ...incoming,
    llm: { ...(current.llm || {}), ...(incoming.llm || {}) },
    voice: { ...(current.voice || {}), ...(incoming.voice || {}) },
    cloud: { ...(current.cloud || {}), ...(incoming.cloud || {}) },
    browser: { ...(current.browser || {}), ...(incoming.browser || {}) },
    monitoring: { ...(current.monitoring || {}), ...(incoming.monitoring || {}) },
    system: { ...(current.system || {}), ...(incoming.system || {}) }
  };
  const nextLlm = incoming.llm || {};
  if (!incoming.voice?.gcloudTtsKey) merged.voice.gcloudTtsKey = current.voice?.gcloudTtsKey || '';
  if (!incoming.cloud?.accessToken || incoming.cloud?.hasAccessToken === true) merged.cloud.accessToken = current.cloud?.accessToken || '';
  if (!nextLlm.apiKey) merged.llm.apiKey = current.llm?.apiKey || '';
  if (!hasValues(nextLlm.apiKeys)) merged.llm.apiKeys = current.llm?.apiKeys || {};
  if (!hasValues(nextLlm.manualApiKeys)) merged.llm.manualApiKeys = current.llm?.manualApiKeys || {};
  if (!nextLlm.visionApiKey && !nextLlm.geminiVisionKey) {
    merged.llm.visionApiKey = current.llm?.visionApiKey || current.llm?.geminiVisionKey || '';
    merged.llm.geminiVisionKey = current.llm?.geminiVisionKey || current.llm?.visionApiKey || '';
  }
  return merged;
}

function hasValues(value) {
  return value && typeof value === 'object' && Object.values(value).some((entry) => (
    Array.isArray(entry) ? entry.length > 0 : !!entry
  ));
}

module.exports._private = { redactConfig, mergeConfigPreservingSecrets };
