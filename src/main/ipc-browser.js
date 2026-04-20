'use strict';
// ── main/ipc-browser.js ───────────────────────────────────────────────────────
// IPC handlers: butler:browser-open/search/scrape, web:scrape, web:search
// Also registers the app 'will-quit' hook to close the web agent browser.

module.exports = function registerBrowserIPC({
  ipcMain, app, shell,
  webAgent,
  butlerExec, sendLog,
}) {
  // ── Butler browser helpers (shell-based) ───────────────────────────────────

  ipcMain.handle('butler:browser-open', async (_, { url }) => {
    try {
      if (!url) return { success: false, error: 'No URL provided' };
      await shell.openExternal(url);
      sendLog('BUTLER', `Opened in browser: ${url}`);
      return { success: true, url };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Web sub-agent (Puppeteer-based) ───────────────────────────────────────

  ipcMain.handle('web:scrape', async (_, url) => {
    sendLog('WEB', `Scraping: ${url}`, 'info');
    try {
      const text = await webAgent.scrape(url);
      return { success: true, text };
    } catch (e) {
      sendLog('WEB', `Scrape failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('web:search', async (_, query) => {
    sendLog('WEB', `Searching: ${query}`, 'info');
    try {
      const results = await webAgent.search(query);
      return { success: true, results };
    } catch (e) {
      sendLog('WEB', `Search failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  });

  // Close Puppeteer browser cleanly on quit
  app.on('will-quit', () => {
    webAgent.closeBrowser().catch(() => { });
  });
};
