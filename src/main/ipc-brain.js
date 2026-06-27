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

  function buildTrainingDataHealth(rows, counts = {}) {
    const metrics = {
      feedbackRecords: 0,
      good: 0,
      wrong: 0,
      fix: 0,
      usableSft: 0,
      usablePreference: 0,
      actionCorrections: 0,
      priorityKnown: 0,
      priorityMissing: 0,
      freshBrowserPriority: 0,
      freshActionPriority: 0,
      staleOrMissingPriority: 0,
      liveContextKnown: 0,
      freshLiveBrowserCandidates: 0,
      freshDesktopBestTargets: 0,
      staleLiveCandidates: 0,
      noLiveTargets: 0,
      recoveryMessages: 0,
      staleReferenceRefusals: 0,
      actionRecoveryMessages: 0
    };

    for (const row of rows) {
      if (row?.type !== 'hex_evolution_feedback') continue;
      metrics.feedbackRecords++;
      if (row.signal === 'good') metrics.good++;
      else if (row.signal === 'wrong') metrics.wrong++;
      else if (row.signal === 'fix') metrics.fix++;
      if (row.quality?.usableForSft) metrics.usableSft++;
      if (row.quality?.usableForPreference) metrics.usablePreference++;
      if (row.trainingIntent === 'action-routing-correction') metrics.actionCorrections++;

      const priority = row.quality?.context?.priority || null;
      const hasPriority = priority?.known === true || row.context?.priorityReferences;
      if (hasPriority) metrics.priorityKnown++;
      else metrics.priorityMissing++;
      if (priority?.freshBrowserReference === true) metrics.freshBrowserPriority++;
      if (priority?.freshActionReference === true) metrics.freshActionPriority++;
      if (!hasPriority || priority?.onlyBackgroundReferences === true || row.quality?.context?.serverPacketStale === true) {
        metrics.staleOrMissingPriority++;
      }
      const live = row.quality?.context?.localLive || null;
      if (live?.known === true) metrics.liveContextKnown++;
      if (live?.freshBrowserCandidates === true) metrics.freshLiveBrowserCandidates++;
      if (live?.freshDesktopBestTarget === true) metrics.freshDesktopBestTargets++;
      if (live?.hasOnlyStaleLocalTargets === true) metrics.staleLiveCandidates++;
      if (live?.known === true && !live.freshBrowserCandidates && !live.hasFreshLocalTargets && !live.hasOnlyStaleLocalTargets) metrics.noLiveTargets++;
      const recovery = row.quality?.recovery || row.quality?.context?.recovery || null;
      if (recovery?.known === true) metrics.recoveryMessages++;
      if (recovery?.staleReferenceRefusal === true) metrics.staleReferenceRefusals++;
      if (recovery?.actionRecoveryMessage === true) metrics.actionRecoveryMessages++;
    }

    const thresholds = {
      minimumGood: 20,
      minimumFix: 10,
      minimumPreferencePairs: 10,
      minimumFreshBrowserPriority: 5,
      minimumActionCorrections: 5,
      minimumFreshLiveContext: 5,
      minimumFreshDesktopTargets: 3
    };
    const buildCategory = (key, label, current, target, text) => ({
      key,
      label,
      current,
      target,
      remaining: Math.max(0, target - current),
      ready: current >= target,
      text
    });
    const categories = {
      dialogueStyle: buildCategory('dialogue-style', 'Dialogue style', metrics.good, thresholds.minimumGood, 'GOOD records teach HEX preferred tone and concise answer shape.'),
      correctedAnswers: buildCategory('corrected-answers', 'Corrected answers', metrics.fix, thresholds.minimumFix, 'FIX records create clean corrected-answer samples.'),
      preferenceTraining: buildCategory('preference-training', 'Preference training', Number(counts.preferences || 0), thresholds.minimumPreferencePairs, 'Preference pairs teach chosen-vs-rejected behavior.'),
      browserFollowUps: buildCategory('browser-follow-ups', 'Browser follow-ups', metrics.freshBrowserPriority, thresholds.minimumFreshBrowserPriority, 'Fresh browser priority records teach open/click/continue routing.'),
      desktopFollowUps: buildCategory('desktop-follow-ups', 'Desktop follow-ups', metrics.freshDesktopBestTargets, thresholds.minimumFreshDesktopTargets, 'Fresh app/file/game/window targets teach local follow-up routing.'),
      actionRouting: buildCategory('action-routing', 'Action routing', metrics.actionCorrections, thresholds.minimumActionCorrections, 'Action correction records teach when to execute instead of chat.'),
      liveContext: buildCategory('live-context', 'Live context', metrics.freshLiveBrowserCandidates, thresholds.minimumFreshLiveContext, 'Fresh live context records teach target freshness and refusal boundaries.')
    };
    const gaps = [];
    const addGap = (kind, current, target, text) => {
      if (current < target) gaps.push({ kind, current, target, remaining: target - current, text });
    };

    if (metrics.feedbackRecords === 0) {
      gaps.push({ kind: 'feedback-empty', current: 0, target: 1, remaining: 1, text: 'Collect first GOOD / WRONG / FIX feedback records before local training.' });
    }
    addGap('good-style-samples', metrics.good, thresholds.minimumGood, 'Collect more GOOD examples so local training learns HEX voice and answer style.');
    addGap('fix-corrections', metrics.fix, thresholds.minimumFix, 'Collect more FIX corrections to create corrected-answer samples.');
    addGap('preference-pairs', Number(counts.preferences || 0), thresholds.minimumPreferencePairs, 'Collect more FIX records that produce chosen-vs-rejected preference pairs.');
    addGap('browser-follow-up-context', metrics.freshBrowserPriority, thresholds.minimumFreshBrowserPriority, 'Collect more browser follow-up examples with fresh priority context.');
    addGap('action-routing-corrections', metrics.actionCorrections, thresholds.minimumActionCorrections, 'Collect more corrections for wrong local/browser action routing.');
    addGap('fresh-live-context', metrics.freshLiveBrowserCandidates, thresholds.minimumFreshLiveContext, 'Collect more follow-up feedback while live browser/session candidates are fresh.');
    addGap('desktop-follow-up-targets', metrics.freshDesktopBestTargets, thresholds.minimumFreshDesktopTargets, 'Collect more app/file/game/window follow-up feedback while a fresh desktop target is visible.');

    const priorityKnown = metrics.priorityKnown;
    if (priorityKnown > 0 && metrics.staleOrMissingPriority > priorityKnown) {
      gaps.push({ kind: 'stale-priority-context', current: metrics.staleOrMissingPriority, target: priorityKnown, remaining: metrics.staleOrMissingPriority - priorityKnown, text: 'Priority context is stale or missing too often; mark feedback immediately after browser/file actions.' });
    } else if (metrics.priorityMissing > Math.max(3, Math.floor(metrics.feedbackRecords * 0.4))) {
      gaps.push({ kind: 'missing-priority-context', current: metrics.priorityMissing, target: Math.max(0, Math.floor(metrics.feedbackRecords * 0.4)), remaining: metrics.priorityMissing - Math.max(0, Math.floor(metrics.feedbackRecords * 0.4)), text: 'Too many feedback records lack route/priority context; collect feedback from routed turns, not only greetings.' });
    }

    let level = 'needs-data';
    let text = 'Collect more GOOD/FIX feedback before local training.';
    if (metrics.feedbackRecords === 0) {
      level = 'empty';
      text = 'No evolution feedback yet. Collect GOOD / WRONG / FIX signals first.';
    } else if (metrics.liveContextKnown > 0 && metrics.noLiveTargets > Math.max(2, Math.floor(metrics.liveContextKnown * 0.5))) {
      level = 'live-context-gap';
      text = 'Training data often has no fresh local/live target. Trigger feedback immediately after browser, file, app, or window actions.';
    } else if (gaps.some((gap) => gap.kind === 'stale-priority-context' || gap.kind === 'missing-priority-context')) {
      level = 'context-gap';
      text = 'Training data has context gaps. Prioritize browser/file follow-up feedback with fresh active references.';
    } else if (gaps.length) {
      level = 'collect-more';
      text = gaps[0].text;
    } else {
      level = 'ready';
      text = 'Training readiness looks healthy: style, corrections, preferences, and priority context are represented.';
    }

    return {
      schema: 'hex.training-data-health.v1',
      level,
      text,
      ready: level === 'ready',
      metrics,
      thresholds,
      categories,
      gaps
    };
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
        context: quality.context || null,
        recovery: quality.recovery || quality.context?.recovery || null
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
    const counts = { rawRows: rows.length, sft: sft.length, preferences: preferences.length };
    const manifest = {
      schema: 'hex.clean-dataset-manifest.v1',
      createdAt: new Date().toISOString(),
      rawPath: FINETUNE_PATH,
      sftPath,
      preferencePath,
      counts,
      intents,
      languages,
      trainingDataHealth: buildTrainingDataHealth(rows, counts)
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
        priority: {
          known: 0,
          missing: 0,
          freshBrowser: 0,
          freshAction: 0,
          backgroundOnly: 0,
          staleOrMissing: 0
        },
        localLive: {
          known: 0,
          freshBrowser: 0,
          freshDesktopBestTargets: 0,
          staleCandidates: 0,
          noLiveTargets: 0
        },
        recovery: {
          known: 0,
          staleReferenceRefusals: 0,
          actionRecoveryMessages: 0
        },
        trainingDataHealth: null,
      };
      if (!stats.exists) {
        stats.trainingDataHealth = buildTrainingDataHealth([], { preferences: 0, sft: 0 });
        return { success: true, stats };
      }
      const file = fs.statSync(FINETUNE_PATH);
      stats.bytes = file.size;
      const raw = fs.readFileSync(FINETUNE_PATH, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      stats.lines = lines.length;
      const parsedRows = [];
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          parsedRows.push(row);
          if (row.type === 'hex_evolution_feedback') {
            stats.evolutionRecords++;
            if (row.signal === 'good') stats.good++;
            else if (row.signal === 'wrong') stats.wrong++;
            else if (row.signal === 'fix') stats.fix++;
            if (row.quality?.usableForSft) stats.usableSft++;
            if (row.quality?.usableForPreference) stats.usablePreference++;
            if (row.quality?.usableAsNegative) stats.usableNegative++;
            const priority = row.quality?.context?.priority || null;
            const hasPriority = priority?.known === true || row.context?.priorityReferences;
            if (hasPriority) stats.priority.known++;
            else stats.priority.missing++;
            if (priority?.freshBrowserReference === true) stats.priority.freshBrowser++;
            if (priority?.freshActionReference === true) stats.priority.freshAction++;
            if (priority?.onlyBackgroundReferences === true) stats.priority.backgroundOnly++;
            if (!hasPriority || priority?.onlyBackgroundReferences === true || row.quality?.context?.serverPacketStale === true) stats.priority.staleOrMissing++;
            const live = row.quality?.context?.localLive || null;
            if (live?.known === true) stats.localLive.known++;
            if (live?.freshBrowserCandidates === true) stats.localLive.freshBrowser++;
            if (live?.freshDesktopBestTarget === true) stats.localLive.freshDesktopBestTargets++;
            if (live?.hasOnlyStaleLocalTargets === true) stats.localLive.staleCandidates++;
            if (live?.known === true && !live.freshBrowserCandidates && !live.hasFreshLocalTargets && !live.hasOnlyStaleLocalTargets) stats.localLive.noLiveTargets++;
            const recovery = row.quality?.recovery || row.quality?.context?.recovery || null;
            if (recovery?.known === true) stats.recovery.known++;
            if (recovery?.staleReferenceRefusal === true) stats.recovery.staleReferenceRefusals++;
            if (recovery?.actionRecoveryMessage === true) stats.recovery.actionRecoveryMessages++;
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
      stats.trainingDataHealth = buildTrainingDataHealth(parsedRows, { preferences: stats.preferencePairs, sft: stats.chatSamples });
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
