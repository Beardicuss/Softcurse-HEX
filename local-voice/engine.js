'use strict';
// ── local-voice/engine.js ─────────────────────────────────────────────────────
// STT: sherpa-onnx OfflineRecognizer (Whisper tiny)
// TTS: piper.exe binary
//
// sherpa-onnx 1.x API reference:
//   new sherpa.OfflineRecognizer({ modelConfig:{...}, decodingConfig:{method} })
//   recognizer.createStream() → stream
//   stream.acceptWaveform(sampleRate, float32Samples)
//   recognizer.decode(stream)
//   recognizer.getResult(stream) → { text }
//   stream.free()

const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');
const { execFile } = require('child_process');
const os       = require('os');

// ── Model directory — configurable via env or falls back to userData ──────────
// User can override with SHERPA_MODELS_DIR environment variable
// Default: D:\Dev\Assets\voices  (matches user's existing setup)
let MODELS_DIR = process.env.SHERPA_MODELS_DIR
  || (process.env.HEX_MODELS_DIR)
  || null;

// If not set via env, we try to read from electron userData on first access
function getModelsDir() {
  if (MODELS_DIR) return MODELS_DIR;
  try {
    const { app } = require('electron');
    MODELS_DIR = path.join(app.getPath('userData'), 'voice-models');
  } catch (_) {
    MODELS_DIR = path.join(os.homedir(), 'hex-voice-models');
  }
  return MODELS_DIR;
}

// Expose setter so main.js can push the configured path from Settings
function setModelsDir(dir) {
  MODELS_DIR = dir;
}

const PIPER_BIN_WIN  = () => path.join(getModelsDir(), 'piper', 'piper.exe');
const PIPER_BIN_UNIX = () => path.join(getModelsDir(), 'piper', 'piper');
const getPiperBin = () => process.platform === 'win32' ? PIPER_BIN_WIN() : PIPER_BIN_UNIX();

// ── Expected file paths ───────────────────────────────────────────────────────
// The names EXACTLY match what sherpa-onnx-whisper-tiny ships on HuggingFace:
//   tiny-encoder.int8.onnx  /  tiny-decoder.int8.onnx  /  tiny-tokens.txt
function getPATHS() {
  const d = getModelsDir();
  return {
    stt: {
      encoder: path.join(d, 'whisper-tiny', 'tiny-encoder.int8.onnx'),
      decoder: path.join(d, 'whisper-tiny', 'tiny-decoder.int8.onnx'),
      tokens:  path.join(d, 'whisper-tiny', 'tiny-tokens.txt'),
    },
    tts: {
      en: { model: path.join(d, 'tts-en', 'en_US-lessac-medium.onnx'),     config: path.join(d, 'tts-en', 'en_US-lessac-medium.onnx.json') },
      ru: { model: path.join(d, 'tts-ru', 'ru_RU-ruslan-medium.onnx'),     config: path.join(d, 'tts-ru', 'ru_RU-ruslan-medium.onnx.json') },
      ka: { model: path.join(d, 'tts-ka', 'ka_GE-natia-medium.onnx'),      config: path.join(d, 'tts-ka', 'ka_GE-natia-medium.onnx.json') },
    }
  };
}

const HF = 'https://huggingface.co';
const DOWNLOADS = {
  stt: {
    getDir: () => path.join(getModelsDir(), 'whisper-tiny'),
    files: [
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-encoder.int8.onnx`, name: 'tiny-encoder.int8.onnx' },
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-decoder.int8.onnx`, name: 'tiny-decoder.int8.onnx' },
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-tokens.txt`,        name: 'tiny-tokens.txt' },
    ]
  },
  'tts-en': {
    getDir: () => path.join(getModelsDir(), 'tts-en'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,      name: 'en_US-lessac-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`, name: 'en_US-lessac-medium.onnx.json' },
    ]
  },
  'tts-ru': {
    getDir: () => path.join(getModelsDir(), 'tts-ru'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx`,      name: 'ru_RU-ruslan-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx.json`, name: 'ru_RU-ruslan-medium.onnx.json' },
    ]
  },
  'tts-ka': {
    getDir: () => path.join(getModelsDir(), 'tts-ka'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx`,        name: 'ka_GE-natia-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx.json`,   name: 'ka_GE-natia-medium.onnx.json' },
    ]
  },
};

class LocalVoiceEngine {
  constructor() {
    this._sherpa    = null;
    this._stt       = null;
    this._tts       = {};
    this._sttReady  = false;
    this._ttsReady  = {};
    this._log       = () => {};
  }

  setLogger(fn) { this._log = fn; }

  setModelsDir(dir) {
    setModelsDir(dir);
    // Reset cached instances so they're reinitialised with new paths
    this._sttReady = false;
    this._ttsReady = {};
    this._stt      = null;
    this._tts      = {};
  }

  _getSherpa() {
    if (this._sherpa) return this._sherpa;
    try {
      this._sherpa = require('sherpa-onnx');
      return this._sherpa;
    } catch (e) {
      throw new Error(
        'sherpa-onnx native module not loaded.\n' +
        'Run: npm run rebuild\n' +
        'Original error: ' + e.message
      );
    }
  }

  // ── Probe what sherpa-onnx actually exports in this version ─────────────────
  _getSherpaClass(name) {
    const sh = this._getSherpa();
    // sherpa-onnx versions differ in capitalisation and export style
    return sh[name]              // e.g. sh.OfflineRecognizer
        || sh['Sherpa' + name]   // e.g. sh.SherpaOfflineRecognizer
        || null;
  }

  // ── Check file existence, logging what's missing ────────────────────────────
  _checkFiles(p) {
    const missing = [];
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string' && !fs.existsSync(v)) missing.push(`${k}: ${v}`);
    }
    return missing;
  }

  // ── Status ───────────────────────────────────────────────────────────────────
  getStatus() {
    const p = getPATHS();
    const sttFiles  = [p.stt.encoder, p.stt.decoder, p.stt.tokens];
    const sttReady  = sttFiles.every(f => fs.existsSync(f));
    const ttsReady  = {
      en: fs.existsSync(p.tts.en.model),
      ru: fs.existsSync(p.tts.ru.model),
      ka: fs.existsSync(p.tts.ka.model),
    };
    let hasSherpa = false;
    try { this._getSherpa(); hasSherpa = true; } catch(_) {}
    const hasPiper = fs.existsSync(getPiperBin());
    return {
      available:  true,
      sttReady,
      ttsReady,
      hasSherpa,
      hasPiper,
      modelsDir:  getModelsDir(),
      sttFiles:   { encoder: p.stt.encoder, decoder: p.stt.decoder, tokens: p.stt.tokens },
      voices:     this.listVoices(),
    };
  }

  listVoices() {
    const voices = [];
    const d = getModelsDir();
    try {
      const dirs = fs.readdirSync(d).filter(name =>
        name.startsWith('tts-') && fs.statSync(path.join(d, name)).isDirectory()
      );
      for (const dir of dirs) {
        const lang    = dir.replace('tts-', '');
        const fullDir = path.join(d, dir);
        fs.readdirSync(fullDir)
          .filter(f => f.endsWith('.onnx') && !f.endsWith('.onnx.json'))
          .forEach(file => {
            voices.push({
              id:       `${lang}:${file.replace('.onnx','')}`,
              lang,
              name:     file.replace('.onnx',''),
              file:     path.join(fullDir, file),
              ready:    true,
              isDefault: false,
            });
          });
      }
    } catch (_) {}
    return voices;
  }

  // ── STT — sherpa-onnx OfflineRecognizer (Whisper tiny) ──────────────────────
  initSTT() {
    if (this._sttReady) return true;

    const p = getPATHS().stt;
    const missing = this._checkFiles(p);
    if (missing.length) {
      this._log('STT models missing:\n  ' + missing.join('\n  '));
      return false;
    }

    // Normalise to forward slashes — ONNX runtime rejects backslashes on some builds
    const fwd = (s) => s.replace(/\\/g, '/');
    const enc = fwd(p.encoder);
    const dec = fwd(p.decoder);
    const tok = fwd(p.tokens);

    this._log('STT files found:\n  encoder: ' + enc +
              '\n  decoder: ' + dec + '\n  tokens: ' + tok);

    const sh = this._getSherpa();
    this._log('sherpa-onnx exports: ' + Object.keys(sh).join(', '));

    // createOfflineRecognizer is the stable API across 1.9–1.10.x
    // OfflineRecognizer class exists in some builds as an alias — try both
    const tryCreate = (cfg) => {
      if (typeof sh.createOfflineRecognizer === 'function')
        return sh.createOfflineRecognizer(cfg);
      if (typeof sh.OfflineRecognizer === 'function')
        return new sh.OfflineRecognizer(cfg);
      throw new Error('sherpa-onnx has no recognizer factory. Exports: ' + Object.keys(sh).join(', '));
    };

    // ── Config variants — ordered by likelihood of success ───────────────────
    const variants = [
      // A — 1.10.x canonical (tailPaddings 0, en, transcribe)
      {
        label: 'A: 1.10.x tailPaddings=0',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec, language: 'en', task: 'transcribe', tailPaddings: 0 },
            tokens: tok, numThreads: 1, debug: 0, provider: 'cpu', modelType: 'whisper',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
      // B — tailPaddings=-1
      {
        label: 'B: 1.10.x tailPaddings=-1',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec, language: 'en', task: 'transcribe', tailPaddings: -1 },
            tokens: tok, numThreads: 1, debug: 0, provider: 'cpu', modelType: 'whisper',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
      // C — no tailPaddings field at all
      {
        label: 'C: 1.10.x no tailPaddings',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec, language: 'en', task: 'transcribe' },
            tokens: tok, numThreads: 1, debug: 0, provider: 'cpu', modelType: 'whisper',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
      // D — no language/task (minimal 1.9.x style)
      {
        label: 'D: 1.9.x minimal',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec },
            tokens: tok, numThreads: 1, debug: 0, provider: 'cpu', modelType: 'whisper',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
      // E — 2 threads, full config
      {
        label: 'E: 2 threads full',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec, language: 'en', task: 'transcribe', tailPaddings: 0 },
            tokens: tok, numThreads: 2, debug: 0, provider: 'cpu', modelType: 'whisper',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
      // F — no modelType (some 1.9.x builds infer it)
      {
        label: 'F: no modelType',
        cfg: {
          modelConfig: {
            whisper: { encoder: enc, decoder: dec, language: 'en', task: 'transcribe', tailPaddings: 0 },
            tokens: tok, numThreads: 1, debug: 0, provider: 'cpu',
          },
          decodingConfig: { method: 'greedy_search' },
        },
      },
    ];

    for (const { label, cfg } of variants) {
      try {
        this._log('Trying variant ' + label);
        const recognizer = tryCreate(cfg);
        this._stt      = recognizer;
        this._sttReady = true;
        this._log('STT ready — variant ' + label);
        return true;
      } catch (e) {
        this._log('Variant ' + label + ' failed: ' + (e.message || String(e)));
        console.warn('STT [' + label + ']:', e.message || e);
      }
    }

    this._log(
      'All STT variants failed. Diagnostics:\n' +
      '  modelsDir: ' + getModelsDir() + '\n' +
      '  encoder:   ' + enc + '\n' +
      '  decoder:   ' + dec + '\n' +
      '  tokens:    ' + tok
    );
    return false;
  }

  async transcribe(float32Samples, lang = 'en') {
    if (!this.initSTT()) throw new Error('STT not available — check logs for details');

    try {
      const stream = this._stt.createStream();

      // sherpa-onnx 1.x: acceptWaveform(sampleRate, Float32Array)
      stream.acceptWaveform(16000, float32Samples);
      this._stt.decode(stream);
      const result = this._stt.getResult(stream);
      stream.free();
      return (result.text || '').trim();
    } catch (e) {
      // If a runtime error occurs, reset so next call re-inits
      this._sttReady = false;
      this._stt      = null;
      throw new Error('Transcription failed: ' + (e.message || e));
    }
  }

  // ── TTS — piper.exe binary ────────────────────────────────────────────────
  _resolveModel(langOrId) {
    if (langOrId && langOrId.includes(':')) {
      const [lang, modelName] = langOrId.split(':', 2);
      return path.join(getModelsDir(), `tts-${lang}`, modelName + '.onnx');
    }
    const p = getPATHS().tts[langOrId];
    return p ? p.model : null;
  }

  async synthesize(text, langOrId = 'en', speed = 1.0) {
    const modelPath = this._resolveModel(langOrId);
    if (!modelPath) throw new Error(`No TTS model configured for: ${langOrId}`);
    if (!fs.existsSync(modelPath)) throw new Error(`TTS model file not found: ${modelPath}`);

    const piperBin = getPiperBin();
    if (!fs.existsSync(piperBin)) {
      throw new Error(
        'piper.exe not found at: ' + piperBin + '\n' +
        'Download piper from https://github.com/rhasspy/piper/releases and place it in: ' +
        path.dirname(piperBin)
      );
    }

    const tmpWav      = path.join(os.tmpdir(), `hex-tts-${Date.now()}.wav`);
    const lengthScale = (1.0 / Math.max(0.5, Math.min(2.0, speed || 1.0))).toFixed(3);

    return new Promise((resolve, reject) => {
      const args = [
        '--model',        modelPath,
        '--output_file',  tmpWav,
        '--length-scale', lengthScale,
      ];

      const proc = execFile(piperBin, args, { timeout: 30000 }, (err) => {
        if (err) {
          try { fs.unlinkSync(tmpWav); } catch (_) {}
          return reject(new Error('Piper failed: ' + (err.message || err)));
        }
        try {
          const wavBuf   = fs.readFileSync(tmpWav);
          fs.unlinkSync(tmpWav);
          const header   = wavBuf.slice(0, 44);
          const sr       = header.readUInt32LE(24);
          const bps      = header.readUInt16LE(34);
          const pcmData  = wavBuf.slice(44);
          let samples;
          if (bps === 16) {
            const i16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);
            samples = new Float32Array(i16.length);
            for (let i = 0; i < i16.length; i++) samples[i] = i16[i] / 32768;
          } else {
            samples = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 4);
          }
          resolve({ samples, sampleRate: sr });
        } catch (e) { reject(new Error('WAV parse error: ' + e.message)); }
      });
      proc.stdin.write(text);
      proc.stdin.end();
    });
  }

  // ── Model downloader ────────────────────────────────────────────────────────
  async downloadModels(targets, onProgress) {
    const d = getModelsDir();
    fs.mkdirSync(d, { recursive: true });

    const allFiles = [];
    for (const target of targets) {
      const spec = DOWNLOADS[target];
      if (!spec) continue;
      const dir = spec.getDir();
      fs.mkdirSync(dir, { recursive: true });
      for (const file of spec.files) allFiles.push({ ...file, dir, group: target });
    }

    let done = 0;
    const total = allFiles.length;

    for (const file of allFiles) {
      const dest = path.join(file.dir, file.name);
      onProgress?.({ stage: 'download', name: file.name, group: file.group, pct: Math.round(done / total * 100) });
      await this._downloadFile(file.url, dest, pct => {
        onProgress?.({ stage: 'download', name: file.name, group: file.group, pct: Math.round((done + pct / 100) / total * 100) });
      });
      done++;
      onProgress?.({ stage: 'done', name: file.name, group: file.group, pct: Math.round(done / total * 100) });
    }

    this._sttReady = false;
    this._ttsReady = {};
    this._stt      = null;
    this._tts      = {};
  }

  _downloadFile(url, dest, onPct) {
    return new Promise((resolve, reject) => {
      const doGet = (u, hops = 0) => {
        if (hops > 15) { reject(new Error('Too many redirects')); return; }
        let parsed;
        try { parsed = new URL(u); } catch(e) { reject(e); return; }
        const proto = parsed.protocol === 'https:' ? https : http;
        const req = proto.get({
          hostname: parsed.hostname,
          port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path:     parsed.pathname + parsed.search,
          headers:  { 'User-Agent': 'HEX-Voice-Downloader/1.0' }
        }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doGet(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, u).toString(), hops + 1);
            return;
          }
          if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode + ' for ' + path.basename(dest))); return; }
          const total = parseInt(res.headers['content-length'] || '0');
          let got = 0;
          const out = fs.createWriteStream(dest);
          res.on('data', chunk => { got += chunk.length; if (total && onPct) onPct(Math.round(got / total * 100)); });
          res.pipe(out);
          out.on('finish', () => { out.close(); resolve(); });
          out.on('error', e => { fs.unlink(dest, ()=>{}); reject(e); });
          res.on('error', e => { fs.unlink(dest, ()=>{}); reject(e); });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout: ' + path.basename(dest))); });
      };
      doGet(url);
    });
  }
}

const engine = new LocalVoiceEngine();
module.exports = engine;
