'use strict';
// ── voice.js — HEX Voice Engine ──────────────────────────────────────────────
//
// Priority order:
//   STT: 1. Local Whisper (offline, all languages)  2. Web Speech API (online)
//   TTS: 1. Local Piper   (offline, all languages)  2. Web Speech API (online)
//                                                    3. Google Cloud TTS (key required)

class HexVoice {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.continuous = false;
    this.langCode = 'en-US';
    this._sttLang = 'en';
    this.wakeWord = 'hey hex';
    this.wakeWordMode = false;
    this.onTranscript = null;
    this.onStateChange = null;
    this.onWakeWord = null;
    this.onVoicesLoaded = null;
    this._onError = null;
    this.synthesis = window.speechSynthesis;
    this._supported = false;
    this._selectedVoice = null;
    this._voiceName = '';
    this._voices = [];
    this._networkErrCount = 0;
    this._gcloudKey = '';
    this._gcloudVoice = 'ka-GE-Standard-A';
    this._useGCloud = false;
    this._localSTT = false;
    this._localTTS = {};
    this._ttsEngine = 'os';   // 'local' | 'os'
    this._localVoiceLang = 'en'; // which Piper voice to use
    this._localSpeed = 1.0;
    this._audioCtx = null;
    this._currentSource = null;
    this._mediaRecorder = null;
    this._audioChunks = [];

    if (this.synthesis) {
      this.synthesis.onvoiceschanged = () => this._loadVoices();
      setTimeout(() => this._loadVoices(), 200);
    }
    this._checkLocalEngines();
  }

  init(config = {}) {
    this.wakeWord = (config.wakeWord || 'hey hex').toLowerCase();
    this.wakeWordMode = config.wakeWordMode === true;
    this._voiceName = config.voiceName || '';
    this._gcloudKey = config.gcloudTtsKey || '';
    this._useGCloud = !!this._gcloudKey;
    this._gcloudVoice = config.gcloudVoice || 'ka-GE-Standard-A';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) { this._supported = true; this._buildRecognition(); }
    this._applyVoiceName(this._voiceName);
    return true;
  }

  async _checkLocalEngines() {
    try {
      const s = await window.hexAPI.voice.status();
      if (s.available) {
        this._localSTT = s.sttReady || false;
        this._localTTS = s.ttsReady || {};
      }
    } catch (_) { }
  }

  setGCloudKey(key) { this._gcloudKey = key || ''; this._useGCloud = !!key; }

  getGeorgianGCloudVoices() {
    return [
      { name: 'ka-GE-Standard-A', gender: 'Female', type: 'Standard' },
      { name: 'ka-GE-Standard-B', gender: 'Male', type: 'Standard' },
      { name: 'ka-GE-Wavenet-A', gender: 'Female', type: 'WaveNet (best quality)' },
      { name: 'ka-GE-Wavenet-B', gender: 'Male', type: 'WaveNet (best quality)' },
    ];
  }

  async _speakGCloud(text, opts = {}) {
    if (!this._gcloudKey) throw new Error('No Google Cloud TTS key');
    const voiceName = opts.gcVoice || this._gcloudVoice || 'ka-GE-Standard-A';
    const langCode = voiceName.substring(0, 5);
    const res = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + this._gcloudKey,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: langCode, name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: opts.rate || 1.0, pitch: opts.pitch ? (opts.pitch - 1) * 10 : 0 }
        })
      }
    );
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error('GCloud TTS ' + res.status + ': ' + (e.error?.message || res.statusText)); }
    const data = await res.json();
    const raw = atob(data.audioContent);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    await this._playArrayBuffer(bytes.buffer);
  }

  async _speakLocal(text, lang) {
    const result = await window.hexAPI.voice.synthesize(text, lang, this._localSpeed ?? 1.0);
    const samples = result.samples;
    const float32 = new Float32Array(
      samples.buffer instanceof ArrayBuffer ? samples.buffer : new Uint8Array(Object.values(samples)).buffer
    );
    const ctx = this._getAudioCtx();
    const buf = ctx.createBuffer(1, float32.length, result.sampleRate);
    buf.getChannelData(0).set(float32);
    if (this._currentSource) { try { this._currentSource.stop(); } catch (_) { } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    this._currentSource = src; src.start(0);
  }

  async _playArrayBuffer(arrayBuffer) {
    const ctx = this._getAudioCtx();
    const buf = await ctx.decodeAudioData(arrayBuffer);
    if (this._currentSource) { try { this._currentSource.stop(); } catch (_) { } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    this._currentSource = src; src.start(0);
  }

  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed')
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return this._audioCtx;
  }

  async speak(text, opts = {}) {
    if (!text) return;
    const clean = text.replace(/\[ACTION:[^\]]+\]/g, '').replace(/[*_`#]/g, '').replace(/\n+/g, ' ').trim();
    if (!clean) return;
    const lang = this._sttLang || 'en';

    // Use local Piper if engine is set to 'local', regardless of current STT lang
    const ttsLang = this._ttsEngine === 'local' ? (this._localVoiceLang || lang) : lang;
    if (this._ttsEngine === 'local') {
      // For custom IDs like 'en:vasco', check if base lang has models; always try local when engine is set to 'local'
      const baseLang = ttsLang.includes(':') ? ttsLang.split(':')[0] : ttsLang;
      const hasLocal = this._localTTS?.[ttsLang] || this._localTTS?.[baseLang];
      if (hasLocal || ttsLang.includes(':')) {
        try { await this._speakLocal(clean, ttsLang); return; }
        catch (e) {
          console.warn('Local TTS failed:', e.message);
          // Fall through to OS voices
        }
      }
    }
    if (this._useGCloud && this._gcloudKey) {
      try { await this._speakGCloud(clean, { gcVoice: opts.gcVoice || this._gcloudVoice, rate: opts.rate ?? 1.0, pitch: opts.pitch ?? 1.0 }); return; }
      catch (e) { console.warn('GCloud TTS failed:', e.message); }
    }
    if (!this.synthesis) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = opts.lang || this.langCode; utt.rate = opts.rate ?? 0.95; utt.pitch = opts.pitch ?? 0.85; utt.volume = opts.volume ?? 0.9;
    const best = this._selectedVoice
      || this._voices.find(v => v.lang === utt.lang)
      || this._voices.find(v => v.lang.startsWith(utt.lang.split('-')[0]))
      || null;
    if (best) utt.voice = best;
    this.synthesis.cancel(); this.synthesis.speak(utt);
  }

  stopSpeaking() {
    this.synthesis?.cancel();
    if (this._currentSource) { try { this._currentSource.stop(); } catch (_) { } this._currentSource = null; }
  }

  // ── Local Whisper STT via MediaRecorder ───────────────────────
  async _startLocalSTT() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      this._audioChunks = [];
      this._mediaRecorder = new MediaRecorder(stream);
      this._mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this._audioChunks.push(e.data); };
      this._mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!this.isListening) return;
        try {
          const blob = new Blob(this._audioChunks, { type: 'audio/webm' });
          const arrBuf = await blob.arrayBuffer();
          const ctx = this._getAudioCtx();
          const decoded = await ctx.decodeAudioData(arrBuf);
          let pcm;
          if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
            pcm = decoded.getChannelData(0);
          } else {
            const offCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
            const src = offCtx.createBufferSource(); src.buffer = decoded; src.connect(offCtx.destination); src.start(0);
            pcm = (await offCtx.startRendering()).getChannelData(0);
          }
          const buf = new Uint8Array(pcm.buffer);
          const { text } = await window.hexAPI.voice.transcribe(buf, this._sttLang || 'en');
          if (text && text.trim()) {
            const lower = text.toLowerCase().trim();
            if (this.wakeWordMode) {
              if (lower.includes(this.wakeWord)) {
                this.onWakeWord?.();
                const after = lower.replace(this.wakeWord, '').trim();
                if (after) this.onTranscript?.(after, true);
              }
            } else {
              this.onTranscript?.(text.trim(), true);
            }
          }
        } catch (e) { console.warn('Local STT error:', e.message); }
        if (this.isListening && this.continuous) this._recordCycle();
      };
      this._recordCycle();
      return true;
    } catch (e) {
      this._onError?.('Microphone access denied. Please allow microphone in system settings.');
      this.isListening = false; this.onStateChange?.(false);
      return false;
    }
  }

  _recordCycle() {
    if (!this.isListening || !this._mediaRecorder) return;
    this._audioChunks = [];
    try {
      this._mediaRecorder.start();
      setTimeout(() => { if (this._mediaRecorder?.state === 'recording') this._mediaRecorder.stop(); }, 5000);
    } catch (e) { console.warn('Record cycle error:', e.message); }
  }

  // ── Web Speech API (online fallback) ──────────────────────────
  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    this.recognition = new SR();
    this.recognition.continuous = true; this.recognition.interimResults = true; this.recognition.maxAlternatives = 1;
    this.recognition.lang = this._sttLang === 'ru' ? 'ru-RU' : 'en-US';
    this.recognition.onresult = (e) => {
      this._networkErrCount = 0;
      let finalText = '', interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interimText += t;
      }
      if (interimText) this.onTranscript?.(interimText, false);
      if (finalText) {
        const lower = finalText.toLowerCase().trim();
        if (this.wakeWordMode) {
          if (lower.includes(this.wakeWord)) { this.onWakeWord?.(); const a = lower.replace(this.wakeWord, '').trim(); if (a) this.onTranscript?.(a, true); }
        } else { this.onTranscript?.(finalText.trim(), true); }
      }
    };
    this.recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.isListening = false; this.onStateChange?.(false);
      if (e.error === 'not-allowed') { this._networkErrCount = 0; this._onError?.('Microphone permission denied. Click mic to retry.'); return; }
      if (e.error === 'network') {
        this._networkErrCount++;
        if (this._networkErrCount > 3) { this._networkErrCount = 0; this._onError?.('Google speech servers unreachable. Install local voice models (Settings → Voice Models) for offline use.'); return; }
        setTimeout(() => { if (this.continuous) { this._buildRecognition(); this._startWebSpeech(); } }, this._networkErrCount * 2000);
        return;
      }
      this._onError?.('Voice error: ' + e.error);
    };
    this.recognition.onend = () => {
      if (this.continuous && this.isListening) { try { this.recognition.start(); } catch (_) { } }
      else { this.isListening = false; this.onStateChange?.(false); }
    };
  }

  _startWebSpeech() {
    if (!this.recognition) return false;
    try { this.recognition.lang = this._sttLang === 'ru' ? 'ru-RU' : 'en-US'; this.recognition.start(); return true; }
    catch (e) { this._onError?.('Could not start mic: ' + (e?.message || String(e))); this.isListening = false; return false; }
  }

  async startListening(continuous = true) {
    if (this.isListening) return;
    this.continuous = continuous; this.isListening = true;
    this.onStateChange?.(true);
    await this._checkLocalEngines();
    if (this._localSTT) {
      const ok = await this._startLocalSTT();
      if (ok) return;
    }
    if (!this._supported) {
      this._onError?.('No speech engine available. Download local models: Settings → Voice Models.');
      this.isListening = false; this.onStateChange?.(false); return;
    }
    this._startWebSpeech();
  }

  stopListening() {
    this.continuous = false; this.isListening = false;
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') try { this._mediaRecorder.stop(); } catch (_) { }
    this._mediaRecorder = null;
    if (this.recognition) try { this.recognition.stop(); } catch (_) { }
    this.onStateChange?.(false);
  }

  toggleListening() { if (this.isListening) this.stopListening(); else this.startListening(true); }

  _loadVoices() {
    const all = this.synthesis?.getVoices?.() || [];
    if (!all.length) return;
    this._voices = all; this._applyVoiceName(this._voiceName); this.onVoicesLoaded?.(all);
  }
  getVoices() { return this._voices; }
  getVoicesSorted(lc) {
    const l = lc || this.langCode, b = l.split('-')[0];
    return [...this._voices.filter(v => v.lang === l), ...this._voices.filter(v => v.lang.startsWith(b) && v.lang !== l), ...this._voices.filter(v => !v.lang.startsWith(b))];
  }
  setVoiceByName(name) { this._voiceName = name; this._applyVoiceName(name); }
  _applyVoiceName(name) { if (!name || !this._voices.length) { this._selectedVoice = null; return; } this._selectedVoice = this._voices.find(v => v.name === name) || null; }

  setLanguage(lang) {
    const tts = { en: 'en-US', ru: 'ru-RU', ka: 'ka-GE' };
    this.langCode = tts[lang] || 'en-US';
    this._sttLang = lang;
    if (!this._voiceName) this._selectedVoice = null;
    if (this.recognition) {
      const was = this.isListening;
      if (was) this.stopListening();
      if (was) setTimeout(() => this.startListening(true), 300);
    }
    this._checkLocalEngines();
  }

  previewVoice(name) {
    const v = this._voices.find(v => v.name === name);
    if (!v) return;
    const u = new SpeechSynthesisUtterance('Softcurse H.E.X. online. Neural link established.');
    u.voice = v; u.rate = 0.95; u.pitch = 0.85; u.volume = 0.9;
    this.synthesis?.cancel(); this.synthesis?.speak(u);
  }

  async previewGCloud(voiceName, apiKey) {
    const key = apiKey || this._gcloudKey;
    if (!key) throw new Error('No API key provided');
    const sk = this._gcloudKey, sv = this._gcloudVoice;
    this._gcloudKey = key; this._gcloudVoice = voiceName || 'ka-GE-Standard-A';
    try { await this._speakGCloud('სისტემა ჩართულია. ნეირო-კავშირი დამყარებულია.', { gcVoice: voiceName || 'ka-GE-Standard-A' }); }
    finally { this._gcloudKey = sk; this._gcloudVoice = sv; }
  }

  get supported() { return this._supported || this._localSTT; }
  get currentVoiceName() { return this._selectedVoice?.name || ''; }
  get usingGCloud() { return this._useGCloud && !!this._gcloudKey; }
  get usingLocal() { return this._localSTT; }
}

window.hexVoice = new HexVoice();
