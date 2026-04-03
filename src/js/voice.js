'use strict';
// ── voice.js — HEX Voice Engine ──────────────────────────────────────────────
//
// STT: AudioWorklet captures raw 16kHz PCM → main process → Whisper / Ollama
//      No OfflineAudioContext, no decodeAudioData — avoids renderer crashes.
//
// TTS: Local Piper → Google Cloud TTS → OS Web Speech synthesis

class HexVoice {
  constructor() {
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

    // TTS
    this.synthesis = window.speechSynthesis;
    this._selectedVoice = null;
    this._voiceName = '';
    this._voices = [];
    this._gcloudKey = '';
    this._gcloudVoice = 'ka-GE-Standard-A';
    this._useGCloud = false;
    this._ttsEngine = 'os';
    this._localVoiceLang = 'en';
    this._localSpeed = 1.0;
    this._ttsAudioCtx = null;
    this._currentSource = null;

    // STT — AudioWorklet pipeline
    this._sttAudioCtx = null;
    this._micStream = null;
    this._sourceNode = null;
    this._workletNode = null;

    // VAD state — prevents background noise from triggering transcription
    this._vadSpeechBuf = [];       // accumulates frames that contain speech
    this._vadSilence = 0;        // consecutive silent frames after speech
    this._vadActive = false;    // currently collecting a speech segment
    this._lastTranscribe = 0;        // timestamp of last transcription call

    // Local engine
    this._localSTT = false;
    this._localTTS = {};
    this._ollamaProvider = false;
    this._ollamaUrl = 'http://localhost:11434';

    if (this.synthesis) {
      this.synthesis.onvoiceschanged = () => this._loadVoices();
      setTimeout(() => this._loadVoices(), 200);
    }
    this._checkLocalEngines();
  }

  // ── Init ──────────────────────────────────────────────────────
  async init(config = {}) {
    this.wakeWord = (config.wakeWord || 'hey hex').toLowerCase();
    this.wakeWordMode = config.wakeWordMode === true;
    this._voiceName = config.voiceName || '';
    this._gcloudKey = config.gcloudTtsKey || '';
    this._useGCloud = !!this._gcloudKey;
    this._gcloudVoice = config.gcloudVoice || 'ka-GE-Standard-A';
    this._ttsEngine = config.ttsEngine || 'os';
    this._localVoiceLang = config.localVoiceLang || 'en';
    this._localSpeed = config.localSpeed ?? 1.0;
    if (config.llm?.provider === 'ollama') {
      this._ollamaProvider = true;
      this._ollamaUrl = config.llm?.baseUrl || 'http://localhost:11434';
    }
    this._applyVoiceName(this._voiceName);
    // Await engine check so _localSTT/_localTTS are populated before anything calls speak()
    await this._checkLocalEngines();
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

  // ── TTS: Google Cloud ─────────────────────────────────────────
  setGCloudKey(key) { this._gcloudKey = key || ''; this._useGCloud = !!key; }

  getGeorgianGCloudVoices() {
    return [
      { name: 'ka-GE-Standard-A', gender: 'Female', type: 'Standard' },
      { name: 'ka-GE-Standard-B', gender: 'Male', type: 'Standard' },
      { name: 'ka-GE-Wavenet-A', gender: 'Female', type: 'WaveNet' },
      { name: 'ka-GE-Wavenet-B', gender: 'Male', type: 'WaveNet' },
    ];
  }

  async _speakGCloud(text, opts = {}) {
    if (!this._gcloudKey) throw new Error('No Google Cloud TTS key');
    const voiceName = opts.gcVoice || this._gcloudVoice || 'ka-GE-Standard-A';
    const res = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + this._gcloudKey,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: voiceName.substring(0, 5), name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: opts.rate || 1.0, pitch: opts.pitch ? (opts.pitch - 1) * 10 : 0 }
        })
      }
    );
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error('GCloud TTS ' + res.status + ': ' + (e.error?.message || res.statusText)); }
    const raw = atob((await res.json()).audioContent);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    await this._playArrayBuffer(bytes.buffer);
  }

  // ── TTS: Local Piper ──────────────────────────────────────────
  async _speakLocal(text, lang) {
    window.hexTaskBus?.push('Synthesizing speech via Piper TTS...');
    const result = await window.hexAPI.voice.synthesize(text, lang, this._localSpeed ?? 1.0);
    const samples = result.samples;
    const float32 = new Float32Array(
      samples.buffer instanceof ArrayBuffer ? samples.buffer : new Uint8Array(Object.values(samples)).buffer
    );
    const ctx = this._getTTSAudioCtx();
    const buf = ctx.createBuffer(1, float32.length, result.sampleRate);
    buf.getChannelData(0).set(float32);
    if (this._currentSource) { try { this._currentSource.stop(); } catch (_) { } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    this._currentSource = src; src.start(0);
  }

  async _playArrayBuffer(arrayBuffer) {
    const ctx = this._getTTSAudioCtx();
    const buf = await ctx.decodeAudioData(arrayBuffer);
    if (this._currentSource) { try { this._currentSource.stop(); } catch (_) { } }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    this._currentSource = src; src.start(0);
  }

  _getTTSAudioCtx() {
    if (!this._ttsAudioCtx || this._ttsAudioCtx.state === 'closed')
      this._ttsAudioCtx = new AudioContext();
    return this._ttsAudioCtx;
  }

  // ── Speak ─────────────────────────────────────────────────────
  async speak(text, opts = {}) {
    if (!text) return;
    const clean = text.replace(/\[ACTION:[^\]]+\]/g, '').replace(/[*_`#]/g, '').replace(/\n+/g, ' ').trim();
    if (!clean) return;
    const ttsLang = this._ttsEngine === 'local' ? (this._localVoiceLang || this._sttLang || 'en') : (this._sttLang || 'en');

    if (this._ttsEngine === 'local') {
      const base = ttsLang.includes(':') ? ttsLang.split(':')[0] : ttsLang;
      if (this._localTTS?.[ttsLang] || this._localTTS?.[base]) {
        try { await this._speakLocal(clean, ttsLang); return; }
        catch (e) { console.warn('Local TTS failed:', e.message); }
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

  // ── STT: AudioWorklet → raw 16kHz PCM → Whisper ───────────────
  // Uses a separate AudioContext at 16kHz so no resampling is needed.
  // The worklet batches 4-second chunks and posts them to this thread.
  // We pass raw Float32 PCM directly to the main process — no decodeAudioData,
  // no OfflineAudioContext, nothing that can crash the renderer.

  async startListening(continuous = true) {
    if (this.isListening) return;
    this.continuous = continuous;
    this.isListening = true;
    this.onStateChange?.(true);
    window.hexTaskBus?.push('Activating microphone...');

    await this._checkLocalEngines();

    if (!this._localSTT && !this._ollamaProvider) {
      this._onError?.(
        'No STT engine. Options: ① Settings → Voice → Download Whisper model, or ② set AI provider to Ollama and run: ollama pull whisper'
      );
      this.isListening = false; this.onStateChange?.(false);
      return;
    }

    try {
      // Request mic
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) {
      this._onError?.('Microphone access denied. Allow microphone in Windows Settings → Privacy → Microphone.');
      this.isListening = false; this.onStateChange?.(false);
      return;
    }

    try {
      // AudioContext at 16kHz — avoids any resampling
      this._sttAudioCtx = new AudioContext({ sampleRate: 16000 });

      // Load the worklet
      // Build absolute file URL for the worklet (import.meta.url not available in classic scripts)
      const workletUrl = location.href.replace(/src\/[^/]+$/, '') + 'src/assets/pcm-processor.js';
      await this._sttAudioCtx.audioWorklet.addModule(workletUrl);

      this._sourceNode = this._sttAudioCtx.createMediaStreamSource(this._micStream);
      this._workletNode = new AudioWorkletNode(this._sttAudioCtx, 'pcm-processor');

      // Receive PCM chunks from worklet
      this._workletNode.port.onmessage = (e) => {
        if (!this.isListening) return;
        const pcm = new Float32Array(e.data.chunk);
        this._transcribePCM(pcm).catch(err => console.warn('STT error:', err.message));
      };

      this._sourceNode.connect(this._workletNode);
      // Connect to destination with zero gain to keep the audio graph alive
      const silencer = this._sttAudioCtx.createGain();
      silencer.gain.value = 0;
      this._workletNode.connect(silencer);
      silencer.connect(this._sttAudioCtx.destination);

    } catch (e) {
      console.warn('AudioWorklet failed, falling back to MediaRecorder:', e.message);
      // Fallback: MediaRecorder with simple blob → main process
      this._startMediaRecorderFallback();
    }
  }

  // ── RMS energy helper ────────────────────────────────────────
  _rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  }

  async _transcribePCM(pcm) {
    // ── VAD: RMS-based speech detection ──────────────────────────
    // Threshold tuned for typical mic levels — ignores keyboard, fans, AC
    const SPEECH_RMS = 0.04;    // raised — ignores more background noise
    const MIN_SPEECH_MS = 500;     // ignore anything shorter (clicks, pops)
    const SILENCE_GRACE = 5;       // silent frames allowed before cutting segment
    const COOLDOWN_MS = 1500;    // don't send two transcriptions too close together
    const SR = 16000;

    const rms = this._rms(pcm);
    const isSpeech = rms >= SPEECH_RMS;

    if (isSpeech) {
      this._vadActive = true;
      this._vadSilence = 0;
      this._vadSpeechBuf.push(pcm);
    } else if (this._vadActive) {
      this._vadSilence++;
      this._vadSpeechBuf.push(pcm); // keep collecting during brief pauses

      if (this._vadSilence < SILENCE_GRACE) return; // wait for more silence

      // End of speech segment — check it's long enough to be real speech
      const totalSamples = this._vadSpeechBuf.reduce((s, c) => s + c.length, 0);
      const durationMs = (totalSamples / SR) * 1000;

      const seg = this._vadSpeechBuf;
      this._vadSpeechBuf = [];
      this._vadActive = false;
      this._vadSilence = 0;

      if (durationMs < MIN_SPEECH_MS) return; // too short — noise burst

      const now = Date.now();
      if (now - this._lastTranscribe < COOLDOWN_MS) return; // too soon
      this._lastTranscribe = now;

      // Merge frames into a single Float32Array
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const frame of seg) { merged.set(frame, offset); offset += frame.length; }
      pcm = merged;
    } else {
      return; // silence, no active segment
    }

    if (!this._vadActive && pcm.length === 0) return; // nothing to send yet
    // Only send when we've just finished a segment (vadActive just turned false)
    if (this._vadActive) return;

    let text = '';

    // Backend 1: sherpa-onnx Whisper (local)
    if (this._localSTT) {
      try {
        const r = await window.hexAPI.voice.transcribe(new Uint8Array(pcm.buffer), this._sttLang || 'en');
        text = (r.text || '').trim();
      } catch (e) { console.warn('Whisper STT error:', e.message); }
    }

    // Backend 2: Ollama
    if (!text && this._ollamaProvider) {
      try {
        // Encode PCM as WAV for Ollama
        const wav = this._pcmToWav(pcm, 16000);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const form = new FormData();
        form.append('file', blob, 'audio.wav');
        form.append('model', 'whisper');
        const res = await fetch(this._ollamaUrl + '/v1/audio/transcriptions', { method: 'POST', body: form });
        if (res.ok) text = ((await res.json()).text || '').trim();
      } catch (e) { console.warn('Ollama STT error:', e.message); }
    }

    if (!text) return;

    // ── Hallucination filter ─────────────────────────────────────
    // Whisper generates these phantom strings on near-silence or noise.
    // List sourced from whisper.cpp and openai/whisper known issues.
    const HALLUCINATIONS = [
      'thank you', 'thanks for watching', 'thanks for listening',
      'please subscribe', 'bye bye', 'bye-bye', 'goodbye',
      'you', 'the', 'i', 'uh', 'um', 'hmm', 'hm', 'oh',
      'subtitles by', 'transcribed by', 'translated by',
      'www.', '.com', 'http',
    ];
    const cleaned = text.trim();
    const lc = cleaned.toLowerCase();
    // Reject if the entire result matches a hallucination phrase exactly
    if (HALLUCINATIONS.includes(lc)) return;
    // Reject if very short (1-2 words) and matches a hallucination prefix
    if (cleaned.split(/\s+/).length <= 2 && HALLUCINATIONS.some(h => lc.includes(h))) return;

    // ── Wake word matching — fuzzy to handle Whisper mishearings ─
    // "hex" is often heard as "hicks", "hacks", "hex", "hecks", "next"
    const matchesWakeWord = (transcript) => {
      const t = transcript.toLowerCase();
      if (t.includes(this.wakeWord)) return true;
      // Build phonetic variants of the wake word
      const variants = this._wakeWordVariants(this.wakeWord);
      return variants.some(v => t.includes(v));
    };

    if (this.wakeWordMode) {
      if (matchesWakeWord(cleaned)) {
        this.onWakeWord?.();
        // Strip any variant of the wake word from the command part
        let after = lc;
        const allVariants = [this.wakeWord, ...this._wakeWordVariants(this.wakeWord)];
        for (const v of allVariants) after = after.replace(v, '');
        after = after.trim();
        if (after) this.onTranscript?.(after, true);
      }
    } else {
      this.onTranscript?.(cleaned, true);
    }
  }

  // ── Generate phonetic variants of a wake word for fuzzy matching ─
  _wakeWordVariants(wakeWord) {
    const variants = new Set();
    // Pre-built variants for "hey hex" specifically
    const builtIn = {
      'hey hex': ['hey hicks', 'hey hacks', 'hey hecks', 'hey hex.', 'hey, hex',
        'hay hex', 'hey next', 'hey x', 'a hex', 'hey heck'],
      'hey hex.': ['hey hex'],
    };
    if (builtIn[wakeWord]) {
      builtIn[wakeWord].forEach(v => variants.add(v));
    }
    // Generic: replace last word with common mishearings of short words
    const words = wakeWord.split(' ');
    if (words.length >= 2) {
      const last = words[words.length - 1];
      const prefix = words.slice(0, -1).join(' ') + ' ';
      // Vowel substitutions: e→i, e→a, e→ε
      variants.add(prefix + last.replace(/e/g, 'i'));
      variants.add(prefix + last.replace(/e/g, 'a'));
      // Common English mishearing suffixes
      variants.add(prefix + last + 's');
      variants.add(prefix + last + 'x');
    }
    return [...variants];
  }

  // ── PCM → WAV encoder (pure JS, no external libs) ────────────
  _pcmToWav(float32, sampleRate) {
    const numCh = 1;
    const bitsPerSmp = 16;
    const bytesPerSmp = bitsPerSmp / 8;
    const dataLen = float32.length * bytesPerSmp;
    const buf = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buf);
    const write = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    write(0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);   // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numCh * bytesPerSmp, true);
    view.setUint16(32, numCh * bytesPerSmp, true);
    view.setUint16(34, bitsPerSmp, true);
    write(36, 'data');
    view.setUint32(40, dataLen, true);
    // Convert Float32 → Int16
    let off = 44;
    for (let i = 0; i < float32.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  // ── MediaRecorder fallback (if AudioWorklet not available) ────
  _startMediaRecorderFallback() {
    if (!this._micStream || !this.isListening) return;
    this._doRecordCycle();
  }

  _doRecordCycle() {
    if (!this.isListening || !this._micStream) return;
    const chunks = [];
    let mr;
    try { mr = new MediaRecorder(this._micStream); }
    catch (e) { this._onError?.('Recorder error: ' + e.message); this.stopListening(); return; }

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = async () => {
      if (!this.isListening) return;
      if (chunks.length) {
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          // Send raw blob to main process for decoding — avoids renderer crash
          const arrBuf = await blob.arrayBuffer();
          const r = await window.hexAPI.voice.transcribeRaw(new Uint8Array(arrBuf), this._sttLang || 'en');
          const text = (r?.text || '').trim();
          if (text) this.onTranscript?.(text, true);
        } catch (e) { console.warn('Fallback STT error:', e.message); }
      }
      if (this.isListening && this.continuous) this._doRecordCycle();
    };

    mr.start();
    setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 5000);
  }

  stopListening() {
    this.continuous = false;
    this.isListening = false;

    // Tear down AudioWorklet pipeline
    if (this._workletNode) { try { this._workletNode.disconnect(); } catch (_) { } this._workletNode = null; }
    if (this._sourceNode) { try { this._sourceNode.disconnect(); } catch (_) { } this._sourceNode = null; }
    if (this._sttAudioCtx) {
      try { this._sttAudioCtx.close(); } catch (_) { }
      this._sttAudioCtx = null;
    }
    if (this._micStream) {
      this._micStream.getTracks().forEach(t => t.stop());
      this._micStream = null;
    }

    this.onStateChange?.(false);
  }

  toggleListening() {
    if (this.isListening) this.stopListening();
    else this.startListening(true);
  }

  // ── TTS voice list ────────────────────────────────────────────
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
  _applyVoiceName(name) {
    if (!name || !this._voices.length) { this._selectedVoice = null; return; }
    this._selectedVoice = this._voices.find(v => v.name === name) || null;
  }

  setLanguage(lang) {
    const tts = { en: 'en-US', ru: 'ru-RU', ka: 'ka-GE' };
    this.langCode = tts[lang] || 'en-US';
    this._sttLang = lang;
    if (!this._voiceName) this._selectedVoice = null;
    if (this.isListening) { this.stopListening(); setTimeout(() => this.startListening(true), 400); }
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

  get supported() { return true; }
  get currentVoiceName() { return this._selectedVoice?.name || ''; }
  get usingGCloud() { return this._useGCloud && !!this._gcloudKey; }
  get usingLocal() { return this._localSTT; }
}

window.hexVoice = new HexVoice();
