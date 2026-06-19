'use strict';
// ── main/live-keys.js ─────────────────────────────────────────────────────────
// Maintains the active provider key pool for HEX.
// Sources:
// 1. Local leaked-api-keys.json written by the bundled hunter
// 2. Cloud hunter keys via hex-server when cloud continuity is enabled

const fs = require('fs');
const path = require('path');

const PROVIDER_NORM = {
  'anthropic': 'anthropic', 'Anthropic': 'anthropic',
  'openai': 'openai', 'OpenAI': 'openai',
  'mistral': 'mistral', 'Mistral': 'mistral',
  'together': 'together', 'Together AI': 'together',
  'grok': 'grok', 'xAI / Grok': 'grok', 'xAI': 'grok',
  'gemini': 'gemini', 'Google Gemini': 'gemini',
  'cohere': 'cohere', 'Cohere': 'cohere',
  'hf': 'hf', 'Hugging Face': 'hf', 'HuggingFace': 'hf',
  'replicate': 'replicate', 'Replicate': 'replicate',
  'openrouter': 'openrouter', 'OpenRouter': 'openrouter',
  'groq': 'groq', 'Groq': 'groq'
};

module.exports = function registerLiveKeys({ ipcMain, app, safeSend, sendLog, getConfig }) {
  const LEAKED_KEYS_PATH = path.join(app.getPath('userData'), 'leaked-api-keys.json');
  const DEFAULT_KEYS_BUNDLED = path.join(__dirname, '..', 'ai', 'leaked-api-keys.json');
  const CLOUD_REFRESH_MS = 5 * 60 * 1000;

  let _localApiKeys = {};
  let _cloudApiKeys = {};
  let _liveApiKeys = {};
  let _cloudRefreshTimer = null;
  let _cloudRefreshInFlight = false;

  function normalizeProviderId(provider) {
    return PROVIDER_NORM[provider] || String(provider || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function mergePools(primaryPool, secondaryPool) {
    const merged = {};
    for (const source of [secondaryPool || {}, primaryPool || {}]) {
      for (const [provider, keys] of Object.entries(source)) {
        const provId = normalizeProviderId(provider);
        if (!provId) continue;
        if (!merged[provId]) merged[provId] = [];
        for (const key of Array.isArray(keys) ? keys : []) {
          if (key && !merged[provId].includes(key)) merged[provId].push(key);
        }
      }
    }
    return merged;
  }

  function applyMergedPool(reason = 'refresh') {
    _liveApiKeys = mergePools(_cloudApiKeys, _localApiKeys);
    safeSend('ai:live-keys-updated', _liveApiKeys);
    const summary = Object.keys(_liveApiKeys).map((p) => `${p}:${_liveApiKeys[p].length}`).join(', ') || 'empty';
    console.log(`Softcurse: Live AI keys ${reason} — ${summary}`);
  }

  function parseLeakedKeys() {
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
          const provId =
            normalizeProviderId(k.provider) ||
            normalizeProviderId(commit.provider);
          if (!provId) continue;
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
      'accept': 'application/json',
      'authorization': `Bearer ${token}`,
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

      _cloudApiKeys = mergePools(payload.keys || {}, {});
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

  _localApiKeys = parseLeakedKeys();
  applyMergedPool('local-load');
  scheduleCloudRefresh();
  refreshCloudKeys(false).catch(() => {});

  ipcMain.handle('ai:get-live-keys', async () => {
    await refreshCloudKeys(false);
    return { success: true, keys: _liveApiKeys };
  });

  ipcMain.handle('ai:refresh-live-keys', async () => {
    await refreshCloudKeys(true);
    return { success: true, keys: _liveApiKeys };
  });

  let _debounce = null;
  try {
    if (fs.existsSync(path.dirname(LEAKED_KEYS_PATH))) {
      fs.watch(LEAKED_KEYS_PATH, { persistent: false }, () => {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(() => {
          _localApiKeys = parseLeakedKeys();
          applyMergedPool('local-reload');
          refreshCloudKeys(false).catch(() => {});
        }, 500);
      });
    }
  } catch (e) {
    console.warn('Softcurse: Could not watch leaked-api-keys.json', e.message);
  }
};
