'use strict';
// == ipc-games.js == Game Library Discovery & Launchers ======================
// Extracted from main.js

const { ipcMain } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = function registerGamesIPC({ sendLog, shell, butlerExec, buildAppFinderPS }) {

// Discover all installed Steam games
ipcMain.handle('butler:get-steam-games', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  try {
    // Find Steam library folders
    const steamPaths = [];
    const regQuery = await butlerExec(
      'reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v SteamPath 2>nul', { timeout: 5000 }
    );
    const steamMatch = regQuery.out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (steamMatch) {
      const steamRoot = steamMatch[1].trim().replace(/\//g, '\\');
      steamPaths.push(steamRoot);
      // Parse libraryfolders.vdf for additional library paths
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        const pathMatches = [...vdf.matchAll(/"path"\s+"([^"]+)"/gi)];
        pathMatches.forEach(m => {
          const p = m[1].replace(/\\\\/g, '\\');
          if (!steamPaths.includes(p)) steamPaths.push(p);
        });
      }
    }
    if (!steamPaths.length) return { success: false, error: 'Steam not found', games: [] };

    const games = [];
    for (const steamPath of steamPaths) {
      const appsDir = path.join(steamPath, 'steamapps');
      if (!fs.existsSync(appsDir)) continue;
      const acfFiles = fs.readdirSync(appsDir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
      for (const acf of acfFiles) {
        try {
          const content = fs.readFileSync(path.join(appsDir, acf), 'utf8');
          const appid   = (content.match(/"appid"\s+"(\d+)"/i) || [])[1];
          const name    = (content.match(/"name"\s+"([^"]+)"/i) || [])[1];
          const dir     = (content.match(/"installdir"\s+"([^"]+)"/i) || [])[1];
          if (appid && name) games.push({ appid, name, dir: dir || '', platform: 'steam' });
        } catch (_) {}
      }
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    sendLog('BUTLER', `Found ${games.length} Steam games`);
    return { success: true, games, count: games.length };
  } catch (e) { return { success: false, error: e.message, games: [] }; }
});

// Discover Epic Games Store games
ipcMain.handle('butler:get-epic-games', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  try {
    const manifestDir = path.join(
      process.env['ProgramData'] || 'C:\\ProgramData',
      'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'
    );
    if (!fs.existsSync(manifestDir)) return { success: false, error: 'Epic Games not installed', games: [] };
    const games = [];
    const files = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
        if (data.AppName && data.DisplayName) {
          games.push({
            appid:    data.AppName,
            name:     data.DisplayName,
            dir:      data.InstallLocation || '',
            platform: 'epic'
          });
        }
      } catch (_) {}
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    sendLog('BUTLER', `Found ${games.length} Epic games`);
    return { success: true, games, count: games.length };
  } catch (e) { return { success: false, error: e.message, games: [] }; }
});

// Launch a game by name — searches Steam, Epic, GOG, then tries as a regular app
ipcMain.handle('butler:launch-game', async (_, { gameName }) => {
  const name = (gameName || '').trim().replace(/[.!?,;:]+$/, '').trim();
  const nl   = name.toLowerCase();
  sendLog('BUTLER', `Looking for game: "${name}"`);

  // Helper: fuzzy name match score
  const fuzzyMatch = (a, b) => {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (al === bl) return 1.0;
    if (al.includes(bl) || bl.includes(al)) return 0.9;
    // Word overlap
    const wa = new Set(al.split(/\s+/)), wb = new Set(bl.split(/\s+/));
    let hits = 0; for (const w of wa) if (wb.has(w) && w.length > 2) hits++;
    return hits / Math.max(wa.size, wb.size);
  };

  // 1. Try Steam
  try {
    const steamResult = await new Promise(resolve => {
      ipcMain.emit('butler:get-steam-games-internal', resolve);
    });
    // Inline the search
    const steamReg = await butlerExec(
      'reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v SteamPath 2>nul', { timeout: 5000 }
    );
    const steamMatch = steamReg.out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (steamMatch) {
      const steamRoot = steamMatch[1].trim().replace(/\//g, '\\');
      const allPaths = [steamRoot];
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        [...vdf.matchAll(/"path"\s+"([^"]+)"/gi)].forEach(m => {
          const p = m[1].replace(/\\\\/g, '\\');
          if (!allPaths.includes(p)) allPaths.push(p);
        });
      }
      let bestGame = null, bestScore = 0;
      for (const sp of allPaths) {
        const appsDir = path.join(sp, 'steamapps');
        if (!fs.existsSync(appsDir)) continue;
        for (const acf of fs.readdirSync(appsDir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))) {
          try {
            const content = fs.readFileSync(path.join(appsDir, acf), 'utf8');
            const appid = (content.match(/"appid"\s+"(\d+)"/i) || [])[1];
            const gname = (content.match(/"name"\s+"([^"]+)"/i) || [])[1];
            if (!appid || !gname) continue;
            const score = fuzzyMatch(gname, nl);
            if (score > bestScore) { bestScore = score; bestGame = { appid, name: gname }; }
          } catch (_) {}
        }
      }
      if (bestGame && bestScore >= 0.5) {
        const launchUrl = `steam://rungameid/${bestGame.appid}`;
        shell.openExternal(launchUrl);
        sendLog('BUTLER', `Launching Steam game: "${bestGame.name}" (appid: ${bestGame.appid})`);
        return { success: true, game: bestGame.name, platform: 'steam', appid: bestGame.appid };
      }
    }
  } catch (e) { sendLog('BUTLER', 'Steam search error: ' + e.message, 'warn'); }

  // 2. Try Epic Games
  try {
    const manifestDir = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    if (fs.existsSync(manifestDir)) {
      let bestGame = null, bestScore = 0;
      for (const file of fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
          const score = fuzzyMatch(data.DisplayName || '', nl);
          if (score > bestScore) { bestScore = score; bestGame = data; }
        } catch (_) {}
      }
      if (bestGame && bestScore >= 0.5) {
        const launchUri = `com.epicgames.launcher://apps/${bestGame.AppName}?action=launch`;
        shell.openExternal(launchUri);
        sendLog('BUTLER', `Launching Epic game: "${bestGame.DisplayName}"`);
        return { success: true, game: bestGame.DisplayName, platform: 'epic', appid: bestGame.AppName };
      }
    }
  } catch (e) { sendLog('BUTLER', 'Epic search error: ' + e.message, 'warn'); }

  // 3. Try GOG Galaxy
  try {
    const gogDb = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'GOG.com', 'Galaxy', 'storage', 'galaxy.db');
    if (fs.existsSync(gogDb)) {
      // GOG stores game paths — use PowerShell to query SQLite via ADO
      const ps = `Add-Type -Path "${gogDb}" -ErrorAction SilentlyContinue 2>$null; ` +
        `$conn = New-Object System.Data.SQLite.SQLiteConnection("Data Source=${gogDb}"); ` +
        `echo "GOG_SKIP"`; // Skip if SQLite lib not available
      const r = await butlerExec(`powershell -NoProfile -Command "${ps.replace(/"/g,'\\"')}"`, { timeout: 5000 });
      // Fallback: scan GOG paths from registry
    }
  } catch (_) {}

  // 4. Fallback: try as regular app name
  sendLog('BUTLER', `Game not found in launchers, trying as app: "${name}"`);
  const appResult = await new Promise(resolve => {
    const handler = (_, appName) => resolve(null);
    // Call open-app handler directly
    const tmpPs = path.join(os.tmpdir(), 'hex-find-game-' + Date.now() + '.ps1');
    fs.writeFileSync(tmpPs, buildAppFinderPS(name), 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, { shell: true, timeout: 20000 }, (err, stdout) => {
      try { fs.unlinkSync(tmpPs); } catch (_) {}
      const out = (stdout || '').trim();
      if (out.startsWith('FOUND:')) {
        const parts = out.split(':');
        const filePath = parts.slice(2, -1).join(':').trim() || parts.slice(2).join(':').trim();
        if (filePath) { shell.openPath(filePath); resolve({ success: true, game: name, method: 'filesystem' }); }
        else resolve({ success: false });
      } else {
        exec(`powershell -NoProfile -Command "Start-Process '${name.replace(/'/g,"''")}'"`, { shell: true, timeout: 8000 }, (e2) => {
          resolve(e2 ? { success: false, error: `Game "${name}" not found in Steam, Epic, or installed apps.` } : { success: true, game: name, method: 'direct' });
        });
      }
    });
  });

  return appResult || { success: false, error: `Could not find game: "${name}". Is it installed via Steam, Epic, or directly?` };
});
};
