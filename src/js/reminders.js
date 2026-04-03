'use strict';
// ── Reminders ────────────────────────────────────────────────────────────────

class ReminderManager {
  constructor() {
    this.counter  = 0;
    this.onFire   = null; // fn({ id, label })
  }

  // Parse natural language duration strings
  // e.g. "30 minutes", "1 hour", "2 hours 30 minutes", "45 min"
  parseDuration(text) {
    let ms = 0;
    const h = text.match(/(\d+)\s*h(our)?s?/i);
    const m = text.match(/(\d+)\s*m(in(ute)?s?)?/i);
    const s = text.match(/(\d+)\s*s(ec(ond)?s?)?/i);
    if (h) ms += parseInt(h[1]) * 3600000;
    if (m) ms += parseInt(m[1]) * 60000;
    if (s) ms += parseInt(s[1]) * 1000;
    return ms;
  }

  // Parse user message for reminder intent
  // returns { found, label, delayMs } or { found: false }
  parseReminderIntent(text) {
    const lower = text.toLowerCase();
    const remindPatterns = [
      /remind (?:me )?(?:to )?(.+?) in ([\d\w\s]+)/i,
      /set (?:a )?(?:reminder|timer|alarm) (?:for |to )?(.+?) in ([\d\w\s]+)/i,
      /(?:in|after) ([\d\w\s]+),? remind (?:me )?(?:to )?(.+)/i,
    ];

    for (const pat of remindPatterns) {
      const m = text.match(pat);
      if (m) {
        const label   = (m[1] || m[2] || 'reminder').trim();
        const timeStr = (m[2] || m[1] || '').trim();
        const delayMs = this.parseDuration(timeStr);
        if (delayMs > 0) return { found: true, label, delayMs };
      }
    }
    return { found: false };
  }

  async set(label, delayMs) {
    const id = `reminder_${++this.counter}_${Date.now()}`;
    await window.hexAPI.setReminder({ id, label, delayMs });
    return { id, label, delayMs };
  }

  init() {
    window.hexAPI.onReminderFire((data) => {
      this.onFire?.(data);
    });
  }
}

window.reminders = new ReminderManager();
