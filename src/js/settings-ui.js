'use strict';
// == settings-ui.js == System Settings UI ====================================
// Extracted from renderer.js
const DEFAULT_LOCAL_VOICE_OPTIONS = [
  { value: 'en', label: 'English — lessac-medium' },
  { value: 'ru', label: 'Russian — ruslan-medium' },
  { value: 'ka', label: 'Georgian — natia-medium' }
];

function refreshBrainTelemetryTab() {
  const list = document.getElementById('brain-telemetry-list');
  const summary = document.getElementById('brain-telemetry-summary');
  if (!list || !summary) return;
  clearNode(list);
  const events = window.hexBrainTelemetry?.recent?.(30) || [];
  summary.textContent = events.length
    ? events.length + ' recent brain event' + (events.length === 1 ? '' : 's') + ' captured this session.'
    : 'No route events yet. Send a message to HEX, then return here.';

  if (!events.length) {
    const empty = window.hexRenderUtils.createEl('div', { text: 'No telemetry recorded yet.' });
    empty.style.color = 'var(--muted)';
    empty.style.padding = '12px';
    empty.style.textAlign = 'center';
    list.appendChild(empty);
    return;
  }

  events.slice().reverse().forEach((event) => {
    const card = window.hexRenderUtils.createEl('div');
    card.style.border = '1px solid rgba(0,255,255,0.18)';
    card.style.background = 'rgba(0,0,0,0.18)';
    card.style.padding = '9px 10px';
    card.style.display = 'grid';
    card.style.gap = '5px';

    const head = window.hexRenderUtils.createEl('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';
    head.style.alignItems = 'center';

    const title = window.hexRenderUtils.createEl('strong', {
      text: String(event.phase || 'brain').toUpperCase() + ' :: ' + (event.route || event.actionDomain || 'unknown')
    });
    title.style.color = event.providerRequired ? 'var(--orange)' : 'var(--cyan)';
    title.style.fontFamily = 'var(--font-d)';
    title.style.letterSpacing = '0.06em';

    const time = window.hexRenderUtils.createEl('span', { text: event.at ? new Date(event.at).toLocaleTimeString() : '--' });
    time.style.color = 'var(--muted)';
    time.style.fontFamily = 'var(--font-m)';
    time.style.fontSize = '12px';

    head.appendChild(title);
    head.appendChild(time);
    card.appendChild(head);

    const user = window.hexRenderUtils.createEl('div', { text: 'User: ' + (event.user || '—') });
    user.style.color = 'var(--text)';
    user.style.fontSize = '13px';
    user.style.wordBreak = 'break-word';
    card.appendChild(user);

    const meta = [
      'reason=' + (event.reason || 'none'),
      'surface=' + (event.actionSurface || 'chat'),
      'urgency=' + (event.actionUrgency || 'normal'),
      'provider=' + (event.providerRequired ? 'yes' : 'no'),
      'server=' + (event.serverPacket ? 'yes' : 'no'),
      'mem=' + (event.serverMemoryHits || 0)
    ];
    const details = window.hexRenderUtils.createEl('div', { text: meta.join('  |  ') });
    details.style.color = 'var(--muted)';
    details.style.fontFamily = 'var(--font-m)';
    details.style.fontSize = '12px';
    card.appendChild(details);

    if (event.sources?.length) {
      const sources = window.hexRenderUtils.createEl('div', { text: 'sources: ' + event.sources.join(', ') });
      sources.style.color = 'var(--accent)';
      sources.style.fontSize = '12px';
      card.appendChild(sources);
    }

    list.appendChild(card);
  });
}
window.refreshBrainTelemetryTab = refreshBrainTelemetryTab;

async function refreshBrainDatasetInspector() {
  const summary = document.getElementById('brain-dataset-summary');
  const grid = document.getElementById('brain-dataset-grid');
  const pathEl = document.getElementById('brain-dataset-path');
  if (!summary || !grid || !pathEl) return;
  clearNode(grid);
  summary.textContent = 'Scanning local evolution dataset...';
  pathEl.textContent = '';

  const result = await window.hexAPI?.getFinetuneStats?.();
  if (!result?.success) {
    summary.textContent = 'Dataset scan failed: ' + (result?.error || 'unknown error');
    summary.style.color = 'var(--orange)';
    return;
  }

  const stats = result.stats || {};
  const enoughPositive = Number(stats.good || 0) >= 20;
  const enoughCorrections = Number(stats.fix || 0) >= 10;
  const enoughPreference = Number(stats.preferencePairs || 0) >= 10;
  const readiness = enoughPositive && enoughCorrections && enoughPreference
    ? 'READY FOR LOCAL TRAINING PREP'
    : 'COLLECT MORE GOOD/FIX SIGNALS';

  summary.style.color = enoughPositive && enoughCorrections ? 'var(--cyan)' : 'var(--orange)';
  summary.textContent = stats.exists
    ? readiness + ' · ' + (stats.evolutionRecords || 0) + ' feedback records · ' + (stats.lines || 0) + ' JSONL lines'
    : 'No local evolution dataset yet. Use GOOD / WRONG / FIX on HEX replies to start collecting.';

  const cells = [
    ['GOOD', stats.good || 0, 'positive style/answer samples'],
    ['FIX', stats.fix || 0, 'corrected answers'],
    ['WRONG', stats.wrong || 0, 'negative signals'],
    ['CHAT', stats.chatSamples || 0, 'chat training samples'],
    ['PREF', stats.preferencePairs || 0, 'chosen vs rejected pairs'],
    ['SIZE', Math.round(Number(stats.bytes || 0) / 1024) + ' KB', 'local JSONL size']
  ];

  cells.forEach(([label, value, hint]) => {
    const card = window.hexRenderUtils.createEl('div');
    card.style.border = '1px solid rgba(0,255,255,0.18)';
    card.style.background = 'rgba(0,0,0,0.20)';
    card.style.padding = '9px';
    const title = window.hexRenderUtils.createEl('div', { text: label });
    title.style.color = 'var(--muted)';
    title.style.fontFamily = 'var(--font-d)';
    title.style.fontSize = '11px';
    const num = window.hexRenderUtils.createEl('div', { text: String(value) });
    num.style.color = 'var(--cyan)';
    num.style.fontFamily = 'var(--font-m)';
    num.style.fontSize = '18px';
    num.style.margin = '4px 0';
    const desc = window.hexRenderUtils.createEl('div', { text: hint });
    desc.style.color = 'var(--muted)';
    desc.style.fontSize = '11px';
    card.appendChild(title);
    card.appendChild(num);
    card.appendChild(desc);
    grid.appendChild(card);
  });

  pathEl.textContent = 'Path: ' + (stats.path || 'unknown') + (stats.lastCreatedAt ? ' · Last feedback: ' + new Date(stats.lastCreatedAt).toLocaleString() : '');
}
window.refreshBrainDatasetInspector = refreshBrainDatasetInspector;

function clearNode(node) {
  window.hexRenderUtils.clearNode(node);
}

function updatePerformanceSettingsUI() {
  const mode = document.getElementById('cfg-performance-mode')?.value || 'lite';
  const hint = document.getElementById('performance-mode-hint');
  const localEngine = document.getElementById('cfg-autoollama');
  if (hint) {
    if (mode === 'lite') {
      hint.textContent = 'Lite: cloud/server continuity preferred; Qwen, Whisper, Piper, and inventory scans stay on-demand.';
      hint.style.color = 'var(--cyan)';
    } else if (mode === 'balanced') {
      hint.textContent = 'Balanced: keeps cloud-first behavior, but allows more local helpers when you ask for them.';
      hint.style.color = 'var(--accent)';
    } else {
      hint.textContent = 'Deep Local: local model/voice autostart is allowed if enabled. This can heavily load the laptop.';
      hint.style.color = 'var(--orange)';
    }
  }
  if (localEngine) {
    localEngine.title = mode === 'deep-local'
      ? 'Deep Local can autostart local engines when enabled.'
      : 'Lite/Balanced keep local engines on-demand even if this toggle is enabled.';
  }
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

const AUTO_MODEL_PROVIDERS = new Set(['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate', 'groq', 'openrouter', 'llamacpp']);
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
let _lastCapabilityPacket = null;

function capabilitiesToKeyMap(providers = {}) {
  return Object.fromEntries(Object.entries(providers || {}).map(([provider, capability]) => [
    provider,
    Array(Math.max(0, Number(capability?.validKeys || 0))).fill(null)
  ]));
}
function getCapabilityHealth(packet = _lastCapabilityPacket) {
  if (!packet) return { label: 'OFFLINE', color: 'var(--orange)', detail: 'No provider capability packet loaded yet.' };
  if (packet.stale) return { label: 'STALE', color: 'var(--orange)', detail: 'Using last-known Hunter capability packet while the bridge refreshes.' };
  if (packet.degraded || Number(packet.summary?.degradedProviders || 0) > 0) return { label: 'DEGRADED', color: 'var(--orange)', detail: 'Some providers are invalid, unavailable, or using fallback capability data.' };
  if (Number(packet.summary?.readyProviders || 0) > 0) return { label: 'LIVE', color: 'var(--cyan)', detail: 'Hunter capability packet is fresh and has usable providers.' };
  return { label: 'ONLINE / EMPTY', color: 'var(--muted)', detail: 'Hunter is reachable, but no usable provider keys are currently loaded.' };
}

function getCapabilityForProvider(provider) {
  return _lastCapabilityPacket?.providers?.find((item) => item.provider === provider) || null;
}

function renderCapabilityStateBanner() {
  const banner = document.getElementById('capability-state-banner');
  if (!banner) return;
  const health = getCapabilityHealth();
  const summary = _lastCapabilityPacket?.summary || {};
  banner.style.display = '';
  banner.style.color = health.color;
  banner.style.borderColor = health.color;
  banner.textContent = health.label + ' :: ' + health.detail
    + ' Providers ' + Number(summary.readyProviders || 0) + '/' + Number(summary.totalProviders || 0)
    + ' ready, keys ' + Number(summary.liveKeys || 0)
    + (_lastCapabilityPacket?.source ? ', source ' + _lastCapabilityPacket.source : '');
}

function getProviderStatusBadge(provider, count) {
  const cap = getCapabilityForProvider(provider);
  const status = String(cap?.status || (count > 0 ? 'ready' : 'empty')).toUpperCase();
  const color = status === 'READY'
    ? '#00ffc8'
    : status === 'COOLDOWN'
      ? 'var(--accent)'
      : ['DEGRADED', 'INVALID', 'UNAVAILABLE'].includes(status)
        ? 'var(--orange)'
        : 'var(--muted)';
  return { status, color };
}
function getProviderLabel(provider) {
  return LIVE_PROVIDER_LABELS[provider] || String(provider || '').trim().toUpperCase();
}

function getPreferredProviderFromKeys(keysMap) {
  return Object.keys(keysMap).find((provider) => provider !== 'ollama' && keysMap[provider]?.length > 0) || 'ollama';
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

function ensureProviderOption(selectEl, provider) {
  if (!selectEl || !provider) return;
  const existing = [...selectEl.options].find((option) => option.value === provider);
  const count = (_lastLiveKeysMap[provider] || []).length;
  const label = provider === 'ollama'
    ? '🖥 Ollama (Local / Free)'
    : provider === 'llamacpp'
      ? '🧠 llama.cpp / GGUF (Local)'
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
  ensureProviderOption(sel, 'llamacpp');
  for (const provider of Object.keys(keysMap)) ensureProviderOption(sel, provider);
}

function getSelectedProviderStatus(provider) {
  if (provider === 'ollama') return 'Local Ollama provider is available when Ollama is running.';
  if (provider === 'llamacpp') return 'Local llama.cpp GGUF provider. Start llama.cpp server on the configured Base URL.';
  const count = (_lastLiveKeysMap[provider] || []).length;
  const cap = _lastCapabilityPacket?.providers?.find((item) => item.provider === provider);
  const packetNote = _lastCapabilityPacket?.stale
    ? ' Capability packet is stale.'
    : (_lastCapabilityPacket?.degraded ? ' Capability packet is degraded.' : '');
  if (count > 0) return count + ' live key' + (count === 1 ? '' : 's') + ' available for ' + getProviderLabel(provider) + '.' + packetNote;
  if (cap?.status && cap.status !== 'ready') return getProviderLabel(provider) + ' status: ' + cap.status + '.' + packetNote;
  return getProviderLabel(provider) + ' has no live keys yet. HEX will fall back automatically.' + packetNote;
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
    if (cloudTokenEl) { cloudTokenEl.value = ''; cloudTokenEl.placeholder = cfg.cloud?.hasAccessToken ? 'Token configured - enter to replace' : ''; }
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
  const perf = cfg.performance || {};
  const perfModeEl = document.getElementById('cfg-performance-mode');
  const perfVoiceEl = document.getElementById('cfg-performance-voice');
  const perfTtsEl = document.getElementById('cfg-performance-local-tts');
  const perfAwarenessEl = document.getElementById('cfg-performance-awareness');
  if (perfModeEl) perfModeEl.value = perf.mode || 'lite';
  if (perfVoiceEl) perfVoiceEl.value = String(perf.continuousVoice === true);
  if (perfTtsEl) perfTtsEl.value = String(perf.localTts === true);
  if (perfAwarenessEl) perfAwarenessEl.value = perf.awareness || 'on-demand';
  updatePerformanceSettingsUI();

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
  if (gcKeyEl) { gcKeyEl.value = ''; gcKeyEl.placeholder = cfg.voice?.hasGcloudTtsKey ? 'Key configured - enter to replace' : ''; }
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
  renderCapabilityStateBanner();
  // Start on the requested tab
  switchSettingsTab(targetTab);
  // Auto-show voice status info when general is loaded (shows in voice tab when switched)
  // Pre-populate personality active display
  updatePersonaBadge();
  refreshPersonaList();
  refreshBrainTelemetryTab();
  await refreshBrainDatasetInspector();
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

  const enteredAccessToken = (document.getElementById('cfg-cloud-token')?.value || '').trim();
  const serverUrl = (document.getElementById('cfg-cloud-url')?.value || '').trim();
  const draftConfig = {
    ...config,
    cloud: {
      ...(config.cloud || {}),
      enabled,
      serverUrl,
      accessToken: enteredAccessToken,
    }
  };

  const prevConfig = config;
  config = draftConfig;
  window._hexConfig = draftConfig;
  if (enteredAccessToken) {
    if (!window.hexAPI.cloud?.saveAccessToken) throw new Error('Desktop bridge is missing cloud token save support. Restart or rebuild HEX.');
    const tokenSave = await window.hexAPI.cloud.saveAccessToken({ accessToken: enteredAccessToken, enabled, serverUrl });
    if (!tokenSave?.success) throw new Error(tokenSave?.error || 'Failed to save cloud access token');
    if (tokenSave.cloud?.hasAccessToken !== true) throw new Error('Cloud token save returned without a stored token flag.');
    draftConfig.cloud = { ...(draftConfig.cloud || {}), ...(tokenSave.cloud || {}) };
  }
  const savedDraft = await window.hexAPI.setConfig(draftConfig);
  if (savedDraft?.cloud) {
    draftConfig.cloud = { ...(draftConfig.cloud || {}), ...savedDraft.cloud };
    config.cloud = draftConfig.cloud;
    window._hexConfig.cloud = draftConfig.cloud;
  }

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

    const capabilityResult = await window.hexAPI.getProviderCapabilities({ force: true });
    if (!capabilityResult?.success) {
      throw new Error(capabilityResult?.error || 'Hunter capability refresh failed');
    }
    const packet = capabilityResult.capabilities || {};
    const providerCount = Number(packet.summary?.totalProviders || packet.providers?.length || 0);
    const totalKeys = (packet.providers || []).reduce((sum, item) => sum + Number(item.totalKeys || 0), 0);
    const validKeys = Number(packet.summary?.liveKeys || 0);

    statusEl.textContent = `Online: ${health.service || 'hex-server'} | Hunter bridge OK | Providers: ${providerCount} | Keys: ${validKeys}/${totalKeys} valid`;
    statusEl.style.color = 'var(--green)';
  } catch (error) {
    statusEl.textContent = 'Cloud/Hunter check failed: ' + error.message;
    statusEl.style.color = 'var(--orange)';
  } finally {
    const cloudStatus = await window.hexAPI.cloud.status().catch(() => null);
    if (cloudStatus) {
      draftConfig.cloud = {
        ...(draftConfig.cloud || {}),
        enabled: cloudStatus.enabled === true,
        serverUrl: cloudStatus.serverUrl || draftConfig.cloud?.serverUrl || '',
        hasAccessToken: cloudStatus.hasAccessToken === true,
        profileId: cloudStatus.profileId || draftConfig.cloud?.profileId || '',
        sessionId: cloudStatus.sessionId || draftConfig.cloud?.sessionId || '',
        deviceId: cloudStatus.deviceId || draftConfig.cloud?.deviceId || ''
      };
    }
    config = draftConfig;
    window._hexConfig = draftConfig;
    if (prevConfig !== draftConfig) {
      const saved = await window.hexAPI.setConfig(draftConfig);
      if (saved?.cloud) {
        config.cloud = { ...(config.cloud || {}), ...saved.cloud };
        window._hexConfig.cloud = config.cloud;
      }
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
  if (baseUrlGroup) baseUrlGroup.style.display = (p === 'ollama' && autoOllamaEnabled) || p === 'llamacpp' ? '' : 'none';

  const providerHint = document.getElementById('provider-auto-hint');
  if (providerHint) providerHint.textContent = getSelectedProviderStatus(p);

  const mh = document.getElementById('model-hint');
  if (mh) mh.textContent = p === 'ollama' ? 'Local models come from your Ollama server.' : p === 'llamacpp' ? 'Local GGUF model served by llama.cpp. Default: Qwen3-8B-Q4_K_M.' : 'Models are discovered automatically from the selected provider key.';

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

  if (provider === 'ollama' || provider === 'llamacpp') {
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

  let discoveredModels = [];
  try {
    const response = await window.hexAPI.getProviderCapabilities();
    const capability = response?.capabilities?.providers?.find((item) => item.provider === provider);
    discoveredModels = (capability?.models || []).map((id) => ({ id, free: false }));
  } catch (_) { }

  if (!discoveredModels.length) {
    statusEl.textContent = 'No model inventory reported for ' + getProviderLabel(provider) + ' yet.';
    statusEl.style.display = '';
    btn.textContent = 'FETCH';
    btn.disabled = false;
    return;
  }

  _allFetchedModels = discoveredModels;
  setModelSelectOptions(_allFetchedModels, modelInput?.value || '');
  renderModelPicker(false);
  statusEl.textContent = _allFetchedModels.length + ' models detected for ' + getProviderLabel(provider) + '.';
  statusEl.style.display = '';
  btn.textContent = 'FETCH';
  btn.disabled = false;
  renderProviderFailurePanel();
}

function renderModelPicker(freeOnly) {
  const picker = document.getElementById('model-picker');
  const statusEl = document.getElementById('model-fetch-status');
  const mi = document.getElementById('cfg-model');

  const list = freeOnly ? _allFetchedModels.filter(m => m.free) : _allFetchedModels;
  const freeCount = _allFetchedModels.filter(m => m.free).length;
  const allCount = _allFetchedModels.length;

  // Auto-fill if input is blank or a bare provider name
  const bare = ['gemini', 'grok', 'openai', 'anthropic', 'mistral', 'groq', 'ollama', 'llamacpp', 'together', 'cohere', 'openrouter'];
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
      ggufPath: config.llm?.ggufPath || 'models/qwen3/Qwen3-8B-Q4_K_M.gguf',
      apiKey: '',
      apiKeys: config.llm?.apiKeys || {},
      manualApiKeys: config.llm?.manualApiKeys || {},
      visionApiKey: document.getElementById('cfg-visionkey')?.value || '',
      hunterLimitMinutes: config.llm?.hunterLimitMinutes || 1440
    },
    browser: {
      searchEngine: document.getElementById('cfg-searchengine')?.value || 'google'
    },
    performance: {
      ...(config.performance || {}),
      mode: document.getElementById('cfg-performance-mode')?.value || 'lite',
      localModelAutostart: (document.getElementById('cfg-performance-mode')?.value || 'lite') === 'deep-local' && document.getElementById('cfg-autoollama')?.value === 'true',
      continuousVoice: document.getElementById('cfg-performance-voice')?.value === 'true',
      localTts: document.getElementById('cfg-performance-local-tts')?.value === 'true',
      awareness: document.getElementById('cfg-performance-awareness')?.value || 'on-demand'
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

  const enteredCloudAccessToken = (document.getElementById('cfg-cloud-token')?.value || '').trim();
  const prevLang = config.language;
  // Merge personalities into config before saving
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...newCfg, ...pcfg };
  window._hexConfig = config;
  if (enteredCloudAccessToken) {
    if (!window.hexAPI.cloud?.saveAccessToken) throw new Error('Desktop bridge is missing cloud token save support. Restart or rebuild HEX.');
    const tokenSave = await window.hexAPI.cloud.saveAccessToken({
      accessToken: enteredCloudAccessToken,
      enabled: config.cloud?.enabled === true,
      serverUrl: config.cloud?.serverUrl || ''
    });
    if (!tokenSave?.success) throw new Error(tokenSave?.error || 'Failed to save cloud access token');
    if (tokenSave.cloud?.hasAccessToken !== true) throw new Error('Cloud token save returned without a stored token flag.');
    config.cloud = { ...(config.cloud || {}), ...(tokenSave.cloud || {}) };
    window._hexConfig.cloud = config.cloud;
  }
  const savedConfig = await window.hexAPI.setConfig(config);
  if (savedConfig?.cloud) {
    config.cloud = { ...(config.cloud || {}), ...savedConfig.cloud };
    window._hexConfig.cloud = config.cloud;
    const cloudTokenEl = document.getElementById('cfg-cloud-token');
    if (cloudTokenEl) {
      cloudTokenEl.value = '';
      cloudTokenEl.placeholder = config.cloud?.hasAccessToken ? 'Token configured - enter to replace' : '';
    }
  }
  window.hexAI.configure(config);
  window.hexVoice.wakeWord = config.voice.wakeWord;
  window.hexVoice.setVoiceByName(config.voice.voiceName);
  window.hexVoice._ttsEngine = (config.voice.ttsEngine === 'local' && !window.hexPerformancePolicy?.allowLocalTts?.()) ? 'os' : (config.voice.ttsEngine || 'os');
  window.hexVoice._localVoiceLang = config.voice.localVoiceLang || 'en';
  window.hexVoice._localSpeed = config.voice.localSpeed ?? 1.0;
  window.hexVoice._gcloudKey = '';
  window.hexVoice._useGCloud = config.voice.hasGcloudTtsKey === true;
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
    const res = await window.hexAPI.getProviderCapabilities();
    if (res && res.success) {
      _lastCapabilityPacket = res.capabilities || null;
      _lastLiveKeysMap = capabilitiesToKeyMap(res.providers);
      _lastManualKeysMap = res.manualKeys || {};
      syncProviderOptions(_lastLiveKeysMap);
      renderLiveArsenal(_lastLiveKeysMap);
      renderCapabilityStateBanner();
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
  const sortedProviders = Object.keys(keysMap).filter((provider) => keysMap[provider]?.length > 0);
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

      const providerBadge = getProviderStatusBadge(provider, count);
      const badge = window.hexRenderUtils.createEl('div', {
        text: providerBadge.status
      });
      badge.style.color = providerBadge.color;
      badge.style.textShadow = providerBadge.status === 'READY' ? '0 0 5px #00ffc8' : 'none';
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
  renderCapabilityStateBanner();
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
    (manualKeysMap[provider] || []).forEach((keyEntry) => {
      const row = window.hexRenderUtils.createEl('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '6px 8px';
      row.style.border = '1px solid rgba(255,255,255,0.08)';
      row.style.background = 'rgba(0,0,0,0.12)';

      const label = window.hexRenderUtils.createEl('span', {
        text: getProviderLabel(provider) + '  ' + (keyEntry.masked || 'configured')
      });
      label.style.fontFamily = 'var(--font-m)';
      label.style.fontSize = '12px';

      const removeBtn = window.hexRenderUtils.createEl('button', {
        text: 'REMOVE',
        dataset: { manualKeyProvider: provider, manualKeyId: keyEntry.id }
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
    await loadLiveArsenal();
    input.value = '';
    if (statusEl) statusEl.textContent = `${getProviderLabel(res.provider)} key added.`;
    selectLiveProvider(res.provider);
    setTimeout(() => { fetchAvailableModels().catch(() => {}); }, 150);
  } catch (error) {
    if (statusEl) statusEl.textContent = '⚠ ' + (error?.message || String(error));
  }
}

async function removeManualApiKey(provider, keyId) {
  const statusEl = document.getElementById('manual-key-status');
  if (statusEl) statusEl.textContent = 'Removing manual key...';
  try {
    const res = await window.hexAPI.removeManualApiKey({ provider, keyId });
    if (!res?.success) throw new Error(res?.error || 'Could not remove API key.');
    await loadLiveArsenal();
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
    const res = await window.hexAPI.getProviderCapabilities();
    if (!res || !res.success) return;
    _lastCapabilityPacket = res.capabilities || null;
    _lastLiveKeysMap = capabilitiesToKeyMap(res.providers);
    _lastManualKeysMap = res.manualKeys || {};
    syncProviderOptions(_lastLiveKeysMap);
    renderManualKeyList(_lastManualKeysMap);

    const sel = document.getElementById('cfg-provider');
    const current = sel?.value || 'none';
    const hasKey = current === 'ollama' || current === 'llamacpp' || (_lastLiveKeysMap[current] && _lastLiveKeysMap[current].length > 0);
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

// Capability state refreshes when Settings opens or changes.

window.addEventListener('click', (event) => {
  if (event.target.closest('#brain-telemetry-refresh')) { refreshBrainTelemetryTab(); return; }
  if (event.target.closest('#brain-dataset-refresh')) { refreshBrainDatasetInspector(); return; }
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
  const removeBtn = event.target.closest('[data-manual-key-provider][data-manual-key-id]');
  if (removeBtn) {
    removeManualApiKey(removeBtn.dataset.manualKeyProvider, removeBtn.dataset.manualKeyId);
  }
});

document.getElementById('cfg-cloud-test')?.addEventListener('click', testCloudConnection);
document.getElementById('cfg-performance-mode')?.addEventListener('change', updatePerformanceSettingsUI);
document.getElementById('cfg-performance-voice')?.addEventListener('change', updatePerformanceSettingsUI);
document.getElementById('cfg-performance-local-tts')?.addEventListener('change', updatePerformanceSettingsUI);
