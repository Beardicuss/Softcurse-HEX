'use strict';
// ── main/live-keys.js ─────────────────────────────────────────────────────────
// Parses leaked-api-keys.json, exposes keys via IPC, and hot-reloads on change.

const fs   = require('fs');
const path = require('path');

// Map provider display names → the lowercase ids used in ai.js
const PROVIDER_NORM = {
  'anthropic': 'anthropic', 'Anthropic': 'anthropic',
  'openai':    'openai',    'OpenAI':    'openai',
  'mistral':   'mistral',   'Mistral':   'mistral',
  'together':  'together',  'Together AI': 'together',
  'grok':      'grok',      'xAI / Grok': 'grok',  'xAI': 'grok',
  'gemini':    'gemini',    'Google Gemini': 'gemini',
  'cohere':    'cohere',    'Cohere':    'cohere',
  'hf':        'hf',        'Hugging Face': 'hf',  'HuggingFace': 'hf',
  'replicate': 'replicate', 'Replicate': 'replicate',
};

module.exports = function registerLiveKeys({ ipcMain, app, safeSend, sendLog }) {
  const LEAKED_KEYS_PATH     = path.join(app.getPath('userData'), 'leaked-api-keys.json');
  const DEFAULT_KEYS_BUNDLED = path.join(__dirname, '..', 'ai', 'leaked-api-keys.json');

  let _liveApiKeys = {};

  function parseLeakedKeys() {
    try {
      // On first run seed from bundled empty file
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
            PROVIDER_NORM[k.provider] ||
            PROVIDER_NORM[commit.provider] ||
            (commit.provider || '').toLowerCase().replace(/\s+/g, '');
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

  // Initial load
  _liveApiKeys = parseLeakedKeys();

  // IPC handler
  ipcMain.handle('ai:get-live-keys', () => ({ success: true, keys: _liveApiKeys }));

  // File watcher — hot reload when hunter writes new keys
  let _debounce = null;
  try {
    if (fs.existsSync(path.dirname(LEAKED_KEYS_PATH))) {
      fs.watch(LEAKED_KEYS_PATH, { persistent: false }, () => {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(() => {
          _liveApiKeys = parseLeakedKeys();
          safeSend('ai:live-keys-updated', _liveApiKeys);
          console.log(
            'Softcurse: Live AI keys reloaded —',
            Object.keys(_liveApiKeys).map(p => `${p}:${_liveApiKeys[p].length}`).join(', ')
          );
        }, 500);
      });
    }
  } catch (e) {
    console.warn('Softcurse: Could not watch leaked-api-keys.json', e.message);
  }
};
