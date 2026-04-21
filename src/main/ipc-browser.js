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
      return await webAgent.scrapeUrl(url);
    } catch (e) {
      sendLog('WEB', `Scrape failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('web:search', async (_, query) => {
    sendLog('WEB', `Searching: ${query}`, 'info');
    try {
      return await webAgent.searchWeb(query);
    } catch (e) {
      sendLog('WEB', `Search failed: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  });

  // ── Controlled visible browser ─────────────────────────────────────────────

  ipcMain.handle('web:navigate', async (_, { url }) => {
    sendLog('WEB', `Navigate: ${url}`, 'info');
    try { return await webAgent.navigateTo(url); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:smart-search', async (_, { query, siteUrl }) => {
    sendLog('WEB', `Smart search: "${query}" on ${siteUrl || 'current page'}`, 'info');
    try { return await webAgent.smartSearch(query, siteUrl); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:type', async (_, { selector, text }) => {
    try { return await webAgent.typeText(selector, text); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:click', async (_, { selector }) => {
    try { return await webAgent.clickElement(selector); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:find-click', async (_, { text }) => {
    sendLog('WEB', `Find and click: "${text}"`, 'info');
    try { return await webAgent.findAndClick(text); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:fill-submit', async (_, { selector, text }) => {
    try { return await webAgent.fillAndSubmit(selector, text); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:back',    async () => { try { return await webAgent.goBack();      } catch (e) { return { success: false, error: e.message }; } });
  ipcMain.handle('web:forward', async () => { try { return await webAgent.goForward();   } catch (e) { return { success: false, error: e.message }; } });
  ipcMain.handle('web:refresh', async () => { try { return await webAgent.refreshPage(); } catch (e) { return { success: false, error: e.message }; } });

  ipcMain.handle('web:read-page', async () => {
    sendLog('WEB', 'Reading current page', 'info');
    try { return await webAgent.readCurrentPage(); }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('web:session-status', async () => {
    try { return await webAgent.getSessionStatus(); }
    catch (e) { return { open: false, error: e.message }; }
  });

  ipcMain.handle('web:close-browser', async () => {
    try { await webAgent.closeControlled(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // Close Puppeteer browser cleanly on quit
  app.on('will-quit', () => {
    webAgent.closeBrowser().catch(() => { });
  });
};
