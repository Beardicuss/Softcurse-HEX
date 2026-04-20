'use strict';
// ── main/ipc-clipboard.js ─────────────────────────────────────────────────────
// Clipboard history: 2-second poll, history/search/paste-item IPC handlers.

module.exports = function registerClipboardHistoryIPC({ ipcMain, clipboard }) {
  const MAX_CLIP_HISTORY = 50;
  const clipboardHistory = [];
  let   lastClipText     = '';

  function pollClipboard() {
    try {
      const current = clipboard.readText();
      if (current && current !== lastClipText && current.trim().length > 0) {
        lastClipText = current;
        clipboardHistory.unshift({ text: current.substring(0, 1000), ts: Date.now() });
        if (clipboardHistory.length > MAX_CLIP_HISTORY) clipboardHistory.pop();
      }
    } catch (_) {}
  }

  // Start polling — called once after app is ready
  function startClipboardPolling() {
    setInterval(pollClipboard, 2000);
  }

  ipcMain.handle('clipboard:history', () => ({
    success: true,
    items:   clipboardHistory.slice(0, 30),
  }));

  ipcMain.handle('clipboard:search', (_, { query }) => {
    const q     = (query || '').toLowerCase();
    const found = clipboardHistory.filter(c => c.text.toLowerCase().includes(q));
    return { success: true, items: found.slice(0, 20) };
  });

  ipcMain.handle('clipboard:paste-item', (_, { index }) => {
    const item = clipboardHistory[index];
    if (!item) return { success: false, error: 'Invalid index' };
    clipboard.writeText(item.text);
    return { success: true, text: item.text.substring(0, 100) };
  });

  return { startClipboardPolling };
};
