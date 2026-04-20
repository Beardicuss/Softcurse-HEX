'use strict';
// ── main/ipc-hunter.js ────────────────────────────────────────────────────────
// Background credential-hunter scheduling.
// Fixes the packaged-build ENOENT crash:
//   In a packaged app __dirname resolves inside the ASAR archive.
//   spawn() cannot launch a script from inside an ASAR — it needs a real
//   filesystem path. We copy the script to userData on first run so the
//   path is always valid regardless of packaging.

const fs = require('fs');
const path = require('path');

module.exports = function registerHunterIPC({
  ipcMain, app,
  spawn,
  getConfig,
  sendLog,
}) {
  const userDataPath = app.getPath('userData');
  const hunterTimestampFile = path.join(userDataPath, 'hunter-last-run.json');

  // ── Resolve a real-filesystem path for the hunter script ──────────────────
  // Source location inside the repo / ASAR
  const hunterSrc = path.join(__dirname, '..', '..', 'ai', 'credential-hunter.js');

  // Destination outside the ASAR — always accessible to spawn()
  const hunterDest = path.join(userDataPath, 'credential-hunter.js');

  function ensureHunterScript() {
    // Nothing to do if the source doesn't exist (feature disabled / not shipped)
    if (!fs.existsSync(hunterSrc)) return false;
    try {
      // Copy whenever the source is newer than the destination
      const srcMtime = fs.statSync(hunterSrc).mtimeMs;
      const destMtime = fs.existsSync(hunterDest) ? fs.statSync(hunterDest).mtimeMs : 0;
      if (srcMtime > destMtime) {
        fs.mkdirSync(path.dirname(hunterDest), { recursive: true });
        fs.copyFileSync(hunterSrc, hunterDest);
      }
      return true;
    } catch (e) {
      sendLog('HUNTER', `Could not copy hunter script: ${e.message}`, 'warn');
      return false;
    }
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────
  let _hunterTimer = null;
  let _hunterRunning = false;

  function runHunterNow() {
    if (_hunterRunning) {
      sendLog('HUNTER', 'Hunter is already explicitly running.', 'warn');
      return;
    }
    if (app.isQuiting) return;
    if (!ensureHunterScript()) return;

    if (_hunterTimer) {
      clearTimeout(_hunterTimer);
      _hunterTimer = null;
    }

    _hunterRunning = true;
    const config = getConfig();
    const userLimitMinutes = config.llm?.hunterLimitMinutes || 1440;

    sendLog('HUNTER', `Spawning credential-hunter.js (interval: ${userLimitMinutes} min)`, 'info');

    try {
      fs.writeFileSync(
        hunterTimestampFile,
        JSON.stringify({ lastRun: Date.now(), date: new Date().toISOString() })
      );

      // Use the real-filesystem copy — never the ASAR path
      const hunterProc = spawn(process.execPath, [hunterDest], {
        cwd: userDataPath,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          HEX_USER_DATA: userDataPath,
          HEX_HUNTER_LIMIT: String(userLimitMinutes),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuf = '';
      hunterProc.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop();
        for (const line of lines) if (line.trim()) sendLog('HUNTER', line.trim(), 'info');
      });

      let stderrBuf = '';
      hunterProc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop();
        for (const line of lines) if (line.trim()) sendLog('HUNTER', line.trim(), 'warn');
      });

      hunterProc.on('close', (code) => {
        _hunterRunning = false;
        sendLog('HUNTER', `Credential hunter finished (code ${code}). Next run in ${userLimitMinutes} min.`, 'info');
        scheduleHunter();
      });

      hunterProc.on('error', (err) => {
        _hunterRunning = false;
        sendLog('HUNTER', `Spawn error: ${err.message}`, 'warn');
        setTimeout(scheduleHunter, 60000);
      });

      hunterProc.unref();
      return true;
    } catch (err) {
      _hunterRunning = false;
      sendLog('SYSTEM', `Fatal error spawning hunter: ${err.message}`, 'warn');
      setTimeout(scheduleHunter, 60000);
      return false;
    }
  }

  function scheduleHunter() {
    if (_hunterTimer) { clearTimeout(_hunterTimer); _hunterTimer = null; }
    if (app.isQuiting || _hunterRunning) return;

    if (!ensureHunterScript()) return;

    const config = getConfig();
    const userLimitMinutes = config.llm?.hunterLimitMinutes || 1440;
    const COOLDOWN_MS = userLimitMinutes * 60 * 1000;
    let delayMs = 0;

    try {
      if (fs.existsSync(hunterTimestampFile)) {
        const { lastRun } = JSON.parse(fs.readFileSync(hunterTimestampFile, 'utf8'));
        const elapsed = Date.now() - lastRun;
        if (elapsed < COOLDOWN_MS) delayMs = COOLDOWN_MS - elapsed;
      }
    } catch (_) { /* corrupt timestamp — run immediately */ }

    if (delayMs > 0) {
      sendLog('HUNTER', `Sleeping. Next run in ${Math.ceil(delayMs / 60000)} min.`, 'info');
    } else {
      sendLog('HUNTER', 'Cooldown passed. Auto-launching credential hunter now...', 'info');
    }

    _hunterTimer = setTimeout(() => {
      _hunterTimer = null;
      runHunterNow();
    }, delayMs);
  }

  // ── IPC ───────────────────────────────────────────────────────────────────

  ipcMain.handle('hunter:runNow', () => {
    sendLog('HUNTER', 'Manual trigger received. Overriding schedule constraints.', 'info');
    runHunterNow();
    return { success: true };
  });

  ipcMain.handle('hunter:reschedule', () => {
    sendLog('HUNTER', 'Settings changed — rescheduling credential hunter.', 'info');
    scheduleHunter();
    return { success: true };
  });

  ipcMain.handle('hunter:status', () => {
    const config = getConfig();
    const userLimitMinutes = config.llm?.hunterLimitMinutes || 1440;
    const COOLDOWN_MS = userLimitMinutes * 60 * 1000;
    let delayMs = 0;
    try {
      if (fs.existsSync(hunterTimestampFile)) {
        const { lastRun } = JSON.parse(fs.readFileSync(hunterTimestampFile, 'utf8'));
        const elapsed = Date.now() - lastRun;
        if (elapsed < COOLDOWN_MS) delayMs = COOLDOWN_MS - elapsed;
      }
    } catch (_) { }
    return { delayMs, userLimitMinutes };
  });

  return { scheduleHunter };
};
