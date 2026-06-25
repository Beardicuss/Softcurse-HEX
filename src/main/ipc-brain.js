'use strict';
// ── main/ipc-brain.js ─────────────────────────────────────────────────────────
// IPC handlers: brain:load/save, memory:get/set/clear, finetune:append/get-path/clear

const fs   = require('fs');
const path = require('path');

module.exports = function registerBrainIPC({ ipcMain, app }) {
  const BRAIN_PATH    = path.join(app.getPath('userData'), 'hex-profile.json');
  const MEMORY_PATH   = path.join(app.getPath('userData'), 'memory.json');
  const FINETUNE_PATH = path.join(app.getPath('userData'), 'hex-finetune.jsonl');

  // ── Adaptive Intelligence (brain profile) ──────────────────────────────────
  ipcMain.handle('brain:load', async () => {
    try {
      if (fs.existsSync(BRAIN_PATH)) return JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf-8'));
      return null;
    } catch (e) {
      console.warn('Brain load failed:', e.message);
      return null;
    }
  });

  ipcMain.handle('brain:save', async (_, data) => {
    try {
      fs.writeFileSync(BRAIN_PATH, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Memory ─────────────────────────────────────────────────────────────────
  ipcMain.handle('memory:get', () => {
    try {
      if (fs.existsSync(MEMORY_PATH)) return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
    } catch (_) {}
    return null;
  });

  ipcMain.handle('memory:set', (_, data) => {
    try {
      fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('memory:clear', () => {
    try {
      if (fs.existsSync(MEMORY_PATH)) fs.unlinkSync(MEMORY_PATH);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });


  function readFinetuneRows() {
    if (!fs.existsSync(FINETUNE_PATH)) return [];
    return fs.readFileSync(FINETUNE_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch (_) { return null; }
      })
      .filter(Boolean);
  }

  function writeJsonl(filePath, rows) {
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  }

  function exportCleanFinetuneDatasets() {
    const rows = readFinetuneRows();
    const baseDir = path.dirname(FINETUNE_PATH);
    const sftPath = path.join(baseDir, 'hex-sft.jsonl');
    const preferencePath = path.join(baseDir, 'hex-preferences.jsonl');
    const manifestPath = path.join(baseDir, 'hex-dataset-manifest.json');
    const seenSft = new Set();
    const seenPref = new Set();
    const sft = [];
    const preferences = [];
    const intents = {};
    const languages = {};

    const addIntent = (row) => {
      if (row.trainingIntent) intents[row.trainingIntent] = (intents[row.trainingIntent] || 0) + 1;
      if (row.language) languages[row.language] = (languages[row.language] || 0) + 1;
    };

    const cleanQualityMetadata = (quality) => {
      if (!quality || typeof quality !== 'object') return null;
      return {
        label: quality.label || null,
        usableForSft: quality.usableForSft === true,
        usableForPreference: quality.usableForPreference === true,
        usableAsNegative: quality.usableAsNegative === true,
        route: quality.route || null,
        action: quality.action || null,
        context: quality.context || null
      };
    };

    for (const row of rows) {
      if (row.type === 'hex_training_chat' && Array.isArray(row.messages)) {
        const clean = {
          messages: row.messages,
          metadata: {
            sourceFeedbackId: row.sourceFeedbackId || null,
            signal: row.signal || null,
            trainingIntent: row.trainingIntent || null,
            language: row.language || null,
            context: row.context || null,
            quality: cleanQualityMetadata(row.quality)
          }
        };
        const key = JSON.stringify(clean.messages);
        if (!seenSft.has(key)) {
          seenSft.add(key);
          sft.push(clean);
          addIntent(row);
        }
      }
      if (row.type === 'hex_preference_pair' && row.chosen && row.rejected) {
        const clean = {
          prompt: row.prompt || '',
          chosen: row.chosen,
          rejected: row.rejected,
          metadata: {
            sourceFeedbackId: row.sourceFeedbackId || null,
            trainingIntent: row.trainingIntent || null,
            language: row.language || null,
            context: row.context || null,
            quality: cleanQualityMetadata(row.quality)
          }
        };
        const key = [clean.prompt, clean.chosen, clean.rejected].join('\u0000');
        if (!seenPref.has(key)) {
          seenPref.add(key);
          preferences.push(clean);
          addIntent(row);
        }
      }
    }

    writeJsonl(sftPath, sft);
    writeJsonl(preferencePath, preferences);
    const manifest = {
      schema: 'hex.clean-dataset-manifest.v1',
      createdAt: new Date().toISOString(),
      rawPath: FINETUNE_PATH,
      sftPath,
      preferencePath,
      counts: { rawRows: rows.length, sft: sft.length, preferences: preferences.length },
      intents,
      languages
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { success: true, ...manifest, manifestPath };
  }

  // ── Fine-tune data ─────────────────────────────────────────────────────────
  ipcMain.handle('finetune:append', (_, { lines }) => {
    try {
      fs.appendFileSync(FINETUNE_PATH, lines.join('\n') + '\n', 'utf8');
      return { success: true, path: FINETUNE_PATH };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finetune:get-path', () => ({
    path:   FINETUNE_PATH,
    exists: fs.existsSync(FINETUNE_PATH),
  }));

  ipcMain.handle('finetune:stats', () => {
    try {
      const stats = {
        path: FINETUNE_PATH,
        exists: fs.existsSync(FINETUNE_PATH),
        bytes: 0,
        lines: 0,
        evolutionRecords: 0,
        chatSamples: 0,
        preferencePairs: 0,
        good: 0,
        wrong: 0,
        fix: 0,
        lastCreatedAt: null,
        usableSft: 0,
        usablePreference: 0,
        usableNegative: 0,
        intents: {},
        languages: {},
      };
      if (!stats.exists) return { success: true, stats };
      const file = fs.statSync(FINETUNE_PATH);
      stats.bytes = file.size;
      const raw = fs.readFileSync(FINETUNE_PATH, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      stats.lines = lines.length;
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (row.type === 'hex_evolution_feedback') {
            stats.evolutionRecords++;
            if (row.signal === 'good') stats.good++;
            else if (row.signal === 'wrong') stats.wrong++;
            else if (row.signal === 'fix') stats.fix++;
            if (row.quality?.usableForSft) stats.usableSft++;
            if (row.quality?.usableForPreference) stats.usablePreference++;
            if (row.quality?.usableAsNegative) stats.usableNegative++;
            if (row.trainingIntent) stats.intents[row.trainingIntent] = (stats.intents[row.trainingIntent] || 0) + 1;
            if (row.language) stats.languages[row.language] = (stats.languages[row.language] || 0) + 1;
            if (row.createdAt && (!stats.lastCreatedAt || row.createdAt > stats.lastCreatedAt)) stats.lastCreatedAt = row.createdAt;
          } else if (row.type === 'hex_training_chat' || Array.isArray(row.messages)) {
            stats.chatSamples++;
          } else if (row.type === 'hex_preference_pair' || (row.chosen && row.rejected)) {
            stats.preferencePairs++;
          }
        } catch (_) {}
      }
      return { success: true, stats };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finetune:export-clean', () => {
    try {
      return exportCleanFinetuneDatasets();
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finetune:clear', () => {
    try {
      if (fs.existsSync(FINETUNE_PATH)) fs.unlinkSync(FINETUNE_PATH);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
};
