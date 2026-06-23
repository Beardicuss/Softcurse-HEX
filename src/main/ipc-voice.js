'use strict';
// ── main/ipc-voice.js ─────────────────────────────────────────────────────────
// IPC handlers: voice:status/set-models-dir/browse-dir/transcribeRaw/transcribe
//               voice:synthesize/download-models/open-models-dir

const fs   = require('fs');
const path = require('path');
const os   = require('os');

module.exports = function registerVoiceIPC({
  ipcMain, app, shell, dialog,
  localVoice,
  getConfig, setConfig, saveConfig,
  sendLog,
}) {
  // ── Open models directory in Explorer ──────────────────────────────────────
  ipcMain.handle('voice:open-models-dir', () => {
    const dir = localVoice
      ? localVoice.getStatus().modelsDir
      : path.join(app.getPath('userData'), 'voice-models');
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return dir;
  });

  // ── Engine status ──────────────────────────────────────────────────────────
  ipcMain.handle('voice:status', () => {
    if (!localVoice) return { available: false, reason: 'Engine not loaded — check npm install' };
    try {
      return { available: true, ...localVoice.getStatus() };
    } catch (e) {
      return { available: false, reason: e.message };
    }
  });

  // ── Set models directory (from renderer input) ─────────────────────────────
  ipcMain.handle('voice:set-models-dir', (_, dir) => {
    if (localVoice && dir) {
      localVoice.setModelsDir(dir);
      const cfg = getConfig();
      cfg.voice = { ...(cfg.voice || {}), modelsDir: dir };
      setConfig(cfg);
      saveConfig(cfg);
    }
    return { success: true, dir };
  });

  // ── Browse for models directory ────────────────────────────────────────────
  ipcMain.handle('voice:browse-dir', async () => {
    const result = await dialog.showOpenDialog(null, {
      title:      'Select Voice Models Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dir = result.filePaths[0];
    if (localVoice && dir) {
      localVoice.setModelsDir(dir);
      const cfg = getConfig();
      cfg.voice = { ...(cfg.voice || {}), modelsDir: dir };
      setConfig(cfg);
      saveConfig(cfg);
    }
    return dir;
  });

  // ── Transcribe raw webm/ogg blob ───────────────────────────────────────────
  ipcMain.handle('voice:transcribeRaw', async (_, { bytes, lang }) => {
    if (!localVoice) throw new Error('Local voice engine not available');
    const { execSync } = require('child_process');
    const tmpIn  = path.join(os.tmpdir(), 'hex_stt_in.webm');
    const tmpOut = path.join(os.tmpdir(), 'hex_stt_out.raw');
    try {
      fs.writeFileSync(tmpIn, Buffer.from(bytes));
      execSync(`ffmpeg -y -i "${tmpIn}" -ar 16000 -ac 1 -f f32le "${tmpOut}"`, { stdio: 'ignore' });
      const raw     = fs.readFileSync(tmpOut);
      const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      localVoice.setLogger((msg) => sendLog('VOICE', msg));
      return { text: await localVoice.transcribe(float32, lang || 'en') };
    } catch (_e) {
      // ffmpeg not available — pass raw bytes directly
      const float32 = new Float32Array(Buffer.from(bytes).buffer);
      return { text: await localVoice.transcribe(float32, lang || 'en') };
    } finally {
      try { fs.unlinkSync(tmpIn);  } catch (_) {}
      try { fs.unlinkSync(tmpOut); } catch (_) {}
    }
  });

  // ── Transcribe Float32 samples ─────────────────────────────────────────────
  ipcMain.handle('voice:transcribe', async (_, { samples, lang }) => {
    if (!localVoice) throw new Error('Local voice engine not available');
    localVoice.setLogger((msg) => sendLog('VOICE', msg));
    let float32;
    if (samples instanceof Buffer) {
      float32 = new Float32Array(samples.buffer, samples.byteOffset, samples.byteLength / 4);
    } else if (samples && samples.buffer) {
      float32 = new Float32Array(samples.buffer);
    } else {
      const buf = Buffer.from(Object.values(samples));
      float32   = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    }
    return { text: await localVoice.transcribe(float32, lang || 'en') };
  });

  // ── Synthesize TTS ─────────────────────────────────────────────────────────
  ipcMain.handle('voice:synthesize', async (_, { text, lang, speed }) => {
    if (!localVoice) throw new Error('Local voice engine not available');
    localVoice.setLogger((msg) => sendLog('VOICE', msg));
    const result = await localVoice.synthesize(text, lang || 'en', speed || 1.0);
    return {
      samples:    Buffer.from(result.samples.buffer),
      sampleRate: result.sampleRate,
    };
  });

  ipcMain.handle('voice:gcloud-synthesize', async (_, payload = {}) => {
    const apiKey = String(getConfig()?.voice?.gcloudTtsKey || '').trim();
    if (!apiKey) throw new Error('Google Cloud TTS key is not configured');
    const text = String(payload.text || '').trim().slice(0, 5000);
    if (!text) throw new Error('TTS text is required');
    const voiceName = String(payload.voiceName || getConfig()?.voice?.gcloudVoice || 'ka-GE-Standard-A');
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voiceName.substring(0, 5), name: voiceName },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Number(payload.rate || 1),
          pitch: payload.pitch ? (Number(payload.pitch) - 1) * 10 : 0
        }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Google Cloud TTS ' + response.status + ': ' + (result?.error?.message || response.statusText));
    return { audio: Buffer.from(String(result.audioContent || ''), 'base64') };
  });
  // ── Download models ────────────────────────────────────────────────────────
  ipcMain.handle('voice:download-models', async (_, { targets, whisperSize }) => {
    if (!localVoice) throw new Error('Local voice engine not available');
    const cfg = getConfig();
    if (cfg.voice && cfg.voice.modelsDir) localVoice.setModelsDir(cfg.voice.modelsDir);
    if (whisperSize) {
      cfg.voice = { ...(cfg.voice || {}), whisperSize };
      setConfig(cfg);
      saveConfig(cfg);
    }
    await localVoice.downloadModels(
      targets || ['stt', 'tts-en', 'tts-ru', 'tts-ka'],
      (progress) => { try { require('electron').BrowserWindow.getAllWindows()[0]?.webContents.send('voice:download-progress', progress); } catch (_) {} },
      whisperSize || 'tiny'
    );
    return { success: true };
  });
};
