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
    llm: { provider: 'llamacpp', model: 'Qwen3-8B-Q4_K_M', apiKey: '', baseUrl: 'http://127.0.0.1:8080', ggufPath: path.join(__dirname, '..', '..', 'models', 'qwen3', 'Qwen3-8B-Q4_K_M.gguf'), autoOllama: false, manualApiKeys: {} },
    voice: { enabled: true, wakeWord: 'hey hex', volume: 0.9, rate: 0.95, pitch: 0.85, voiceName: '' },
    performance: { mode: 'lite', localModelAutostart: false, continuousVoice: false, localTts: false, awareness: 'on-demand' },
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

      raw.llm = raw.llm || {};
      raw.performance = raw.performance || {};
      if (!raw.performance.mode) {
        raw.performance.mode = 'lite';
        hasConfigChange = true;
      }
      if (typeof raw.performance.localModelAutostart !== 'boolean') {
        raw.performance.localModelAutostart = false;
        hasConfigChange = true;
      }
      if (typeof raw.performance.continuousVoice !== 'boolean') {
        raw.performance.continuousVoice = false;
        hasConfigChange = true;
      }
      if (typeof raw.performance.localTts !== 'boolean') {
        raw.performance.localTts = false;
        hasConfigChange = true;
      }
      if (!raw.performance.awareness) {
        raw.performance.awareness = 'on-demand';
        hasConfigChange = true;
      }
      if (!raw.llm.ggufPath) {
        raw.llm.ggufPath = path.join(__dirname, '..', '..', 'models', 'qwen3', 'Qwen3-8B-Q4_K_M.gguf');
        hasConfigChange = true;
      }
      if (raw.llm.provider === 'llamacpp' && !raw.llm.baseUrl) {
        raw.llm.baseUrl = 'http://127.0.0.1:8080';
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
      const decrypted = decryptApiKeys(safeStorage, raw);
      if (!decrypted.cloud?.accessToken) {
        const vaultedCloudToken = readCloudTokenVault(configPath);
        if (vaultedCloudToken) {
          decrypted.cloud = decrypted.cloud || {};
          decrypted.cloud.accessToken = vaultedCloudToken;
        }
      }
      return decrypted;
    }
  } catch (_) {}
  return defaultConfig();
}

function saveConfig(safeStorage, cfg, configPath) {
  try {
    const next = preserveStoredSecrets(cfg, configPath);
    writeCloudTokenVault(cfg, configPath);
    fs.writeFileSync(configPath, JSON.stringify(encryptApiKeys(safeStorage, next), null, 2));
  } catch (e) {
    console.error('saveConfig failed:', e);
  }
}

function preserveStoredSecrets(cfg, configPath) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  let stored = null;
  try {
    if (fs.existsSync(configPath)) stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {
    stored = null;
  }
  if (!stored) return next;

  next.llm = next.llm || {};
  next.voice = next.voice || {};
  next.cloud = next.cloud || {};

  if (!next.cloud.accessToken && stored.cloud?.accessToken) next.cloud.accessToken = stored.cloud.accessToken;
  if (!next.voice.gcloudTtsKey && stored.voice?.gcloudTtsKey) next.voice.gcloudTtsKey = stored.voice.gcloudTtsKey;
  if (!next.llm.apiKey && stored.llm?.apiKey) next.llm.apiKey = stored.llm.apiKey;
  if (!hasSecretValues(next.llm.apiKeys) && hasSecretValues(stored.llm?.apiKeys)) next.llm.apiKeys = stored.llm.apiKeys;
  if (!hasSecretValues(next.llm.manualApiKeys) && hasSecretValues(stored.llm?.manualApiKeys)) next.llm.manualApiKeys = stored.llm.manualApiKeys;
  if (!next.llm.visionApiKey && stored.llm?.visionApiKey) next.llm.visionApiKey = stored.llm.visionApiKey;
  if (!next.llm.geminiVisionKey && stored.llm?.geminiVisionKey) next.llm.geminiVisionKey = stored.llm.geminiVisionKey;

  return next;
}

function hasSecretValues(value) {
  return value && typeof value === 'object' && Object.values(value).some((entry) => (
    Array.isArray(entry) ? entry.length > 0 : !!entry
  ));
}

function getCloudTokenVaultPath(configPath) {
  return path.join(path.dirname(configPath), 'cloud-token.vault.json');
}

function writeCloudTokenVault(cfg, configPath) {
  const token = String(cfg?.cloud?.accessToken || '').trim();
  if (!token || token.startsWith(ENC_PREFIX)) return;
  try {
    const payload = {
      version: 1,
      // Local fallback for Electron safeStorage context drift. It is redacted
      // everywhere in the UI/logs and never sent anywhere except HEX server auth.
      token: Buffer.from(token, 'utf8').toString('base64'),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(getCloudTokenVaultPath(configPath), JSON.stringify(payload, null, 2));
  } catch (_) {}
}

function readCloudTokenVault(configPath) {
  try {
    const vaultPath = getCloudTokenVaultPath(configPath);
    if (!fs.existsSync(vaultPath)) return '';
    const payload = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    if (payload?.version !== 1 || !payload.token) return '';
    return Buffer.from(String(payload.token), 'base64').toString('utf8').trim();
  } catch (_) {
    return '';
  }
}
module.exports = { loadConfig, saveConfig, encryptApiKeys, decryptApiKeys, ENC_PREFIX };
