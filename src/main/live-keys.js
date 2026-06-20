'use strict';
// ── main/live-keys.js ─────────────────────────────────────────────────────────
// Maintains the active provider key pool for HEX.
// Sources:
// 1. User-added manual API keys stored in config
// 2. Cloud hunter keys via hex-server when cloud continuity is enabled
// Legacy local leaked-api-keys.json support is retained but disabled from live routing.

const fs = require('fs');
const path = require('path');

const LOCAL_LEAK_POOL_ENABLED = false;
const SUPPORTED_LLM_PROVIDERS = new Set([
  'anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini',
  'cohere', 'hf', 'replicate', 'openrouter', 'groq'
]);

const PROVIDER_NORM = {
  'anthropic': 'anthropic', 'Anthropic': 'anthropic',
  'openai': 'openai', 'OpenAI': 'openai',
  'mistral': 'mistral', 'Mistral': 'mistral',
  'together': 'together', 'Together AI': 'together',
  'grok': 'grok', 'xAI / Grok': 'grok', 'xAI': 'grok', 'Grok': 'grok',
  'gemini': 'gemini', 'Google Gemini': 'gemini', 'GOOGLE GEMINI': 'gemini',
  'cohere': 'cohere', 'Cohere': 'cohere',
  'hf': 'hf', 'Hugging Face': 'hf', 'HuggingFace': 'hf',
  'replicate': 'replicate', 'Replicate': 'replicate',
  'openrouter': 'openrouter', 'OpenRouter': 'openrouter',
  'groq': 'groq', 'Groq': 'groq'
};

const MANUAL_PROVIDER_PATTERNS = [
  { provider: 'anthropic', test: (key) => /^sk-ant-/i.test(key) },
  { provider: 'openrouter', test: (key) => /^sk-or-v1-/i.test(key) },
  { provider: 'openai', test: (key) => /^sk-(proj-)?[a-z0-9]/i.test(key) },
  { provider: 'gemini', test: (key) => /^AIza[a-zA-Z0-9\-_]{20,}$/.test(key) },
  { provider: 'grok', test: (key) => /^(gsk_|xai-)/i.test(key) },
  { provider: 'groq', test: (key) => /^gsk_/i.test(key) },
  { provider: 'hf', test: (key) => /^hf_/i.test(key) },
  { provider: 'replicate', test: (key) => /^r8_/i.test(key) },
  { provider: 'mistral', test: (key) => /^[A-Za-z0-9]{32,}$/.test(key) },
  { provider: 'cohere', test: (key) => /^[A-Za-z0-9]{36,}$/.test(key) },
];

module.exports = function registerLiveKeys({ ipcMain, app, safeSend, sendLog, getConfig, setConfig, saveConfig }) {
  const LEAKED_KEYS_PATH = path.join(app.getPath('userData'), 'leaked-api-keys.json');
  const DEFAULT_KEYS_BUNDLED = path.join(__dirname, '..', 'ai', 'leaked-api-keys.json');
  const CLOUD_REFRESH_MS = 5 * 60 * 1000;

  let _localApiKeys = {};
  let _manualApiKeys = {};
  let _cloudApiKeys = {};
  let _liveApiKeys = {};
  let _cloudRefreshTimer = null;
  let _cloudRefreshInFlight = false;

  function normalizeProviderId(provider) {
    return PROVIDER_NORM[provider] || String(provider || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function isSupportedProvider(provider) {
    return SUPPORTED_LLM_PROVIDERS.has(normalizeProviderId(provider));
  }

  function filterSupportedPool(pool) {
    const filtered = {};
    for (const [provider, keys] of Object.entries(pool || {})) {
      const provId = normalizeProviderId(provider);
      if (!isSupportedProvider(provId)) continue;
      const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
      if (list.length > 0) filtered[provId] = [...new Set(list)];
    }
    return filtered;
  }

  function mergePools(...pools) {
    const merged = {};
    for (const source of pools) {
      for (const [provider, keys] of Object.entries(filterSupportedPool(source))) {
        if (!merged[provider]) merged[provider] = [];
        for (const key of keys) {
          if (!merged[provider].includes(key)) merged[provider].push(key);
        }
      }
    }
    return merged;
  }

  function getManualPoolFromConfig() {
    const cfg = getConfig?.() || {};
    return filterSupportedPool(cfg.llm?.manualApiKeys || {});
  }

  function applyMergedPool(reason = 'refresh') {
    _liveApiKeys = mergePools(
      _cloudApiKeys,
      _manualApiKeys,
      LOCAL_LEAK_POOL_ENABLED ? _localApiKeys : {}
    );
    safeSend('ai:live-keys-updated', _liveApiKeys);
    const summary = Object.keys(_liveApiKeys).map((p) => `${p}:${_liveApiKeys[p].length}`).join(', ') || 'empty';
    console.log(`Softcurse: Live AI keys ${reason} — ${summary}`);
  }

  function parseLeakedKeys() {
    if (!LOCAL_LEAK_POOL_ENABLED) return {};
    try {
      if (!fs.existsSync(LEAKED_KEYS_PATH) && fs.existsSync(DEFAULT_KEYS_BUNDLED)) {
        fs.copyFileSync(DEFAULT_KEYS_BUNDLED, LEAKED_KEYS_PATH);
      }
      if (!fs.existsSync(LEAKED_KEYS_PATH)) return {};

      const data = JSON.parse(fs.readFileSync(LEAKED_KEYS_PATH, 'utf8'));
      const pool = {};
      if (!data.commits || !Array.isArray(data.commits)) return {};

      for (const commit of data.commits) {
        if (!commit.leaked_keys) continue;
        for (const k of commit.leaked_keys) {
          if (!k.value_full) continue;
          const provId = normalizeProviderId(k.provider) || normalizeProviderId(commit.provider);
          if (!isSupportedProvider(provId)) continue;
          if (!pool[provId]) pool[provId] = [];
          if (!pool[provId].includes(k.value_full)) pool[provId].push(k.value_full);
        }
      }
      return pool;
    } catch (err) {
      console.warn('Softcurse: Failed to parse leaked-api-keys.json', err.message);
      return {};
    }
  }

  function detectProviderFromKey(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return null;
    for (const matcher of MANUAL_PROVIDER_PATTERNS) {
      if (matcher.test(key)) return matcher.provider;
    }
    return null;
  }

  function getCloudConfig() {
    return getConfig?.()?.cloud || {};
  }

  function isCloudEnabled() {
    const cloud = getCloudConfig();
    return !!(cloud.enabled && cloud.serverUrl && cloud.accessToken);
  }

  function buildCloudHeaders() {
    const token = String(getCloudConfig().accessToken || '').trim();
    return {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'x-hex-token': token
    };
  }

  function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  async function refreshCloudKeys(force = false) {
    if (_cloudRefreshInFlight && !force) return;
    if (!isCloudEnabled()) {
      if (Object.keys(_cloudApiKeys).length > 0) {
        _cloudApiKeys = {};
        applyMergedPool('cloud-disabled');
      }
      return;
    }

    _cloudRefreshInFlight = true;
    try {
      const baseUrl = normalizeBaseUrl(getCloudConfig().serverUrl);
      const response = await fetch(baseUrl + '/api/hunter/valid-keys', {
        method: 'GET',
        headers: buildCloudHeaders()
      });
      let payload = {};
      try {
        payload = await response.json();
      } catch (_) {}

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      _cloudApiKeys = filterSupportedPool(payload.keys || {});
      applyMergedPool('cloud-sync');
    } catch (error) {
      sendLog?.('CLOUD', `Hunter key sync failed: ${error.message}`, 'warn');
    } finally {
      _cloudRefreshInFlight = false;
    }
  }

  function scheduleCloudRefresh() {
    if (_cloudRefreshTimer) clearInterval(_cloudRefreshTimer);
    _cloudRefreshTimer = setInterval(() => {
      refreshCloudKeys(false).catch(() => {});
    }, CLOUD_REFRESH_MS);
  }

  function saveManualPool(pool) {
    const cfg = getConfig?.() || {};
    cfg.llm = cfg.llm || {};
    cfg.llm.manualApiKeys = filterSupportedPool(pool);
    setConfig?.(cfg);
    saveConfig?.(cfg);
  }

  _localApiKeys = parseLeakedKeys();
  _manualApiKeys = getManualPoolFromConfig();
  applyMergedPool('local-load');
  scheduleCloudRefresh();
  refreshCloudKeys(false).catch(() => {});

  ipcMain.handle('ai:get-live-keys', async () => {
    _manualApiKeys = getManualPoolFromConfig();
    await refreshCloudKeys(false);
    return { success: true, keys: _liveApiKeys, manualKeys: _manualApiKeys };
  });

  ipcMain.handle('ai:refresh-live-keys', async () => {
    _manualApiKeys = getManualPoolFromConfig();
    await refreshCloudKeys(true);
    return { success: true, keys: _liveApiKeys, manualKeys: _manualApiKeys };
  });

  ipcMain.handle('ai:add-manual-api-key', async (_, payload = {}) => {
    const apiKey = String(payload.apiKey || '').trim();
    const requestedProvider = normalizeProviderId(payload.provider || '');
    const detectedProvider = requestedProvider || detectProviderFromKey(apiKey);
    if (!apiKey) return { success: false, error: 'Missing API key.' };
    if (!detectedProvider || !isSupportedProvider(detectedProvider)) {
      return { success: false, error: 'Could not recognize a supported AI provider from this key.' };
    }

    const pool = getManualPoolFromConfig();
    pool[detectedProvider] = Array.isArray(pool[detectedProvider]) ? pool[detectedProvider] : [];
    if (!pool[detectedProvider].includes(apiKey)) pool[detectedProvider].unshift(apiKey);
    saveManualPool(pool);
    _manualApiKeys = pool;
    applyMergedPool('manual-add');
    await refreshCloudKeys(false);
    return { success: true, provider: detectedProvider, keys: _liveApiKeys, manualKeys: _manualApiKeys };
  });

  ipcMain.handle('ai:remove-manual-api-key', async (_, payload = {}) => {
    const provider = normalizeProviderId(payload.provider || '');
    const apiKey = String(payload.apiKey || '').trim();
    if (!provider || !apiKey) return { success: false, error: 'Missing provider or API key.' };

    const pool = getManualPoolFromConfig();
    pool[provider] = Array.isArray(pool[provider]) ? pool[provider].filter((value) => value !== apiKey) : [];
    if (pool[provider].length === 0) delete pool[provider];
    saveManualPool(pool);
    _manualApiKeys = pool;
    applyMergedPool('manual-remove');
    await refreshCloudKeys(false);
    return { success: true, keys: _liveApiKeys, manualKeys: _manualApiKeys };
  });

  let _debounce = null;
  try {
    if (LOCAL_LEAK_POOL_ENABLED && fs.existsSync(path.dirname(LEAKED_KEYS_PATH))) {
      fs.watch(LEAKED_KEYS_PATH, { persistent: false }, () => {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(() => {
          _localApiKeys = parseLeakedKeys();
          _manualApiKeys = getManualPoolFromConfig();
          applyMergedPool('local-reload');
          refreshCloudKeys(false).catch(() => {});
        }, 500);
      });
    }
  } catch (e) {
    console.warn('Softcurse: Could not watch leaked-api-keys.json', e.message);
  }
};
