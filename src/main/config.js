'use strict';
// ── main/config.js ────────────────────────────────────────────────────────────
// Config persistence and safeStorage encryption.
// Exports pure functions; IPC wiring happens in ipc-config.js.

const fs   = require('fs');
const path = require('path');

const ENC_PREFIX = 'enc::';

// ---------------------------------------------------------------------------
// Encryption helpers (Electron safeStorage → OS credential store)
// ---------------------------------------------------------------------------
function encryptKey(safeStorage, plaintext) {
  if (!plaintext || plaintext.startsWith(ENC_PREFIX)) return plaintext;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(plaintext);
      return ENC_PREFIX + buf.toString('base64');
    }
  } catch (_) {}
  return plaintext; // fallback: store plaintext if encryption unavailable
}

function decryptKey(safeStorage, stored) {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch (_) {}
  return ''; // corrupted → return empty
}

function encryptApiKeys(safeStorage, cfg) {
  const c = JSON.parse(JSON.stringify(cfg)); // deep clone
  if (c.llm?.apiKey) c.llm.apiKey = encryptKey(safeStorage, c.llm.apiKey);
  if (c.llm?.apiKeys) {
    for (const [k, v] of Object.entries(c.llm.apiKeys)) {
      c.llm.apiKeys[k] = encryptKey(safeStorage, v);
    }
  }
  if (c.llm?.manualApiKeys) {
    for (const [k, values] of Object.entries(c.llm.manualApiKeys)) {
      c.llm.manualApiKeys[k] = Array.isArray(values)
        ? values.map((value) => encryptKey(safeStorage, value))
        : [];
    }
  }
  if (c.llm?.geminiVisionKey) c.llm.geminiVisionKey = encryptKey(safeStorage, c.llm.geminiVisionKey);
  if (c.voice?.gcloudTtsKey) c.voice.gcloudTtsKey = encryptKey(safeStorage, c.voice.gcloudTtsKey);
  if (c.cloud?.accessToken) c.cloud.accessToken = encryptKey(safeStorage, c.cloud.accessToken);
  return c;
}

function decryptApiKeys(safeStorage, cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  if (c.llm?.apiKey) c.llm.apiKey = decryptKey(safeStorage, c.llm.apiKey);
  if (c.llm?.apiKeys) {
    for (const [k, v] of Object.entries(c.llm.apiKeys)) {
      c.llm.apiKeys[k] = decryptKey(safeStorage, v);
    }
  }
  if (c.llm?.manualApiKeys) {
    for (const [k, values] of Object.entries(c.llm.manualApiKeys)) {
      c.llm.manualApiKeys[k] = Array.isArray(values)
        ? values.map((value) => decryptKey(safeStorage, value)).filter(Boolean)
        : [];
    }
  }
  if (c.llm?.geminiVisionKey) c.llm.geminiVisionKey = decryptKey(safeStorage, c.llm.geminiVisionKey);
  if (c.voice?.gcloudTtsKey) c.voice.gcloudTtsKey = decryptKey(safeStorage, c.voice.gcloudTtsKey);
  if (c.cloud?.accessToken) c.cloud.accessToken = decryptKey(safeStorage, c.cloud.accessToken);
  return c;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------
function defaultConfig() {
  return {
    language: 'ka',
    userName: 'Operator',
    onboarding: {
      completed: false,
      age: '',
      country: '',
      region: '',
      city: '',
      bio: '',
      interests: '',
      occupation: ''
    },
    llm: { provider: 'ollama', model: 'qwen2.5:7b', apiKey: '', baseUrl: 'http://localhost:11434', manualApiKeys: {} },
    voice: { enabled: true, wakeWord: 'hey hex', volume: 0.9, rate: 0.95, pitch: 0.85, voiceName: '' },
    monitoring: { breaks: true, breakIntervalMin: 90, idleThresholdMin: 5, proactiveAdvice: true },
    ui: { theme: 'cyber', notifications: true },
    cloud: { enabled: false, serverUrl: '', accessToken: '', profileId: '', sessionId: '', deviceId: '' },
  };
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------
function loadConfig(safeStorage, app, configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      let hasConfigChange = false;

      // Auto-migrate old AppData voice models path to the local-voice default
      if (raw.voice && raw.voice.modelsDir && raw.voice.modelsDir.includes('AppData')) {
        raw.voice.modelsDir = path.join(app.getAppPath(), 'local-voice', 'models');
        hasConfigChange = true;
      }

      const hasPlainKeys =
        (raw.llm?.apiKey && !raw.llm.apiKey.startsWith(ENC_PREFIX)) ||
        (raw.llm?.apiKeys && Object.values(raw.llm.apiKeys).some(v => v && !v.startsWith(ENC_PREFIX))) ||
        (raw.llm?.manualApiKeys && Object.values(raw.llm.manualApiKeys).some(values => Array.isArray(values) && values.some(v => v && !v.startsWith(ENC_PREFIX)))) ||
        (raw.cloud?.accessToken && !raw.cloud.accessToken.startsWith(ENC_PREFIX));

      if ((hasPlainKeys && safeStorage.isEncryptionAvailable()) || hasConfigChange) {
        fs.writeFileSync(configPath, JSON.stringify(encryptApiKeys(safeStorage, raw), null, 2));
      }
      return decryptApiKeys(safeStorage, raw);
    }
  } catch (_) {}
  return defaultConfig();
}

function saveConfig(safeStorage, cfg, configPath) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(encryptApiKeys(safeStorage, cfg), null, 2));
  } catch (e) {
    console.error('saveConfig failed:', e);
  }
}

module.exports = { loadConfig, saveConfig, encryptApiKeys, decryptApiKeys, ENC_PREFIX };
