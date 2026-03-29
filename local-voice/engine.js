'use strict';
// ── local-voice/engine.js ─────────────────────────────────────
// Offline TTS via Piper binary, STT via Web Speech API fallback

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const os = require('os');

const MODELS_DIR = 'D:\\Dev\\Assets\\voices';
const PIPER_BIN = path.join(MODELS_DIR, 'piper', 'piper.exe');

// ── File paths expected by sherpa-onnx ───────────────────────
const PATHS = {
  stt: {
    encoder: path.join(MODELS_DIR, 'whisper-tiny', 'tiny-encoder.int8.onnx'),
    decoder: path.join(MODELS_DIR, 'whisper-tiny', 'tiny-decoder.int8.onnx'),
    tokens: path.join(MODELS_DIR, 'whisper-tiny', 'tiny-tokens.txt'),
  },
  tts: {
    en: {
      model: path.join(MODELS_DIR, 'tts-en', 'en_US-lessac-medium.onnx'),
      config: path.join(MODELS_DIR, 'tts-en', 'en_US-lessac-medium.onnx.json'),
      tokens: path.join(MODELS_DIR, 'tts-en', 'tokens.txt'),
    },
    ru: {
      model: path.join(MODELS_DIR, 'tts-ru', 'ru_RU-ruslan-medium.onnx'),
      config: path.join(MODELS_DIR, 'tts-ru', 'ru_RU-ruslan-medium.onnx.json'),
      tokens: path.join(MODELS_DIR, 'tts-ru', 'tokens.txt'),
    },
    ka: {
      model: path.join(MODELS_DIR, 'tts-ka', 'ka_GE-natia-medium.onnx'),
      config: path.join(MODELS_DIR, 'tts-ka', 'ka_GE-natia-medium.onnx.json'),
      tokens: path.join(MODELS_DIR, 'tts-ka', 'tokens.txt'),
    },
  }
};

// ── HuggingFace direct file downloads (no archive needed) ─────
const HF = 'https://huggingface.co';

const DOWNLOADS = {
  stt: {
    dir: path.join(MODELS_DIR, 'whisper-tiny'),
    files: [
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-encoder.int8.onnx`, name: 'tiny-encoder.int8.onnx' },
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-decoder.int8.onnx`, name: 'tiny-decoder.int8.onnx' },
      { url: `${HF}/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-tokens.txt`, name: 'tiny-tokens.txt' },
    ]
  },
  'tts-en': {
    dir: path.join(MODELS_DIR, 'tts-en'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx`, name: 'en_US-lessac-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`, name: 'en_US-lessac-medium.onnx.json' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/MODEL_CARD`, name: 'tokens.txt' },
    ]
  },
  'tts-ru': {
    dir: path.join(MODELS_DIR, 'tts-ru'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx`, name: 'ru_RU-ruslan-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx.json`, name: 'ru_RU-ruslan-medium.onnx.json' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ru/ru_RU/ruslan/medium/MODEL_CARD`, name: 'tokens.txt' },
    ]
  },
  'tts-ka': {
    dir: path.join(MODELS_DIR, 'tts-ka'),
    files: [
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx`, name: 'ka_GE-natia-medium.onnx' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx.json`, name: 'ka_GE-natia-medium.onnx.json' },
      { url: `${HF}/rhasspy/piper-voices/resolve/main/ka/ka_GE/natia/medium/MODEL_CARD`, name: 'tokens.txt' },
    ]
  },
};

class LocalVoiceEngine {
  constructor() {
    this._sherpa = null;
    this._stt = null;
    this._tts = {};
    this._sttReady = false;
    this._ttsReady = {};
    this._log = () => { };
  }

  setLogger(fn) { this._log = fn; }

  _getSherpa() {
    if (!this._sherpa) {
      try {
        this._sherpa = require('sherpa-onnx');
      } catch (e) {
        console.warn('sherpa-onnx load failed:', e.message);
        throw new Error(
          'sherpa-onnx native module failed to load. ' +
          'Run: npm run rebuild\n' +
          'Original: ' + e.message
        );
      }
    }
    return this._sherpa;
  }

  getStatus() {
    const sttReady = fs.existsSync(PATHS.stt.encoder) && fs.existsSync(PATHS.stt.decoder);
    const ttsReady = {
      en: fs.existsSync(PATHS.tts.en.model),
      ru: fs.existsSync(PATHS.tts.ru.model),
      ka: fs.existsSync(PATHS.tts.ka.model),
    };
    const hasPiper = fs.existsSync(PIPER_BIN);
    return { sttReady, ttsReady, hasPiper, modelsDir: MODELS_DIR, voices: this.listVoices() };
  }

  // Discover all .onnx voice models in tts-* directories
  listVoices() {
    const voices = [];
    try {
      const dirs = fs.readdirSync(MODELS_DIR).filter(d => d.startsWith('tts-') && fs.statSync(path.join(MODELS_DIR, d)).isDirectory());
      for (const dir of dirs) {
        const lang = dir.replace('tts-', ''); // 'en', 'ru', 'ka'
        const fullDir = path.join(MODELS_DIR, dir);
        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.onnx') && !f.endsWith('.onnx.json'));
        for (const file of files) {
          const modelName = file.replace('.onnx', '');
          const configFile = path.join(fullDir, file + '.json');
          const tokensFile = path.join(fullDir, 'tokens.txt');
          const hasConfig = fs.existsSync(configFile);
          const hasTokens = fs.existsSync(tokensFile);
          voices.push({
            id: `${lang}:${modelName}`,
            lang,
            name: modelName,
            file: path.join(fullDir, file),
            ready: fs.existsSync(path.join(fullDir, file)),  // piper just needs the .onnx
            isDefault: PATHS.tts[lang] && path.join(fullDir, file) === PATHS.tts[lang].model,
          });
        }
      }
    } catch (_) { }
    return voices;
  }

  initSTT() {
    if (this._sttReady) return true;
    const p = PATHS.stt;
    if (!fs.existsSync(p.encoder)) {
      this._log('STT models not found.');
      return false;
    }
    try {
      const sherpa = this._getSherpa();
      this._stt = sherpa.createOfflineRecognizer({
        modelConfig: {
          whisper: {
            encoder: p.encoder,
            decoder: p.decoder,
            language: 'auto',
            task: 'transcribe',
            tailPaddings: 0,
          },
          tokens: p.tokens,
          numThreads: 2,
          debug: 0,
          provider: 'cpu',
        },
        decodingMethod: 'greedy_search',
        maxActivePaths: 4,
      });
      this._sttReady = true;
      this._log('Local STT (Whisper) ready.');
      return true;
    } catch (e) {
      console.warn('STT init error:', e.message || e);
      return false;
    }
  }

  async transcribe(float32Samples, lang = 'en') {
    if (!this.initSTT()) throw new Error('STT not available');
    const stream = this._stt.createStream();
    stream.acceptWaveform(16000, float32Samples);
    this._stt.decode(stream);
    const result = this._stt.getResult(stream);
    stream.free();
    return (result.text || '').trim();
  }

  // ── TTS via piper.exe binary ──────────────────────────────────

  _resolveModel(langOrId) {
    if (langOrId.includes(':')) {
      const [lang, modelName] = langOrId.split(':', 2);
      return path.join(MODELS_DIR, `tts-${lang}`, modelName + '.onnx');
    }
    const p = PATHS.tts[langOrId];
    return p ? p.model : null;
  }

  async synthesize(text, langOrId = 'en', speed = 1.0) {
    const key = langOrId.includes(':') ? langOrId : (['en', 'ru', 'ka'].includes(langOrId) ? langOrId : 'en');
    const modelPath = this._resolveModel(key);
    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new Error(`TTS model not found for ${key}`);
    }
    if (!fs.existsSync(PIPER_BIN)) {
      throw new Error('piper.exe not found at ' + PIPER_BIN);
    }

    const tmpWav = path.join(os.tmpdir(), `hex-tts-${Date.now()}.wav`);
    const lengthScale = 1.0 / Math.max(0.5, Math.min(2.0, speed || 1.0));

    return new Promise((resolve, reject) => {
      const args = [
        '--model', modelPath,
        '--output_file', tmpWav,
        '--length-scale', lengthScale.toFixed(3),
      ];
      const proc = execFile(PIPER_BIN, args, { timeout: 30000 }, (err) => {
        if (err) {
          try { fs.unlinkSync(tmpWav); } catch (_) { }
          return reject(new Error('Piper TTS failed: ' + (err.message || err)));
        }
        try {
          const wavBuf = fs.readFileSync(tmpWav);
          fs.unlinkSync(tmpWav);
          // Parse WAV: skip 44-byte header, read as 16-bit PCM
          const header = wavBuf.slice(0, 44);
          const sampleRate = header.readUInt32LE(24);
          const bitsPerSample = header.readUInt16LE(34);
          const pcmData = wavBuf.slice(44);
          let samples;
          if (bitsPerSample === 16) {
            const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);
            samples = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) samples[i] = int16[i] / 32768;
          } else {
            samples = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 4);
          }
          resolve({ samples, sampleRate });
        } catch (e) {
          reject(new Error('WAV parse error: ' + e.message));
        }
      });
      // Send text via stdin
      proc.stdin.write(text);
      proc.stdin.end();
    });
  }

  // ── Download individual files from HuggingFace ────────────────
  async downloadModels(targets, onProgress) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });

    // Collect all files to download
    const allFiles = [];
    for (const target of targets) {
      const spec = DOWNLOADS[target];
      if (!spec) continue;
      fs.mkdirSync(spec.dir, { recursive: true });
      for (const file of spec.files) {
        allFiles.push({ ...file, dir: spec.dir, group: target });
      }
    }

    let done = 0;
    const total = allFiles.length;

    for (const file of allFiles) {
      const dest = path.join(file.dir, file.name);
      onProgress?.({ stage: 'download', name: file.name, group: file.group, pct: Math.round(done / total * 100) });
      await this._downloadFile(file.url, dest, (pct) => {
        onProgress?.({ stage: 'download', name: file.name, group: file.group, pct: Math.round((done + pct / 100) / total * 100) });
      });
      done++;
      onProgress?.({ stage: 'done', name: file.name, group: file.group, pct: Math.round(done / total * 100) });
    }

    // Reset cached instances
    this._sttReady = false;
    this._ttsReady = {};
  }

  _downloadFile(url, dest, onPct) {
    return new Promise((resolve, reject) => {
      const doGet = (u, redirects = 0) => {
        if (redirects > 15) { reject(new Error('Too many redirects')); return; }

        // Always parse the URL properly so we pick the right protocol
        let parsed;
        try { parsed = new URL(u); }
        catch (e) { reject(new Error('Invalid URL: ' + u)); return; }

        const proto = parsed.protocol === 'https:' ? https : http;
        const options = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers: { 'User-Agent': 'HEX-Voice-Downloader/1.0' }
        };

        const req = proto.get(options, (res) => {
          // Follow redirects — resolve relative locations against current URL
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, u).toString();
            doGet(next, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error('HTTP ' + res.statusCode + ' downloading ' + path.basename(dest)));
            return;
          }
          const total = parseInt(res.headers['content-length'] || '0');
          let received = 0;
          const out = fs.createWriteStream(dest);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total && onPct) onPct(Math.round(received / total * 100));
          });
          res.pipe(out);
          out.on('finish', () => { out.close(); resolve(); });
          out.on('error', (e) => { fs.unlink(dest, () => { }); reject(e); });
          res.on('error', (e) => { fs.unlink(dest, () => { }); reject(e); });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout downloading ' + path.basename(dest))); });
      };
      doGet(url);
    });
  }
}

module.exports = new LocalVoiceEngine();
