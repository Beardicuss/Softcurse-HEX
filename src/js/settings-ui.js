'use strict';
// == settings-ui.js == System Settings UI ====================================
// Extracted from renderer.js
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
    let sttLine;
    if (s.available && s.sttReady)
      sttLine = '<b style="color:var(--cyan)">🎙 Active STT: Local Whisper (offline)</b>';
    else if (isOllama)
      sttLine = '<b style="color:var(--cyan)">🎙 Active STT: Ollama Whisper</b> — run: <code>ollama pull whisper</code>';
    else
      sttLine = '<b style="color:var(--magenta)">⚠ No STT engine — download Whisper below, or set AI provider to Ollama</b>';

    if (!s.available) {
      el.innerHTML = sttLine + '<br><span style="color:var(--muted)">sherpa-onnx not built — run <code>npm run rebuild</code></span>';
      return;
    }
    const stt = s.sttReady ? '✅ Whisper STT' : '❌ Whisper (not downloaded)';
    const en = s.ttsReady?.en ? '✅ TTS EN' : '❌ TTS EN';
    const ru = s.ttsReady?.ru ? '✅ TTS RU' : '❌ TTS RU';
    const ka = s.ttsReady?.ka ? '✅ TTS KA' : '❌ TTS KA';
    el.innerHTML = sttLine + '<br>' + `${stt} &nbsp; ${en} &nbsp; ${ru} &nbsp; ${ka}`;
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

async function openSettings() {
  const cfg = config;
  refreshVoiceStatus();
  document.getElementById('cfg-username').value = cfg.userName || '';
  document.getElementById('cfg-language').value = cfg.language || 'ka';
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

  document.getElementById('cfg-model').value = cfg.llm?.model || '';
  if (document.getElementById('cfg-visionkey')) document.getElementById('cfg-visionkey').value = cfg.llm?.visionApiKey || '';
  if (document.getElementById('cfg-hunter-limit')) document.getElementById('cfg-hunter-limit').value = cfg.llm?.hunterLimitHours || 24;

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
        lvSel.innerHTML = '';
        const byLang = {};
        for (const v of status.voices) {
          if (!byLang[v.lang]) byLang[v.lang] = [];
          byLang[v.lang].push(v);
        }
        const langNames = { en: 'English', ru: 'Russian', ka: 'Georgian' };
        for (const [lang, voices] of Object.entries(byLang)) {
          const group = document.createElement('optgroup');
          group.label = langNames[lang] || lang.toUpperCase();
          for (const v of voices) {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.name}${v.ready ? '' : ' ⚠'}${v.isDefault ? ' ★' : ''}`;
            group.appendChild(opt);
          }
          lvSel.appendChild(group);
        }
      } else {
        // Fallback to defaults
        lvSel.innerHTML = '<option value="en">English — lessac-medium</option><option value="ru">Russian — ruslan-medium</option><option value="ka">Georgian — natia-medium</option>';
      }
    } catch (_) {
      lvSel.innerHTML = '<option value="en">English — lessac-medium</option><option value="ru">Russian — ruslan-medium</option><option value="ka">Georgian — natia-medium</option>';
    }
    lvSel.value = cfg.voice?.localVoiceLang || 'en';
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
  // Always start on General tab
  switchSettingsTab('tab-general');
  // Auto-show voice status info when general is loaded (shows in voice tab when switched)
  // Pre-populate personality active display
  updatePersonaBadge();
  refreshPersonaList();
  loadLiveArsenal(); // Phase 13: Fetch visual live keys immediately
  // Auto-sync provider dropdown to best available from live pool
  autoSyncProvider();
  document.getElementById('settings-overlay').classList.add('open');
}

function populateVoiceSelect(selectedName) {
  const sel = document.getElementById('cfg-voice');
  if (!sel) return;
  const voices = window.hexVoice.getVoicesSorted();
  sel.innerHTML = '<option value="">— Auto (best match for language) —</option>';
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
  const hints = PROVIDER_HINTS[p] || PROVIDER_HINTS.none;

  document.getElementById('cfg-baseurl-group').style.display = p === 'ollama' ? '' : 'none';

  const mh = document.getElementById('model-hint');
  if (mh) mh.textContent = hints.model ? `e.g. ${hints.model}` : '';

  // Update model placeholder
  const mInput = document.getElementById('cfg-model');
  if (mInput && hints.model) mInput.placeholder = hints.model.split('/')[0].trim();
}


let _allFetchedModels = [];  // cache: array of {id, free}

async function fetchAvailableModels() {
  const provider = document.getElementById('cfg-provider').value;
  const baseUrl = document.getElementById('cfg-baseurl').value.trim();
  const statusEl = document.getElementById('model-fetch-status');
  const btn = document.getElementById('fetch-models-btn');
  const picker = document.getElementById('model-picker');

  if (provider === 'none') {
    statusEl.textContent = 'Select a provider first.';
    statusEl.style.display = '';
    return;
  }

  btn.textContent = '⏳ ...';
  btn.disabled = true;
  statusEl.style.display = 'none';
  picker.style.display = 'none';

  // Fetch the real API key from the live pool
  let apiKey = '';
  if (provider !== 'ollama') {
    try {
      const res = await window.hexAPI.getLiveKeys();
      if (res && res.success && res.keys[provider] && res.keys[provider].length > 0) {
        apiKey = res.keys[provider][0];
      }
    } catch (_) { }
    if (!apiKey) {
      statusEl.textContent = `⚠ No valid key for ${provider}. Waiting for background hunter...`;
      statusEl.style.display = '';
      btn.textContent = '⬇ FETCH';
      btn.disabled = false;
      return;
    }
  }

  try {
    _allFetchedModels = await window.hexAI.fetchModels(provider, apiKey, baseUrl);
    renderModelPicker(true);   // default: FREE only
  } catch (err) {
    statusEl.textContent = '⚠ ' + (err?.message || String(err));
    statusEl.style.display = '';
  } finally {
    btn.textContent = '⬇ FETCH';
    btn.disabled = false;
  }
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

  const toggleLabel = freeOnly
    ? `<span onclick="renderModelPicker(false)" style="cursor:pointer;text-decoration:underline;color:var(--accent);">show all ${allCount}</span>`
    : `<span onclick="renderModelPicker(true)"  style="cursor:pointer;text-decoration:underline;color:var(--accent);">free only (${freeCount})</span>`;

  statusEl.innerHTML = `✅ Showing ${list.length} models — click to select &nbsp;|&nbsp; ${toggleLabel}`;
  statusEl.style.display = '';

  if (list.length === 0) {
    picker.innerHTML = '<div style="padding:10px;font-size:14px;color:var(--muted);">No free models found for this provider. Click "show all" above.</div>';
    picker.style.display = 'block';
    return;
  }

  picker.innerHTML = list.map(m => {
    const isActive = m.id === mi.value;
    const freeBadge = m.free
      ? '<span style="margin-left:6px;font-size:13px;padding:1px 5px;background:rgba(0,255,150,.2);color:#0f9;border-radius:3px;vertical-align:middle;">FREE</span>'
      : '';
    return `<div data-model-id="${m.id}"
      onclick="selectModel(this.dataset.modelId)"
      style="padding:7px 10px;cursor:pointer;font-size:14px;font-family:monospace;\n             border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;\n             ${isActive ? 'background:var(--accent);color:#000;' : ''}">
      <span style="flex:1;">${m.id}</span>${freeBadge}
    </div>`;
  }).join('');
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
      // Manual API keys deprecated from UI by Phase 13 automation. Preserving internal signature for local router override/fallback.
      apiKey: '',
      visionApiKey: document.getElementById('cfg-visionkey')?.value || '',
      hunterLimitHours: parseInt(document.getElementById('cfg-hunter-limit')?.value, 10) || 24
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
    }
  };

  const prevLang = config.language;
  // Merge personalities into config before saving
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...newCfg, ...pcfg };
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
  showToast('◆ CONFIG SAVED', 'Settings updated and applied.', '', 3000);
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
    const res = await window.hexAPI.getLiveKeys();
    if (res && res.success) renderLiveArsenal(res.keys);
  } catch (e) {
    console.warn('Failed to load initial live AI arsenal', e);
  }
}

function renderLiveArsenal(keysMap) {
  const container = document.getElementById('ai-live-arsenal');
  const countEl = document.getElementById('ai-pool-count');
  if (!container || !countEl) return;

  const PRIORITY = ['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate'];
  const LABELS = { anthropic: 'ANTHROPIC', openai: 'OPENAI', mistral: 'MISTRAL', together: 'TOGETHER AI', grok: 'GROK (xAI)', gemini: 'GEMINI', cohere: 'COHERE', hf: 'HUGGING FACE', replicate: 'REPLICATE' };
  const activeProvider = document.getElementById('cfg-provider')?.value || '';

  // Sort by priority order, then append any extras
  const sortedProviders = PRIORITY.filter(p => keysMap[p] && keysMap[p].length > 0);
  // Add any other providers not in our list
  for (const p of Object.keys(keysMap)) {
    if (!sortedProviders.includes(p) && keysMap[p].length > 0) sortedProviders.push(p);
  }

  let total = 0;
  let html = '';

  if (sortedProviders.length === 0) {
    html = '<div style="color:var(--orange);text-align:center;padding:20px;">No verified keys found.<br>Background hunter is running...</div>';
  } else {
    for (const p of sortedProviders) {
      const n = keysMap[p].length;
      total += n;
      const isActive = p === activeProvider;
      const activeColor = n > 0 ? '#00ffc8' : 'var(--muted)';
      const borderLeft = isActive ? 'border-left:3px solid var(--cyan);' : 'border-left:3px solid transparent;';
      const bg = isActive ? 'background:rgba(0,255,200,0.06);' : '';
      html += `<div onclick="selectLiveProvider('${p}')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;${borderLeft}${bg}transition:background .15s;" onmouseover="this.style.background='rgba(0,255,200,0.1)'" onmouseout="this.style.background='${isActive ? 'rgba(0,255,200,0.06)' : ''}'">
                 <span>${LABELS[p] || p.toUpperCase()}${isActive ? ' <span style=\"color:var(--cyan);font-size:13px;\">● ACTIVE</span>' : ''}</span>
                 <span style="color:${activeColor};text-shadow:0 0 5px ${activeColor};">${n} valid key${n !== 1 ? 's' : ''}</span>
               </div>`;
    }
  }

  container.innerHTML = html;
  countEl.textContent = total;
}

function selectLiveProvider(providerName) {
  const sel = document.getElementById('cfg-provider');
  if (sel) {
    // Check if the option exists in the dropdown
    const option = [...sel.options].find(o => o.value === providerName);
    if (option) {
      sel.value = providerName;
    } else {
      // Add it dynamically
      const opt = document.createElement('option');
      opt.value = providerName;
      opt.textContent = providerName.toUpperCase();
      sel.appendChild(opt);
      sel.value = providerName;
    }
    updateProviderUI();
  }
  // Re-render to update the active highlight
  loadLiveArsenal();
}

// Auto-sync provider dropdown to the best available provider and auto-fetch models
async function autoSyncProvider() {
  try {
    const res = await window.hexAPI.getLiveKeys();
    if (!res || !res.success) return;
    const PRIORITY = ['anthropic', 'openai', 'mistral', 'together', 'grok', 'gemini', 'cohere', 'hf', 'replicate'];
    const sel = document.getElementById('cfg-provider');
    const current = sel?.value || 'none';

    // If current provider has no key and isn't ollama, auto-switch
    const hasKey = current === 'ollama' || (res.keys[current] && res.keys[current].length > 0);
    if (!hasKey && current !== 'ollama') {
      const best = PRIORITY.find(p => res.keys[p] && res.keys[p].length > 0);
      if (best && sel) {
        sel.value = best;
        updateProviderUI();
      }
    }

    // Auto-fetch models after a short delay (don't block UI)
    setTimeout(() => {
      const provider = document.getElementById('cfg-provider')?.value;
      if (provider && provider !== 'none') {
        fetchAvailableModels();
      }
    }, 300);
  } catch (_) { }
}

// Hook IPC continuous updater for hot-reloads
window.hexAPI.on('ai:live-keys-updated', (keys) => {
  renderLiveArsenal(keys);
});
