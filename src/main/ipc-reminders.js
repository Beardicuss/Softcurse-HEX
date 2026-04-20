'use strict';
// ── main/ipc-reminders.js ─────────────────────────────────────────────────────
// IPC handlers: reminders:set/cancel, schedule:add-recurring/cancel/list
// Manages persistence across restarts via JSON files.

const fs   = require('fs');
const path = require('path');

module.exports = function registerRemindersIPC({
  ipcMain, app,
  schedule,           // node-schedule
  safeSend, sendLog,
}) {
  const REMINDERS_PATH = path.join(app.getPath('userData'), 'reminders.json');
  const SCHEDULES_PATH = path.join(app.getPath('userData'), 'schedules.json');

  const activeReminders = new Map();   // id → { job, label, fireAt }
  const activeSchedules = new Map();   // id → { job, cron, label, command }

  // ── Persistence helpers ────────────────────────────────────────────────────
  function saveReminders() {
    try {
      const arr = [];
      for (const [id, data] of activeReminders) {
        arr.push({ id, label: data.label, fireAt: data.fireAt });
      }
      fs.writeFileSync(REMINDERS_PATH, JSON.stringify(arr, null, 2));
    } catch (e) { console.warn('Failed to save reminders:', e.message); }
  }

  function saveSchedules() {
    try {
      const arr = [];
      for (const [id, data] of activeSchedules) {
        arr.push({ id, cron: data.cron, label: data.label, command: data.command });
      }
      fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(arr, null, 2));
    } catch (e) { console.warn('Failed to save schedules:', e.message); }
  }

  // ── Load persisted state on app ready ─────────────────────────────────────
  function loadPersistedReminders() {
    try {
      if (!fs.existsSync(REMINDERS_PATH)) return;
      const saved = JSON.parse(fs.readFileSync(REMINDERS_PATH, 'utf8'));
      const now   = Date.now();
      for (const r of saved) {
        const remaining = new Date(r.fireAt).getTime() - now;
        if (remaining > 0) {
          const job = schedule.scheduleJob(new Date(r.fireAt), () => {
            safeSend('reminder:fire', { id: r.id, label: r.label });
            sendLog('HEX', `Reminder fired: ${r.label}`, 'info');
            activeReminders.delete(r.id);
            saveReminders();
          });
          activeReminders.set(r.id, { job, label: r.label, fireAt: r.fireAt });
        } else {
          // Missed while app was closed — fire immediately
          safeSend('reminder:fire', { id: r.id, label: r.label });
          sendLog('HEX', `Missed reminder fired: ${r.label}`, 'info');
        }
      }
      if (activeReminders.size > 0) {
        sendLog('HEX', `Restored ${activeReminders.size} persisted reminder(s).`, 'info');
      }
    } catch (e) { console.warn('Failed to load reminders:', e.message); }
  }

  function loadPersistedSchedules() {
    try {
      if (!fs.existsSync(SCHEDULES_PATH)) return;
      const saved = JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf8'));
      for (const s of saved) {
        if (!s.id || !s.cron || !s.command) continue;
        const job = schedule.scheduleJob(s.cron, () => {
          safeSend('recurring:fire', { id: s.id, label: s.label, command: s.command });
          sendLog('HEX', `Schedule fired: ${s.label}`, 'info');
        });
        activeSchedules.set(s.id, { job, cron: s.cron, label: s.label, command: s.command });
      }
      if (activeSchedules.size > 0) {
        sendLog('HEX', `Restored ${activeSchedules.size} persisted schedule(s).`, 'info');
      }
    } catch (e) { console.warn('Failed to load schedules:', e.message); }
  }

  // ── Reminder IPC ───────────────────────────────────────────────────────────
  ipcMain.handle('reminders:set', (_, { id, label, delayMs }) => {
    if (activeReminders.has(id)) activeReminders.get(id).job.cancel();
    const fireAt = new Date(Date.now() + delayMs).toISOString();
    const job    = schedule.scheduleJob(new Date(fireAt), () => {
      safeSend('reminder:fire', { id, label });
      sendLog('HEX', `Reminder fired: ${label}`, 'info');
      activeReminders.delete(id);
      saveReminders();
    });
    activeReminders.set(id, { job, label, fireAt });
    saveReminders();
    sendLog('HEX', `Reminder set: "${label}" in ${Math.round(delayMs / 60000)} min`, 'info');
    return { success: true, fireAt };
  });

  ipcMain.handle('reminders:cancel', (_, id) => {
    if (activeReminders.has(id)) {
      activeReminders.get(id).job.cancel();
      activeReminders.delete(id);
      saveReminders();
      return { success: true };
    }
    return { success: false, error: 'Not found' };
  });

  // ── Recurring schedule IPC ─────────────────────────────────────────────────
  ipcMain.handle('schedule:add-recurring', (_, { cron, label, command }) => {
    const id = 'sch_' + Date.now();
    try {
      const job = schedule.scheduleJob(cron, () => {
        safeSend('recurring:fire', { id, label, command });
        sendLog('HEX', `Schedule fired: ${label}`, 'info');
      });
      if (!job) throw new Error('Invalid CRON expression');
      activeSchedules.set(id, { job, cron, label, command });
      saveSchedules();
      sendLog('HEX', `Recurring schedule created: "${label}" (${cron})`, 'info');
      return { success: true, id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('schedule:cancel-recurring', (_, { id }) => {
    if (activeSchedules.has(id)) {
      activeSchedules.get(id).job.cancel();
      activeSchedules.delete(id);
      saveSchedules();
      sendLog('HEX', `Recurring schedule canceled: ${id}`, 'info');
      return { success: true };
    }
    return { success: false, error: 'Not found' };
  });

  ipcMain.handle('schedule:list-recurring', () => {
    const arr = [];
    for (const [id, data] of activeSchedules) {
      arr.push({ id, cron: data.cron, label: data.label, command: data.command });
    }
    return arr;
  });

  // ── Expose activeReminders so morning-digest can read pending reminders ────
  return { loadPersistedReminders, loadPersistedSchedules, activeReminders };
};
