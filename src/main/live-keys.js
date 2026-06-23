'use strict';
// ── main/live-keys.js ─────────────────────────────────────────────────────────
// Maintains the active provider key pool for HEX.
// Sources:
// 1. User-added manual API keys stored in config
// 2. Cloud hunter keys via hex-server when cloud continuity is enabled
// Legacy local leaked-api-keys.json support is retained but disabled from live routing.

const crypto = require('crypto');
const executeProvider = require('./provider-executor');

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

module.exports = function registerLiveKeys({ ipcMain, sendLog, getConfig, setConfig, saveConfig }) {
  const CLOUD_REFRESH_MS = 5 * 60 * 1000;

  let _manualApiKeys = {};
  let _cloudApiKeys = {};
  let _cloudCapabilities = null;
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

  function keyId(provider, apiKey) {
    return crypto.createHash('sha256').update(provider + ':' + apiKey).digest('hex').slice(0, 20);
  }

  function maskKey(apiKey) {
    const value = String(apiKey || '');
    if (value.length <= 10) return 'configured';
    return value.slice(0, 4) + '...' + value.slice(-4);
  }

  function getManualKeySnapshot(pool = _manualApiKeys) {
    return Object.fromEntries(Object.entries(pool || {}).map(([provider, keys]) => [
      provider,
      (keys || []).map((apiKey) => ({ id: keyId(provider, apiKey), masked: maskKey(apiKey) }))
    ]));
  }
  function getManualPoolFromConfig() {
    const cfg = getConfig?.() || {};
    return filterSupportedPool(cfg.llm?.manualApiKeys || {});
  }

  function applyMergedPool(reason = 'refresh') {
    _liveApiKeys = mergePools(_cloudApiKeys, _manualApiKeys);
    const summary = Object.keys(_liveApiKeys).map((p) => `${p}:${_liveApiKeys[p].length}`).join(', ') || 'empty';
    console.log(`Softcurse: Live AI keys ${reason} — ${summary}`);
  }

  function buildFallbackCapabilitiesFromKeys(keyPool = {}) {
    const providers = Object.entries(filterSupportedPool(keyPool)).map(([provider, keys]) => ({
      provider,
      label: provider.toUpperCase(),
      validKeys: keys.length,
      totalKeys: keys.length,
      status: keys.length > 0 ? 'ready' : 'empty',
      source: 'desktop-key-sync-fallback',
      score: keys.length,
      models: []
    }));
    providers.sort((a, b) => Number(b.validKeys || 0) - Number(a.validKeys || 0));
    return {
      schema: 'hex.hunter-capabilities.v1',
      source: 'desktop-key-sync-fallback',
      degraded: true,
      degradationReason: 'Server capability endpoint unavailable; built from /api/hunter/valid-keys.',
      activeProvider: providers.find((item) => item.status === 'ready')?.provider || null,
      providers,
      summary: {
        totalProviders: providers.length,
        readyProviders: providers.filter((item) => item.status === 'ready').length,
        cooldownProviders: 0,
        liveKeys: providers.reduce((sum, item) => sum + Number(item.validKeys || 0), 0)
      }
    };
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

  async function fetchCloudJson(pathname) {
    const response = await fetch(normalizeBaseUrl(getCloudConfig().serverUrl) + pathname, {
      method: 'GET',
      headers: buildCloudHeaders()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || ('HTTP ' + response.status));
    }
    return payload;
  }

  async function refreshCloudKeys(force = false) {
    if (_cloudRefreshInFlight && !force) return;
    if (!isCloudEnabled()) {
      _cloudApiKeys = {};
      _cloudCapabilities = null;
      applyMergedPool('cloud-disabled');
      return;
    }

    _cloudRefreshInFlight = true;
    try {
      const capabilityResult = await fetchCloudJson('/api/hunter/capabilities' + (force ? '?force=1' : ''));
      _cloudCapabilities = capabilityResult.capabilities || _cloudCapabilities;

      try {
        const keyResult = await fetchCloudJson('/api/hunter/valid-keys');
        _cloudApiKeys = filterSupportedPool(keyResult.keys || {});
      } catch (keyError) {
        sendLog?.('CLOUD', 'Hunter valid-key refresh failed; keeping last private execution pool: ' + keyError.message, 'warn');
      }

      applyMergedPool(_cloudCapabilities?.stale ? 'cloud-stale-capability-sync' : 'cloud-capability-sync');
      if (_cloudCapabilities?.degraded) {
        sendLog?.('CLOUD', 'Hunter capabilities degraded: ' + (_cloudCapabilities.degradationReason || _cloudCapabilities.source || 'unknown'), 'warn');
      }
    } catch (capabilityError) {
      sendLog?.('CLOUD', 'Hunter capability refresh failed: ' + capabilityError.message, 'warn');
      try {
        const keyResult = await fetchCloudJson('/api/hunter/valid-keys');
        _cloudApiKeys = filterSupportedPool(keyResult.keys || {});
        if (!_cloudCapabilities) _cloudCapabilities = buildFallbackCapabilitiesFromKeys(_cloudApiKeys);
        applyMergedPool('cloud-key-fallback');
      } catch (keyError) {
        sendLog?.('CLOUD', 'Hunter key sync failed: ' + keyError.message, 'warn');
      }
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

  _manualApiKeys = getManualPoolFromConfig();
  applyMergedPool('local-load');
  scheduleCloudRefresh();
  refreshCloudKeys(false).catch(() => {});

  ipcMain.handle('ai:get-provider-capabilities', async (_, payload = {}) => {
    _manualApiKeys = getManualPoolFromConfig();
    await refreshCloudKeys(payload.force === true);
    const pool = mergePools(_liveApiKeys);
    const config = getConfig?.() || {};
    const configuredProvider = normalizeProviderId(config.llm?.provider);
    if (configuredProvider && isSupportedProvider(configuredProvider) && config.llm?.apiKey) {
      pool[configuredProvider] = [...new Set([...(pool[configuredProvider] || []), String(config.llm.apiKey).trim()])];
    }
    if (config.llm?.visionApiKey) {
      pool.gemini = [...new Set([...(pool.gemini || []), String(config.llm.visionApiKey).trim()])];
    }

    const serverProviders = Array.isArray(_cloudCapabilities?.providers) ? _cloudCapabilities.providers : [];
    const byProvider = Object.fromEntries(serverProviders.map((item) => [normalizeProviderId(item.provider), { ...item }]));
    for (const [provider, keys] of Object.entries(pool)) {
      const current = byProvider[provider] || { provider, label: provider.toUpperCase(), score: 0, models: [] };
      const hasExecutionKeys = keys.length > 0;
      const currentStatus = current.status || 'unavailable';
      byProvider[provider] = {
        ...current,
        validKeys: Math.max(Number(current.validKeys || 0), keys.length),
        executionKeysAvailable: hasExecutionKeys,
        status: current.onCooldown
          ? 'cooldown'
          : (hasExecutionKeys && ['unavailable', 'invalid', 'degraded'].includes(currentStatus) ? 'ready' : currentStatus),
        source: current.provider ? (current.source || 'canonical-capability') : 'local-manual'
      };
    }
    const providers = Object.values(byProvider).sort((a, b) => {
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;
      return Number(b.score || 0) - Number(a.score || 0) || Number(b.validKeys || 0) - Number(a.validKeys || 0);
    });
    const capabilities = {
      ...(_cloudCapabilities || {}),
      schema: _cloudCapabilities?.schema || 'hex.hunter-capabilities.v1',
      source: _cloudCapabilities?.source || 'local-only',
      degraded: !_cloudCapabilities || _cloudCapabilities.degraded === true,
      activeProvider: providers.find((item) => item.status === 'ready')?.provider || null,
      providers,
      summary: {
        totalProviders: providers.length,
        readyProviders: providers.filter((item) => item.status === 'ready').length,
        cooldownProviders: providers.filter((item) => item.status === 'cooldown').length,
        liveKeys: providers.reduce((sum, item) => sum + Number(item.validKeys || 0), 0)
      }
    };
    return {
      success: true,
      capabilities,
      providers: Object.fromEntries(providers.map((item) => [item.provider, item])),
      manualKeys: getManualKeySnapshot()
    };
  });
  ipcMain.handle('ai:execute-provider', async (_, payload = {}) => {
    const provider = normalizeProviderId(payload.provider);
    if (!isSupportedProvider(provider)) {
      return { success: false, error: 'Unsupported remote provider: ' + provider };
    }
    _manualApiKeys = getManualPoolFromConfig();
    await refreshCloudKeys(false);
    const config = getConfig?.() || {};
    const configuredKeys = [];
    if (normalizeProviderId(config.llm?.provider) === provider && config.llm?.apiKey) {
      configuredKeys.push(String(config.llm.apiKey).trim());
    }
    if (provider === 'gemini' && config.llm?.visionApiKey) {
      configuredKeys.push(String(config.llm.visionApiKey).trim());
    }
    const keys = [...new Set([...(_liveApiKeys[provider] || []), ...configuredKeys].filter(Boolean))];
    if (!keys.length) return { success: false, error: 'No usable key for ' + provider };
    const errors = [];
    for (const apiKey of keys) {
      try {
        const text = await executeProvider({ ...payload, provider, apiKey });
        return { success: true, provider, text };
      } catch (error) {
        errors.push(String(error?.message || error).split(apiKey).join('[REDACTED]').slice(0, 500));
      }
    }
    return { success: false, provider, error: errors.at(-1) || ('All ' + provider + ' keys failed'), attempts: keys.length };
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
    return { success: true, provider: detectedProvider, providers: Object.fromEntries(Object.entries(_liveApiKeys).map(([provider, keys]) => [provider, { provider, validKeys: keys.length, status: keys.length ? 'ready' : 'unavailable' }])), manualKeys: getManualKeySnapshot() };
  });

  ipcMain.handle('ai:remove-manual-api-key', async (_, payload = {}) => {
    const provider = normalizeProviderId(payload.provider || '');
    const requestedId = String(payload.keyId || '').trim();
    if (!provider || !requestedId) return { success: false, error: 'Missing provider or key ID.' };

    const pool = getManualPoolFromConfig();
    pool[provider] = Array.isArray(pool[provider])
      ? pool[provider].filter((value) => keyId(provider, value) !== requestedId)
      : [];
    if (pool[provider].length === 0) delete pool[provider];
    saveManualPool(pool);
    _manualApiKeys = pool;
    applyMergedPool('manual-remove');
    await refreshCloudKeys(false);
    return { success: true, providers: Object.fromEntries(Object.entries(_liveApiKeys).map(([provider, keys]) => [provider, { provider, validKeys: keys.length, status: keys.length ? 'ready' : 'unavailable' }])), manualKeys: getManualKeySnapshot() };
  });

};


