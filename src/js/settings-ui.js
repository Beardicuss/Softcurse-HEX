'use strict';
// == settings-ui.js == System Settings UI ====================================
// Extracted from renderer.js
const DEFAULT_LOCAL_VOICE_OPTIONS = [
  { value: 'en', label: 'English — lessac-medium' },
  { value: 'ru', label: 'Russian — ruslan-medium' },
  { value: 'ka', label: 'Georgian — natia-medium' }
];

function clearNode(node) {
  window.hexRenderUtils.clearNode(node);
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

const LIVE_PROVIDER_PRIORITY = ['ollama', 'anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate', 'groq', 'openrouter'];
const AUTO_MODEL_PROVIDERS = new Set(['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate', 'groq', 'openrouter']);
const LIVE_PROVIDER_LABELS = {
  ollama: 'OLLAMA',
  anthropic: 'ANTHROPIC',
  openai: 'OPENAI',
  mistral: 'MISTRAL',
  together: 'TOGETHER AI',
  grok: 'GROK (xAI)',
  gemini: 'GEMINI',
  cohere: 'COHERE',
  hf: 'HUGGING FACE',
  replicate: 'REPLICATE',
  groq: 'GROQ',
  openrouter: 'OPENROUTER',
  none: 'OFFLINE'
};

const STALE_PROVIDER_MODELS = {
  cohere: ['command-light'],
  openai: ['gpt-4-turbo-preview'],
};

let _lastLiveKeysMap = {};
let _lastManualKeysMap = {};

function getProviderLabel(provider) {
  return LIVE_PROVIDER_LABELS[provider] || String(provider || '').trim().toUpperCase();
}

function getPreferredProviderFromKeys(keysMap) {
  return LIVE_PROVIDER_PRIORITY.find((provider) => provider !== 'ollama' && keysMap[provider] && keysMap[provider].length > 0) || 'ollama';
}

function getPreferredModelForProvider(provider) {
  const models = Array.isArray(_allFetchedModels) ? _allFetchedModels : [];
  const preferred = models.find((model) => model.free) || models[0];
  if (preferred?.id) return preferred.id;
  return window.hexAI?.FAST_MODELS?.[provider] || '';
}

function setModelSelectOptions(models = [], selectedValue = '') {
  const modelSelect = document.getElementById('cfg-model');
  if (!modelSelect) return;

  const currentValue = String(selectedValue || modelSelect.value || '').trim();
  clearNode(modelSelect);

  const safeModels = Array.isArray(models) ? models.filter((model) => model?.id) : [];
  if (safeModels.length === 0) {
    modelSelect.appendChild(createTextOption('', 'No models detected yet'));
    modelSelect.value = '';
    return;
  }

  safeModels.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.free ? `${model.id}  FREE` : model.id;
    modelSelect.appendChild(option);
  });

  const fallbackValue = safeModels.find((model) => model.id === currentValue)?.id
    || getPreferredModelForProvider(document.getElementById('cfg-provider')?.value || '')
    || safeModels[0]?.id
    || '';
  modelSelect.value = fallbackValue;
}

function isStaleProviderModel(provider, modelName) {
  const model = String(modelName || '').trim().toLowerCase();
  if (!model) return true;
  return (STALE_PROVIDER_MODELS[provider] || []).some((item) => model.includes(item));
}

function maskApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return 'empty';
  if (key.length <= 10) return key;
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function ensureProviderOption(selectEl, provider) {
  if (!selectEl || !provider) return;
  const existing = [...selectEl.options].find((option) => option.value === provider);
  const count = (_lastLiveKeysMap[provider] || []).length;
  const label = provider === 'ollama'
    ? '🖥 Ollama (Local / Free)'
    : getProviderLabel(provider) + ' (' + count + ' key' + (count === 1 ? '' : 's') + ')';
  if (existing) {
    existing.textContent = label;
    return;
  }
  const option = document.createElement('option');
  option.value = provider;
  option.textContent = label;
  selectEl.appendChild(option);
}

function syncProviderOptions(keysMap = {}) {
  const sel = document.getElementById('cfg-provider');
  if (!sel) return;
  ensureProviderOption(sel, 'none');
  ensureProviderOption(sel, 'ollama');
  for (const provider of LIVE_PROVIDER_PRIORITY) {
    if (provider !== 'ollama' && keysMap[provider] && keysMap[provider].length > 0) ensureProviderOption(sel, provider);
  }
  for (const provider of Object.keys(keysMap)) ensureProviderOption(sel, provider);
}

function getSelectedProviderStatus(provider) {
  if (provider === 'ollama') return 'Local provider is available.';
  const count = (_lastLiveKeysMap[provider] || []).length;
  if (count > 0) return count + ' live key' + (count === 1 ? '' : 's') + ' available for ' + getProviderLabel(provider) + '.';
  return getProviderLabel(provider) + ' has no live keys yet. HEX will fall back automatically.';
}

function renderProviderFailurePanel() {
  const panel = document.getElementById('provider-failure-panel');
  const summaryEl = document.getElementById('provider-failure-summary');
  const listEl = document.getElementById('provider-failure-list');
  if (!panel || !summaryEl || !listEl) return;

  const failures = Array.isArray(window._hexLastProviderFailures) ? window._hexLastProviderFailures : [];
  clearNode(listEl);

  if (!failures.length) {
    panel.style.display = 'none';
    summaryEl.textContent = '';
    return;
  }

  summaryEl.textContent = 'Last fallback run failed after checking these providers:';
  failures.forEach((failure) => {
    const row = window.hexRenderUtils.createEl('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.padding = '6px 8px';
    row.style.border = '1px solid rgba(255,255,255,0.06)';
    row.style.background = 'rgba(0,0,0,0.16)';

    const provider = window.hexRenderUtils.createEl('strong', {
      text: failure.label || String(failure.provider || 'UNKNOWN').toUpperCase()
    });
    provider.style.color = 'var(--orange)';

    const reason = window.hexRenderUtils.createEl('span', {
      text: failure.reason || 'unknown failure'
    });
    reason.style.color = 'var(--text)';
    reason.style.textAlign = 'right';

    row.appendChild(provider);
    row.appendChild(reason);
    listEl.appendChild(row);
  });

  panel.style.display = 'block';
}

function createTextOption(value, label) {
  return window.hexRenderUtils.createEl('option', { attrs: { value }, text: label });
}

function populateLocalVoiceOptions(selectEl, voices = null) {
  if (!selectEl) return;
  clearNode(selectEl);
  const favs = config.voice?.favouriteVoices || {};

  if (voices && voices.length > 0) {
    const byLang = {};
    voices.forEach((voice) => {
      if (!byLang[voice.lang]) byLang[voice.lang] = [];
      byLang[voice.lang].push(voice);
    });

    const langNames = { en: 'English', ru: 'Russian', ka: 'Georgian' };
    Object.entries(byLang).forEach(([lang, langVoices]) => {
      const group = document.createElement('optgroup');
      group.label = langNames[lang] || lang.toUpperCase();
      langVoices.forEach((voice) => {
        const isFav = favs[lang] === voice.id;
        group.appendChild(createTextOption(
          voice.id,
          `${isFav ? '★ ' : ''}${voice.name}${voice.ready ? '' : ' ⚠'}${voice.isDefault ? ' (default)' : ''}`
        ));
      });
      selectEl.appendChild(group);
    });
    return;
  }

  DEFAULT_LOCAL_VOICE_OPTIONS.forEach((option) => {
    selectEl.appendChild(createTextOption(option.value, option.label));
  });
}

// ── FAVOURITE VOICE PER LANGUAGE ───────────────────────────────
function toggleFavouriteVoice() {
  const sel = document.getElementById('cfg-local-voice');
  if (!sel || !sel.value) return;
  const voiceId = sel.value;

  // Determine language from voice ID (e.g. 'en_US-lessac-medium' → 'en', 'ru_RU-ruslan-medium' → 'ru')
  let lang = '';
  const opt = sel.selectedOptions[0];
  if (opt && opt.parentElement.tagName === 'OPTGROUP') {
    // Get lang from optgroup label
    const labelToLang = { 'English': 'en', 'Russian': 'ru', 'Georgian': 'ka' };
    lang = labelToLang[opt.parentElement.label] || voiceId.substring(0, 2);
  } else {
    lang = voiceId.substring(0, 2);
  }

  if (!config.voice) config.voice = {};
  if (!config.voice.favouriteVoices) config.voice.favouriteVoices = {};

  // Toggle: if already the favourite, unstar it; otherwise set it
  if (config.voice.favouriteVoices[lang] === voiceId) {
    delete config.voice.favouriteVoices[lang];
    showToast('◆ VOICE', `Removed favourite for ${lang.toUpperCase()}`, '', 2000);
  } else {
    config.voice.favouriteVoices[lang] = voiceId;
    showToast('◆ VOICE', `★ Set favourite ${lang.toUpperCase()} voice: ${voiceId}`, '', 2000);
  }

  // Save immediately
  window.hexAPI.setConfig({ voice: config.voice });

  // Refresh UI
  updateFavStarUI();
  // Re-populate dropdown to show ★ markers
  refreshLocalVoiceDropdown();
}

function updateFavStarUI() {
  const btn = document.getElementById('fav-voice-btn');
  const sel = document.getElementById('cfg-local-voice');
  if (!btn || !sel) return;

  const voiceId = sel.value;
  const favs = config.voice?.favouriteVoices || {};

  // Check if current selection is the favourite for its language
  let isFav = false;
  for (const lang of Object.keys(favs)) {
    if (favs[lang] === voiceId) { isFav = true; break; }
  }

  btn.textContent = isFav ? '★' : '☆';
  btn.style.color = isFav ? '#ffd700' : '';
  btn.title = isFav ? 'Remove favourite' : 'Set as favourite voice for this language';
}

async function refreshLocalVoiceDropdown() {
  const sel = document.getElementById('cfg-local-voice');
  if (!sel) return;
  const currentVal = sel.value;
  try {
    const status = await window.hexAPI.voice.status();
    if (status.voices && status.voices.length > 0) {
      populateLocalVoiceOptions(sel, status.voices);
    } else {
      populateLocalVoiceOptions(sel);
    }
  } catch (_) {
    populateLocalVoiceOptions(sel);
  }
  sel.value = currentVal;
}

function setVoiceStatusContent(container, { primaryText, primaryColor, secondarySegments = [] }) {
  if (!container) return;
  clearNode(container);

  const primary = window.hexRenderUtils.createEl('strong', { text: primaryText });
  if (primaryColor) primary.style.color = primaryColor;
  container.appendChild(primary);

  if (secondarySegments.length > 0) {
    container.appendChild(document.createElement('br'));
    secondarySegments.forEach((segment) => {
      if (segment.type === 'code') {
        container.appendChild(window.hexRenderUtils.createEl('code', { text: segment.text }));
      } else if (segment.type === 'span') {
        const span = window.hexRenderUtils.createEl('span', { text: segment.text });
        if (segment.color) span.style.color = segment.color;
        container.appendChild(span);
      } else {
        appendText(container, segment.text);
      }
    });
  }
}
// ── LOCAL VOICE MODEL MANAGEMENT ─────────────────────────────
async function openModelsDir() {
  try {
    const dir = await window.hexAPI.voice.openModelsDir();
    const el = document.getElementById('models-dir-path');
    if (el) el.textContent = dir;
  } catch (e) { console.warn('openModelsDir:', e.message); }
}

async function refreshVoiceStatus() {
  const el = document.getElementById('local-voice-status');
  if (!el) return;
  try {
    const s = await window.hexAPI.voice.status();
    // Show models folder path
    const pathEl = document.getElementById('models-dir-path');
    if (pathEl && s.modelsDir) pathEl.textContent = s.modelsDir;
    const isOllama = window.hexVoice?._ollamaProvider;
    if (!s.available) {
      setVoiceStatusContent(el, {
        primaryText: isOllama
          ? '🎙 Active STT: Ollama Whisper'
          : '⚠ No STT engine — download Whisper below, or set AI provider to Ollama',
        primaryColor: isOllama ? 'var(--cyan)' : 'var(--magenta)',
        secondarySegments: isOllama
          ? [
            { text: ' — run ' },
            { type: 'code', text: 'ollama pull whisper' },
            { text: ' if needed. sherpa-onnx not built — run ' },
            { type: 'code', text: 'npm run rebuild' }
          ]
          : [
            { type: 'span', text: 'sherpa-onnx not built — run ', color: 'var(--muted)' },
            { type: 'code', text: 'npm run rebuild' }
          ]
      });
      return;
    }
    const stt = s.sttReady ? '✅ Whisper STT' : '❌ Whisper (not downloaded)';
    const en = s.ttsReady?.en ? '✅ TTS EN' : '❌ TTS EN';
    const ru = s.ttsReady?.ru ? '✅ TTS RU' : '❌ TTS RU';
    const ka = s.ttsReady?.ka ? '✅ TTS KA' : '❌ TTS KA';
    setVoiceStatusContent(el, {
      primaryText: s.sttReady
        ? '🎙 Active STT: Local Whisper (offline)'
        : isOllama
          ? '🎙 Active STT: Ollama Whisper'
          : '⚠ No STT engine — download Whisper below, or set AI provider to Ollama',
      primaryColor: s.sttReady || isOllama ? 'var(--cyan)' : 'var(--magenta)',
      secondarySegments: isOllama && !s.sttReady
        ? [
          { text: ' — run ' },
          { type: 'code', text: 'ollama pull whisper' },
          { text: ` | ${stt}   ${en}   ${ru}   ${ka}` }
        ]
        : [{ text: `${stt}   ${en}   ${ru}   ${ka}` }]
    });
  } catch (e) {
    el.textContent = 'Status check failed: ' + (e?.message || String(e));
  }
}

async function downloadVoiceModels() {
  const btn = document.getElementById('download-models-btn');
  const progress = document.getElementById('download-progress');
  const fill = document.getElementById('download-progress-fill');
  const label = document.getElementById('download-progress-label');

  const targets = ['stt', 'tts-en', 'tts-ru', 'tts-ka']
    .filter(v => document.getElementById('dl-' + v.replace('tts-', ''))?.checked);

  if (!targets.length) { alert('Select at least one model to download.'); return; }

  // Get selected Whisper model size
  const sizeEl = document.getElementById('dl-stt-size');
  const whisperSize = sizeEl ? sizeEl.value : 'tiny';

  btn.disabled = true; btn.textContent = '⏳ Downloading...';
  progress.style.display = 'block'; fill.style.width = '0%';
  label.textContent = 'Starting download...' + (targets.includes('stt') ? ` (Whisper ${whisperSize})` : '');

  // Wire progress events
  window.hexAPI.voice.onDownloadProgress((p) => {
    const pct = p.pct || 0;
    fill.style.width = pct + '%';
    if (p.stage === 'done') {
      label.textContent = `✅ ${p.name}`;
    } else {
      label.textContent = `[${p.group}] ${p.name} — ${pct}%`;
    }
  });

  try {
    await window.hexAPI.voice.downloadModels(targets, whisperSize);

    // Crucial: Update the frontend config cache so subsequent clicking of "APPLY & CLOSE"
    // does not erase the newly saved whisperSize from the config with a stale cache state!
    if (!config.voice) config.voice = {};
    config.voice.whisperSize = whisperSize;

    label.textContent = '✅ All models downloaded! Restart HEX to activate.';
    fill.style.width = '100%';
    await refreshVoiceStatus();
  } catch (e) {
    label.textContent = '⚠ Download failed: ' + (e?.message || String(e));
    label.style.color = 'var(--magenta)';
  } finally {
    btn.disabled = false; btn.textContent = '⬇ DOWNLOAD SELECTED';
  }
}

async function openSettings(targetTab = 'tab-general') {
  try {
    const cfg = config || {};
    refreshVoiceStatus();
    const userNameEl = document.getElementById('cfg-username');
    const languageEl = document.getElementById('cfg-language');
    const cloudEnabledEl = document.getElementById('cfg-cloud-enabled');
    const cloudUrlEl = document.getElementById('cfg-cloud-url');
    const cloudTokenEl = document.getElementById('cfg-cloud-token');
    if (userNameEl) userNameEl.value = cfg.userName || '';
    if (languageEl) languageEl.value = cfg.language || 'ka';
    if (cloudEnabledEl) cloudEnabledEl.value = String(cfg.cloud?.enabled === true);
    if (cloudUrlEl) cloudUrlEl.value = cfg.cloud?.serverUrl || '';
    if (cloudTokenEl) cloudTokenEl.value = cfg.cloud?.accessToken || '';
    const cloudStatus = document.getElementById('cfg-cloud-status');
    if (cloudStatus) {
      cloudStatus.textContent = cfg.cloud?.profileId
        ? `Profile: ${cfg.cloud.profileId}${cfg.cloud.sessionId ? ` | Session: ${cfg.cloud.sessionId}` : ''}`
        : 'No cloud profile resolved yet.';
    }
  // -- API KEY MIGRATION & INIT --
  if (!cfg.llm) cfg.llm = {};
  if (!cfg.llm.apiKeys) {
    cfg.llm.apiKeys = {};
    if (cfg.llm.apiKey && cfg.llm.provider) {
      cfg.llm.apiKeys[cfg.llm.provider] = cfg.llm.apiKey;
    }
  }
  window._tempApiKeys = { ...cfg.llm.apiKeys };

  const p = cfg.llm.provider || 'none';
  window._currentProvider = p;
  ensureProviderOption(document.getElementById('cfg-provider'), p);
  document.getElementById('cfg-provider').value = p;
  const autoEl = document.getElementById('cfg-autoollama');
  if (autoEl) autoEl.value = String(cfg.llm?.autoOllama === true);
  document.getElementById('cfg-baseurl').value = cfg.llm?.baseUrl || 'http://localhost:11434';
  document.getElementById('cfg-model').value = cfg.llm?.model || '';
  document.getElementById('cfg-wakeword').value = cfg.voice?.wakeWord || 'hey hex';
  // Restore saved models directory into the input field
  const mdirEl = document.getElementById('cfg-models-dir');
  if (mdirEl && cfg.voice?.modelsDir) mdirEl.value = cfg.voice.modelsDir;
  document.getElementById('cfg-breakmin').value = cfg.monitoring?.breakIntervalMin || 90;
  document.getElementById('cfg-proactive').value = String(cfg.monitoring?.proactiveAdvice !== false);
  const se = document.getElementById('cfg-searchengine');
  if (se) se.value = cfg.browser?.searchEngine || 'google';

  const sysAuto = document.getElementById('cfg-autostart');
  const sysTray = document.getElementById('cfg-minimize-tray');
  if (sysAuto) sysAuto.value = String(cfg.system?.autostart === true);
  if (sysTray) sysTray.value = String(cfg.system?.minimizeToTray === true);
  const sleepEl = document.getElementById('cfg-sleep-timeout');
  if (sleepEl) sleepEl.value = cfg.sleepTimeoutMin || 0;

  document.getElementById('cfg-model').value = cfg.llm?.model || '';
  if (document.getElementById('cfg-visionkey')) document.getElementById('cfg-visionkey').value = cfg.llm?.visionApiKey || '';
  // Voice rate/pitch sliders
  const rate = cfg.voice?.rate ?? 0.95;
  const pitch = cfg.voice?.pitch ?? 0.85;
  const volume = cfg.voice?.volume ?? 0.9;
  document.getElementById('cfg-rate').value = rate;
  document.getElementById('cfg-pitch').value = pitch;
  document.getElementById('rate-val').textContent = rate;
  document.getElementById('pitch-val').textContent = pitch;
  const volEl = document.getElementById('cfg-volume');
  if (volEl) { volEl.value = volume; const vv = document.getElementById('volume-val'); if (vv) vv.textContent = volume; }

  // GCloud TTS fields
  const gcKeyEl = document.getElementById('cfg-gcloud-tts-key');
  const gcVoiceEl = document.getElementById('cfg-gcloud-voice');
  if (gcKeyEl) gcKeyEl.value = cfg.voice?.gcloudTtsKey || '';
  if (gcVoiceEl) gcVoiceEl.value = cfg.voice?.gcloudVoice || 'ka-GE-Standard-A';

  populateVoiceSelect(cfg.voice?.voiceName || '');

  // Restore TTS engine choice
  const savedEngine = cfg.voice?.ttsEngine || 'os';
  const radioLocal = document.getElementById('tts-engine-local');
  const radioOs = document.getElementById('tts-engine-os');
  if (radioLocal) radioLocal.checked = savedEngine === 'local';
  if (radioOs) radioOs.checked = savedEngine !== 'local';

  // Restore local voice settings
  const lvSel = document.getElementById('cfg-local-voice');
  // Dynamically populate voice dropdown with discovered models
  if (lvSel) {
    try {
      const status = await window.hexAPI.voice.status();
      if (status.voices && status.voices.length > 0) {
        populateLocalVoiceOptions(lvSel, status.voices);
      } else {
        populateLocalVoiceOptions(lvSel);
      }
    } catch (_) {
      populateLocalVoiceOptions(lvSel);
    }
    lvSel.value = cfg.voice?.localVoiceLang || 'en';
    // Update ★ button state
    updateFavStarUI();
    // Wire star button click
    const favBtn = document.getElementById('fav-voice-btn');
    if (favBtn) favBtn.onclick = toggleFavouriteVoice;
    // Update star when voice selection changes
    lvSel.onchange = () => { updateFavStarUI(); updateTtsEngineUI(); };
  }
  const lvSpeed = document.getElementById('cfg-local-speed');
  if (lvSpeed) {
    const spd = cfg.voice?.localSpeed ?? 1.0;
    lvSpeed.value = spd;
    const lsv = document.getElementById('local-speed-val');
    if (lsv) lsv.textContent = spd.toFixed(2);
  }
  updateTtsEngineUI();
  updateProviderUI();
  renderProviderFailurePanel();
  // Start on the requested tab
  switchSettingsTab(targetTab);
  // Auto-show voice status info when general is loaded (shows in voice tab when switched)
  // Pre-populate personality active display
  updatePersonaBadge();
  refreshPersonaList();
  await loadLiveArsenal();
  await autoSyncProvider();
  if (AUTO_MODEL_PROVIDERS.has(document.getElementById('cfg-provider')?.value || '')) {
    await fetchAvailableModels().catch(() => {});
  }
  document.getElementById('settings-overlay')?.classList.add('open');
  } catch (error) {
    console.error('openSettings failed:', error);
    addLog?.('ERROR', 'Settings open failed: ' + (error?.message || String(error)));
    showToast?.('◆ SETTINGS', 'Failed to open settings: ' + (error?.message || String(error)), 'alert', 4000);
  }
}
window.openSettings = openSettings;

async function testCloudConnection() {
  const enabled = document.getElementById('cfg-cloud-enabled')?.value === 'true';
  const statusEl = document.getElementById('cfg-cloud-status');
  if (!statusEl) return;

  if (!enabled) {
    statusEl.textContent = 'Cloud continuity is disabled.';
    statusEl.style.color = 'var(--muted)';
    return;
  }

  const draftConfig = {
    ...config,
    cloud: {
      ...(config.cloud || {}),
      enabled,
      serverUrl: (document.getElementById('cfg-cloud-url')?.value || '').trim(),
      accessToken: (document.getElementById('cfg-cloud-token')?.value || '').trim(),
    }
  };

  const prevConfig = config;
  config = draftConfig;
  window._hexConfig = draftConfig;
  await window.hexAPI.setConfig(draftConfig);

  statusEl.textContent = 'Checking cloud server and hunter bridge...';
  statusEl.style.color = 'var(--accent)';

  try {
    const health = await window.hexAPI.cloud.health();
    if (!health?.success) throw new Error(health?.error || 'Health check failed');

    const hunterStatus = await window.hexAPI.cloud.hunterStatus();
    if (!hunterStatus?.success) {
      throw new Error(hunterStatus?.error || 'Hunter status check failed');
    }

    if (!hunterStatus.configured) {
      statusEl.textContent = `Online: ${health.service || 'hex-server'} | Hunter bridge not configured yet.`;
      statusEl.style.color = 'var(--orange)';
      return;
    }

    const [providerStats, keySummary] = await Promise.all([
      window.hexAPI.cloud.hunterProviderStats(),
      window.hexAPI.cloud.hunterKeySummary()
    ]);

    if (!providerStats?.success) {
      throw new Error(providerStats?.error || 'Hunter provider stats failed');
    }
    if (!keySummary?.success) {
      throw new Error(keySummary?.error || 'Hunter key summary failed');
    }

    const providerCount = Array.isArray(providerStats.stats) ? providerStats.stats.length : 0;
    const totalKeys = Number(keySummary.summary?.totals?.total_keys || 0);
    const validKeys = Number(keySummary.summary?.totals?.valid_keys || 0);

    statusEl.textContent = `Online: ${health.service || 'hex-server'} | Hunter bridge OK | Providers: ${providerCount} | Keys: ${validKeys}/${totalKeys} valid`;
    statusEl.style.color = 'var(--green)';
  } catch (error) {
    statusEl.textContent = 'Cloud/Hunter check failed: ' + error.message;
    statusEl.style.color = 'var(--orange)';
  } finally {
    config = draftConfig;
    window._hexConfig = draftConfig;
    if (prevConfig !== draftConfig) {
      await window.hexAPI.setConfig(draftConfig);
    }
  }
}

function populateVoiceSelect(selectedName) {
  const sel = document.getElementById('cfg-voice');
  if (!sel) return;
  const voices = window.hexVoice.getVoicesSorted();
  clearNode(sel);
  sel.appendChild(createTextOption('', '— Auto (best match for language) —'));
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} [${v.lang}]${v.localService ? '' : ' ☁'}`;
    if (v.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function previewSelectedVoice() {
  const name = document.getElementById('cfg-voice')?.value;
  const rate = parseFloat(document.getElementById('cfg-rate')?.value || '0.95');
  const pitch = parseFloat(document.getElementById('cfg-pitch')?.value || '0.85');
  const volume = parseFloat(document.getElementById('cfg-volume')?.value || '0.9');
  if (name) {
    // Use speak() directly with selected voice + live slider values
    window.hexVoice.setVoiceByName(name);
    window.hexVoice.synthesis?.cancel();
    const utt = new SpeechSynthesisUtterance('Softcurse H.E.X. online. Neural link established.');
    const v = window.hexVoice._voices.find(v => v.name === name);
    if (v) utt.voice = v;
    utt.rate = rate; utt.pitch = pitch; utt.volume = volume;
    utt.lang = window.hexVoice.langCode;
    window.hexVoice.synthesis?.speak(utt);
  }
}

async function previewLocalVoice() {
  const voiceId = document.getElementById('cfg-local-voice')?.value || 'en';
  const speed = parseFloat(document.getElementById('cfg-local-speed')?.value || '1.0');
  const unavail = document.getElementById('local-voice-unavail');
  try {
    // Save and temporarily apply live settings so preview actually uses them
    const origEngine = window.hexVoice._ttsEngine;
    const origLang = window.hexVoice._localVoiceLang;
    const origSpeed = window.hexVoice._localSpeed;
    window.hexVoice._ttsEngine = 'local';   // force local for preview
    window.hexVoice._localVoiceLang = voiceId;
    window.hexVoice._localSpeed = speed;
    try {
      await window.hexVoice.speak('Neural link established. Voice engine online.');
      if (unavail) unavail.style.display = 'none';
    } finally {
      window.hexVoice._ttsEngine = origEngine;
      window.hexVoice._localVoiceLang = origLang;
      window.hexVoice._localSpeed = origSpeed;
    }
  } catch (e) {
    if (unavail) { unavail.textContent = '⚠ ' + (e?.message || String(e)); unavail.style.display = ''; }
  }
}

async function updateTtsEngineUI() {
  const engine = document.querySelector('input[name="tts-engine"]:checked')?.value || 'os';
  const localPicker = document.getElementById('local-voice-picker');
  const osPicker = document.getElementById('os-voice-picker');
  const unavail = document.getElementById('local-voice-unavail');

  // Live-apply so changes take effect without pressing Save
  window.hexVoice._ttsEngine = engine;

  if (engine === 'local') {
    localPicker.style.display = '';
    osPicker.style.display = 'none';
    const voiceId = document.getElementById('cfg-local-voice')?.value || 'en';
    window.hexVoice._localVoiceLang = voiceId;   // live-apply voice too
    try {
      const s = await window.hexAPI.voice.status();
      // Check readiness from voices array (supports custom IDs like en:vasco)
      let ready = false;
      if (s.voices) {
        const match = s.voices.find(v => v.id === voiceId);
        ready = match ? match.ready : false;
      }
      // Fallback: check old ttsReady for simple lang keys
      if (!ready && s.ttsReady) {
        ready = s.ttsReady[voiceId] || false;
      }
      if (unavail) unavail.style.display = ready ? 'none' : '';
      if (!ready && unavail) unavail.textContent = `⚠ Voice model "${voiceId}" not ready. Check that .onnx, .onnx.json, and tokens.txt files exist.`;
    } catch (_) { }
  } else {
    localPicker.style.display = 'none';
    osPicker.style.display = '';
    if (unavail) unavail.style.display = 'none';
  }
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
  window.hexVoice.stopSpeaking();
}

function updateProviderUI() {
  const p = document.getElementById('cfg-provider').value;

  window._currentProvider = p;
  const autoOllamaEnabled = document.getElementById('cfg-autoollama')?.value === 'true';
  const baseUrlGroup = document.getElementById('cfg-baseurl-group');
  if (baseUrlGroup) baseUrlGroup.style.display = p === 'ollama' && autoOllamaEnabled ? '' : 'none';

  const providerHint = document.getElementById('provider-auto-hint');
  if (providerHint) providerHint.textContent = getSelectedProviderStatus(p);

  const mh = document.getElementById('model-hint');
  if (mh) mh.textContent = p === 'ollama' ? 'Local models come from your Ollama server.' : 'Models are discovered automatically from the selected provider key.';

  const modelSelect = document.getElementById('cfg-model');
  if (modelSelect) {
    if (Array.isArray(_allFetchedModels) && _allFetchedModels.length > 0) {
      setModelSelectOptions(_allFetchedModels, modelSelect.value);
    } else {
      const preferred = window.hexAI?.FAST_MODELS?.[p] || '';
      clearNode(modelSelect);
      modelSelect.appendChild(createTextOption(preferred || '', preferred || 'Model will be detected automatically'));
      modelSelect.value = preferred || '';
    }
    if ((p === 'ollama' && !modelSelect.value) || isStaleProviderModel(p, modelSelect.value)) {
      const bestModel = getPreferredModelForProvider(p);
      if (bestModel) modelSelect.value = bestModel;
    }
  }
}


let _allFetchedModels = [];  // cache: array of {id, free}

async function fetchAvailableModels() {
  const provider = document.getElementById('cfg-provider').value;
  const baseUrl = document.getElementById('cfg-baseurl').value.trim();
  const statusEl = document.getElementById('model-fetch-status');
  const btn = document.getElementById('fetch-models-btn');
  const picker = document.getElementById('model-picker');
  const modelInput = document.getElementById('cfg-model');

  if (provider === 'none') {
    statusEl.textContent = 'Select a provider first.';
    statusEl.style.display = '';
    renderProviderFailurePanel();
    return;
  }

  if (provider === 'ollama') {
    btn.textContent = '⏳ ...';
    btn.disabled = true;
    statusEl.style.display = 'none';
    picker.style.display = 'none';
    try {
      _allFetchedModels = await window.hexAI.fetchModels(provider, '', baseUrl);
      setModelSelectOptions(_allFetchedModels, modelInput?.value || '');
      renderModelPicker(false);
    } catch (err) {
      statusEl.textContent = '⚠ ' + (err?.message || String(err));
      statusEl.style.display = '';
    } finally {
      btn.textContent = '⬇ FETCH';
      btn.disabled = false;
    }
    return;
  }

  btn.textContent = '⏳ ...';
  btn.disabled = true;
  statusEl.style.display = 'none';
  picker.style.display = 'none';

  let providerKeys = [];
  try {
    const res = await window.hexAPI.getLiveKeys();
    if (res && res.success) {
      _lastLiveKeysMap = res.keys || {};
      _lastManualKeysMap = res.manualKeys || {};
      providerKeys = _lastLiveKeysMap[provider] || [];
    }
  } catch (_) { }

  if (!providerKeys.length) {
    statusEl.textContent = '⚠ No live key for ' + getProviderLabel(provider) + ' yet.';
    statusEl.style.display = '';
    btn.textContent = '⬇ FETCH';
    btn.disabled = false;
    renderProviderFailurePanel();
    return;
  }

  let lastError = null;
  for (const apiKey of providerKeys) {
    try {
      _allFetchedModels = await window.hexAI.fetchModels(provider, apiKey, baseUrl);
      setModelSelectOptions(_allFetchedModels, modelInput?.value || '');
      renderModelPicker(false);
      statusEl.textContent = '✅ ' + _allFetchedModels.length + ' models detected for ' + getProviderLabel(provider) + '.';
      statusEl.style.display = '';
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    statusEl.textContent = '⚠ ' + (lastError?.message || String(lastError));
    statusEl.style.display = '';
  }

  renderProviderFailurePanel();
  btn.textContent = '⬇ FETCH';
  btn.disabled = false;
}

function renderModelPicker(freeOnly) {
  const picker = document.getElementById('model-picker');
  const statusEl = document.getElementById('model-fetch-status');
  const mi = document.getElementById('cfg-model');

  const list = freeOnly ? _allFetchedModels.filter(m => m.free) : _allFetchedModels;
  const freeCount = _allFetchedModels.filter(m => m.free).length;
  const allCount = _allFetchedModels.length;

  // Auto-fill if input is blank or a bare provider name
  const bare = ['gemini', 'grok', 'openai', 'anthropic', 'mistral', 'groq', 'ollama', 'together', 'cohere', 'openrouter'];
  if (!mi.value || bare.includes(mi.value.toLowerCase().trim())) {
    const firstFree = _allFetchedModels.find(m => m.free);
    mi.value = (firstFree || _allFetchedModels[0] || {}).id || '';
  }
  setModelSelectOptions(list.length > 0 ? list : _allFetchedModels, mi.value);

  clearNode(statusEl);
  appendText(statusEl, `✅ Showing ${list.length} models — click to select | `);
  const toggle = window.hexRenderUtils.createEl('button', {
    className: 'text-btn',
    text: freeOnly ? `show all ${allCount}` : `free only (${freeCount})`,
    dataset: { modelPickerToggle: freeOnly ? 'all' : 'free' }
  });
  toggle.style.cursor = 'pointer';
  toggle.style.textDecoration = 'underline';
  toggle.style.color = 'var(--accent)';
  toggle.style.background = 'transparent';
  toggle.style.border = '0';
  toggle.style.padding = '0';
  toggle.style.font = 'inherit';
  statusEl.appendChild(toggle);
  statusEl.style.display = '';

  if (list.length === 0) {
    clearNode(picker);
    const emptyState = window.hexRenderUtils.createEl('div', {
      text: 'No free models found for this provider. Click "show all" above.'
    });
    emptyState.style.padding = '10px';
    emptyState.style.fontSize = '14px';
    emptyState.style.color = 'var(--muted)';
    picker.appendChild(emptyState);
    picker.style.display = 'block';
    return;
  }

  clearNode(picker);
  list.forEach((model) => {
    const isActive = model.id === mi.value;
    const row = window.hexRenderUtils.createEl('div', {
      dataset: { modelId: model.id }
    });
    row.style.padding = '7px 10px';
    row.style.cursor = 'pointer';
    row.style.fontSize = '14px';
    row.style.fontFamily = 'monospace';
    row.style.borderBottom = '1px solid rgba(255,255,255,.05)';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    if (isActive) {
      row.style.background = 'var(--accent)';
      row.style.color = '#000';
    }

    const label = window.hexRenderUtils.createEl('span', { text: model.id });
    label.style.flex = '1';
    row.appendChild(label);

    if (model.free) {
      const freeBadge = window.hexRenderUtils.createEl('span', { text: 'FREE' });
      freeBadge.style.marginLeft = '6px';
      freeBadge.style.fontSize = '13px';
      freeBadge.style.padding = '1px 5px';
      freeBadge.style.background = 'rgba(0,255,150,.2)';
      freeBadge.style.color = '#0f9';
      freeBadge.style.borderRadius = '3px';
      freeBadge.style.verticalAlign = 'middle';
      row.appendChild(freeBadge);
    }

    picker.appendChild(row);
  });
  picker.style.display = 'block';
}

function selectModel(name) {
  document.getElementById('cfg-model').value = name;
  const picker = document.getElementById('model-picker');
  [...picker.querySelectorAll('[data-model-id]')].forEach(el => {
    const isSelected = el.dataset.modelId === name;
    el.style.background = isSelected ? 'var(--accent)' : '';
    el.style.color = isSelected ? '#000' : '';
  });
}

async function saveSettings() {
  if (window.hexAudio) window.hexAudio.play('action', 0.8);

  const newLang = document.getElementById('cfg-language').value;
  const newCfg = {
    userName: document.getElementById('cfg-username').value || 'Operator',
    language: newLang,
    llm: {
      provider: document.getElementById('cfg-provider').value,
      autoOllama: document.getElementById('cfg-autoollama')?.value === 'true',
      baseUrl: document.getElementById('cfg-baseurl').value,
      model: document.getElementById('cfg-model').value,
      apiKey: '',
      apiKeys: config.llm?.apiKeys || {},
      manualApiKeys: config.llm?.manualApiKeys || {},
      visionApiKey: document.getElementById('cfg-visionkey')?.value || '',
      hunterLimitMinutes: config.llm?.hunterLimitMinutes || 1440
    },
    browser: {
      searchEngine: document.getElementById('cfg-searchengine')?.value || 'google'
    },
    voice: {
      ...config.voice,
      // modelsDir: always read from field so it persists even without clicking APPLY
      modelsDir: (document.getElementById('cfg-models-dir')?.value || '').trim() || config.voice?.modelsDir || '',
      wakeWord: document.getElementById('cfg-wakeword').value || 'hey hex',
      voiceName: document.getElementById('cfg-voice')?.value || '',
      rate: parseFloat(document.getElementById('cfg-rate').value) || 0.95,
      pitch: parseFloat(document.getElementById('cfg-pitch').value) || 0.85,
      volume: parseFloat(document.getElementById('cfg-volume')?.value || '0.9'),
      ttsEngine: document.querySelector('input[name="tts-engine"]:checked')?.value || 'os',
      localVoiceLang: document.getElementById('cfg-local-voice')?.value || 'en',
      localSpeed: parseFloat(document.getElementById('cfg-local-speed')?.value || '1.0'),
      gcloudTtsKey: (document.getElementById('cfg-gcloud-tts-key')?.value || '').trim() || config.voice?.gcloudTtsKey || '',
      gcloudVoice: document.getElementById('cfg-gcloud-voice')?.value || config.voice?.gcloudVoice || 'ka-GE-Standard-A',
      favouriteVoices: config.voice?.favouriteVoices || {},
    },
    monitoring: {
      ...config.monitoring,
      breakIntervalMin: parseInt(document.getElementById('cfg-breakmin').value) || 90,
      proactiveAdvice: document.getElementById('cfg-proactive').value === 'true'
    },
    system: {
      ...config.system,
      autostart: document.getElementById('cfg-autostart')?.value === 'true',
      minimizeToTray: document.getElementById('cfg-minimize-tray')?.value === 'true'
    },
    cloud: {
      ...(config.cloud || {}),
      enabled: document.getElementById('cfg-cloud-enabled')?.value === 'true',
      serverUrl: (document.getElementById('cfg-cloud-url')?.value || '').trim(),
      accessToken: (document.getElementById('cfg-cloud-token')?.value || '').trim() || config.cloud?.accessToken || '',
    },
    sleepTimeoutMin: parseInt(document.getElementById('cfg-sleep-timeout')?.value) || 0,
  };

  const prevLang = config.language;
  // Merge personalities into config before saving
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...newCfg, ...pcfg };
  window._hexConfig = config;
  await window.hexAPI.setConfig(config);
  window.hexAI.configure(config);
  window.hexVoice.wakeWord = config.voice.wakeWord;
  window.hexVoice.setVoiceByName(config.voice.voiceName);
  window.hexVoice._ttsEngine = config.voice.ttsEngine || 'os';
  window.hexVoice._localVoiceLang = config.voice.localVoiceLang || 'en';
  window.hexVoice._localSpeed = config.voice.localSpeed ?? 1.0;
  window.hexVoice._gcloudKey = config.voice.gcloudTtsKey || '';
  window.hexVoice._useGCloud = !!(config.voice.gcloudTtsKey);
  window.hexVoice._gcloudVoice = config.voice.gcloudVoice || 'ka-GE-Standard-A';
  // Push modelsDir to engine and refresh engine status
  if (config.voice.modelsDir) {
    window.hexAPI.voice.setModelsDir(config.voice.modelsDir).catch(() => { });
  }
  // Re-check local engines so _localSTT/_localTTS are current after any path change
  window.hexVoice._checkLocalEngines();
  window.hexBrowser.defaultEngine = config.browser?.searchEngine || 'google';
  updateSearchEngineBtn();

  if (newLang !== prevLang) await setLanguage(newLang);

  closeSettings();
  addLog('SYSTEM', 'Configuration saved.');
  showToast('◆ CONFIG SAVED', 'Settings updated and applied.', '', 3000);  // Local hunter disabled; remote hunter sync is managed by hex-server.
}

// ─── PLUGIN LOCAL INSTALL UI ─────────────────────────────────────────────────

function switchPluginSubTab(tabName) {
  document.getElementById('subtab-plugins-installed').classList.toggle('active', tabName === 'installed');
  document.getElementById('subtab-plugins-market').classList.toggle('active', tabName === 'market');

  document.getElementById('panel-plugins-installed').style.display = tabName === 'installed' ? 'block' : 'none';
  document.getElementById('panel-plugins-market').style.display = tabName === 'market' ? 'block' : 'none';

  if (tabName === 'installed') loadPluginsList();
}

async function browseAndInstallPlugin() {
  const statusEl = document.getElementById('local-install-status');
  statusEl.style.display = '';
  statusEl.textContent = '📂 Opening file browser...';

  try {
    const res = await window.hexAPI.plugins.installLocal();
    if (!res) {
      statusEl.textContent = 'Cancelled.';
      setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      return;
    }
    if (res.success) {
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = `✅ Installed "${res.pluginId}" successfully! Switch to INSTALLED tab to see it.`;
      showToast('PLUGINS', `${res.pluginId} installed from local file.`, 'success');
    } else {
      statusEl.style.color = 'var(--orange)';
      statusEl.textContent = `⚠ Install failed: ${res.error}`;
    }
  } catch (err) {
    statusEl.style.color = 'var(--orange)';
    statusEl.textContent = `⚠ Error: ${err.message}`;
  }
}

// ─── GLOBAL EVENT LISTENERS ──────────────────────────────────────────────────

window.addEventListener('click', (e) => {
  const panel = document.querySelector('.stab-panel.active');
  if (panel && e.target === panel) {
    if (document.getElementById('model-picker')) {
      document.getElementById('model-picker').style.display = 'none';
    }
  }
});

// ─── PHASE 13: LIVE ARSENAL UI RENDERER ──────────────────────────────────────

async function loadLiveArsenal() {
  try {
    const res = await window.hexAPI.refreshLiveKeys();
    if (res && res.success) {
      _lastLiveKeysMap = res.keys || {};
      _lastManualKeysMap = res.manualKeys || {};
      syncProviderOptions(_lastLiveKeysMap);
      renderLiveArsenal(_lastLiveKeysMap);
      renderManualKeyList(_lastManualKeysMap);
    }
  } catch (e) {
    console.warn('Failed to load initial live AI arsenal', e);
  }
}

function renderLiveArsenal(keysMap) {
  const container = document.getElementById('ai-live-arsenal');
  const countEl = document.getElementById('ai-pool-count');
  if (!container || !countEl) return;

  _lastLiveKeysMap = keysMap || {};
  syncProviderOptions(_lastLiveKeysMap);
  const activeProvider = document.getElementById('cfg-provider')?.value || '';
  const sortedProviders = LIVE_PROVIDER_PRIORITY.filter((provider) => keysMap[provider] && keysMap[provider].length > 0);
  for (const provider of Object.keys(keysMap)) {
    if (!sortedProviders.includes(provider) && keysMap[provider].length > 0) sortedProviders.push(provider);
  }

  let total = 0;
  clearNode(container);

  if (sortedProviders.length === 0) {
    const emptyState = window.hexRenderUtils.createEl('div');
    emptyState.style.color = 'var(--orange)';
    emptyState.style.textAlign = 'center';
    emptyState.style.padding = '20px';
    emptyState.appendChild(window.hexRenderUtils.createEl('div', { text: 'No live providers detected yet.' }));
    emptyState.appendChild(window.hexRenderUtils.createEl('div', { text: 'Hunter sync is online, but no usable keys are loaded.' }));
    container.appendChild(emptyState);
  } else {
    sortedProviders.forEach((provider) => {
      const count = keysMap[provider].length;
      total += count;
      const isActive = provider === activeProvider;
      const manualCount = (_lastManualKeysMap[provider] || []).length;
      const row = window.hexRenderUtils.createEl('div', {
        dataset: { liveProvider: provider }
      });
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr auto';
      row.style.gap = '4px 12px';
      row.style.padding = '8px 10px';
      row.style.borderBottom = '1px solid var(--border)';
      row.style.cursor = 'pointer';
      row.style.transition = 'background .15s';
      row.style.borderLeft = isActive ? '3px solid var(--cyan)' : '3px solid transparent';
      row.style.background = isActive ? 'rgba(0,255,200,0.06)' : '';

      const title = window.hexRenderUtils.createEl('div', {
        text: getProviderLabel(provider)
      });
      title.style.color = isActive ? 'var(--cyan)' : 'var(--text)';
      if (isActive) title.textContent += '  ACTIVE';

      const stats = window.hexRenderUtils.createEl('div', {
        text: `${count} live key${count === 1 ? '' : 's'}${manualCount ? ` • ${manualCount} manual` : ''}`
      });
      stats.style.color = 'var(--muted)';
      stats.style.fontSize = '12px';

      const badge = window.hexRenderUtils.createEl('div', {
        text: count > 0 ? 'READY' : 'EMPTY'
      });
      badge.style.color = count > 0 ? '#00ffc8' : 'var(--muted)';
      badge.style.textShadow = count > 0 ? '0 0 5px #00ffc8' : 'none';
      badge.style.alignSelf = 'center';
      badge.style.gridRow = '1 / span 2';
      badge.style.gridColumn = '2';

      row.appendChild(title);
      row.appendChild(stats);
      row.appendChild(badge);
      container.appendChild(row);
    });
  }

  countEl.textContent = total;
  updateProviderUI();
}

function renderManualKeyList(manualKeysMap) {
  const container = document.getElementById('manual-key-list');
  if (!container) return;
  clearNode(container);

  const providers = Object.keys(manualKeysMap || {}).filter((provider) => Array.isArray(manualKeysMap[provider]) && manualKeysMap[provider].length > 0);
  if (providers.length === 0) {
    const empty = window.hexRenderUtils.createEl('div', { text: 'No manual keys added yet.' });
    empty.style.color = 'var(--muted)';
    empty.style.fontSize = '13px';
    container.appendChild(empty);
    return;
  }

  providers.sort((a, b) => a.localeCompare(b));
  providers.forEach((provider) => {
    (manualKeysMap[provider] || []).forEach((apiKey) => {
      const row = window.hexRenderUtils.createEl('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '6px 8px';
      row.style.border = '1px solid rgba(255,255,255,0.08)';
      row.style.background = 'rgba(0,0,0,0.12)';

      const label = window.hexRenderUtils.createEl('span', {
        text: `${getProviderLabel(provider)}  ${maskApiKey(apiKey)}`
      });
      label.style.fontFamily = 'var(--font-m)';
      label.style.fontSize = '12px';

      const removeBtn = window.hexRenderUtils.createEl('button', {
        text: 'REMOVE',
        dataset: { manualKeyProvider: provider, manualKeyValue: apiKey }
      });
      removeBtn.className = 'text-btn';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.color = 'var(--orange)';
      removeBtn.style.background = 'transparent';
      removeBtn.style.border = '0';
      removeBtn.style.padding = '0';
      removeBtn.style.font = 'inherit';

      row.appendChild(label);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  });
}

async function addManualApiKey() {
  const input = document.getElementById('cfg-manual-api-key');
  const statusEl = document.getElementById('manual-key-status');
  const apiKey = String(input?.value || '').trim();
  if (!apiKey) {
    if (statusEl) statusEl.textContent = 'Paste an API key first.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Detecting provider and registering key...';
  try {
    const res = await window.hexAPI.addManualApiKey({ apiKey });
    if (!res?.success) throw new Error(res?.error || 'Could not add API key.');
    _lastLiveKeysMap = res.keys || {};
    _lastManualKeysMap = res.manualKeys || {};
    syncProviderOptions(_lastLiveKeysMap);
    renderLiveArsenal(_lastLiveKeysMap);
    renderManualKeyList(_lastManualKeysMap);
    input.value = '';
    if (statusEl) statusEl.textContent = `${getProviderLabel(res.provider)} key added.`;
    selectLiveProvider(res.provider);
    setTimeout(() => { fetchAvailableModels().catch(() => {}); }, 150);
  } catch (error) {
    if (statusEl) statusEl.textContent = '⚠ ' + (error?.message || String(error));
  }
}

async function removeManualApiKey(provider, apiKey) {
  const statusEl = document.getElementById('manual-key-status');
  if (statusEl) statusEl.textContent = 'Removing manual key...';
  try {
    const res = await window.hexAPI.removeManualApiKey({ provider, apiKey });
    if (!res?.success) throw new Error(res?.error || 'Could not remove API key.');
    _lastLiveKeysMap = res.keys || {};
    _lastManualKeysMap = res.manualKeys || {};
    renderLiveArsenal(_lastLiveKeysMap);
    renderManualKeyList(_lastManualKeysMap);
    if (statusEl) statusEl.textContent = `${getProviderLabel(provider)} key removed.`;
  } catch (error) {
    if (statusEl) statusEl.textContent = '⚠ ' + (error?.message || String(error));
  }
}
function selectLiveProvider(providerName) {
  const sel = document.getElementById('cfg-provider');
  if (sel) {
    ensureProviderOption(sel, providerName);
    sel.value = providerName;
    updateProviderUI();
  }
  renderLiveArsenal(_lastLiveKeysMap);
}

// Auto-sync provider dropdown to the best available provider and auto-fetch models
async function autoSyncProvider() {
  try {
    const res = await window.hexAPI.refreshLiveKeys();
    if (!res || !res.success) return;
    _lastLiveKeysMap = res.keys || {};
    _lastManualKeysMap = res.manualKeys || {};
    syncProviderOptions(_lastLiveKeysMap);
    renderManualKeyList(_lastManualKeysMap);

    const sel = document.getElementById('cfg-provider');
    const current = sel?.value || 'none';
    const hasKey = current === 'ollama' || (_lastLiveKeysMap[current] && _lastLiveKeysMap[current].length > 0);
    if ((!hasKey && current !== 'ollama') || current === 'none') {
      const best = getPreferredProviderFromKeys(_lastLiveKeysMap);
      if (best && sel) {
        ensureProviderOption(sel, best);
        sel.value = best;
        updateProviderUI();
      }
    }

    setTimeout(() => {
      const provider = document.getElementById('cfg-provider')?.value;
      if (provider && provider !== 'none') {
        fetchAvailableModels().catch(() => {});
      }
    }, 300);
  } catch (_) { }
}

// Hook IPC continuous updater for hot-reloads
window.hexAPI.on('ai:live-keys-updated', (keys) => {
  _lastLiveKeysMap = keys || {};
  syncProviderOptions(_lastLiveKeysMap);
  renderLiveArsenal(_lastLiveKeysMap);
  renderManualKeyList(_lastManualKeysMap);
});

window.addEventListener('click', (event) => {
  const providerRow = event.target.closest('[data-live-provider]');
  if (providerRow) {
    selectLiveProvider(providerRow.dataset.liveProvider);
    return;
  }
  const modelToggle = event.target.closest('[data-model-picker-toggle]');
  if (modelToggle) {
    renderModelPicker(modelToggle.dataset.modelPickerToggle !== 'free');
    return;
  }
  const removeBtn = event.target.closest('[data-manual-key-provider][data-manual-key-value]');
  if (removeBtn) {
    removeManualApiKey(removeBtn.dataset.manualKeyProvider, removeBtn.dataset.manualKeyValue);
  }
});

document.getElementById('cfg-cloud-test')?.addEventListener('click', testCloudConnection);




















