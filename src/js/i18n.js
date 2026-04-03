'use strict';
// ── i18n: translation engine with smart break suggestion system ───────────────

class I18n {
  constructor() {
    this.locale = 'en';
    this.strings = {};
    this.loaded = {};
    this._lastBreakIdx = -1;   // anti-repeat: never pick the same phrase twice in a row
  }

  async load(locale) {
    if (!this.loaded[locale]) {
      try {
        const res = await fetch(`locales/${locale}.json`);
        this.loaded[locale] = await res.json();
      } catch (e) {
        console.warn(`i18n: failed to load ${locale}`, e);
        this.loaded[locale] = this.loaded['en'] || {};
      }
    }
    // Always ensure English is loaded as fallback base
    if (locale !== 'en' && !this.loaded['en']) {
      try {
        const res = await fetch('locales/en.json');
        this.loaded['en'] = await res.json();
      } catch (_) { }
    }
    this.locale = locale;
    this.strings = this.loaded[locale];
    this._lastBreakIdx = -1;  // reset anti-repeat on locale change
    this.apply();
  }

  t(key, vars = {}) {
    let s = this.strings[key] || (this.loaded['en'] && this.loaded['en'][key]) || key;
    if (Array.isArray(s)) return s;
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  }

  // ── Smart break suggestion picker ──────────────────────────────────────────
  // Selects randomly from the phrase pool with:
  //   • Anti-repeat (never the same phrase twice in a row)
  //   • Time-awareness (bonus phrases for morning / late-night sessions)
  //   • {name} and {min} substitution
  //   • Graceful fallback if pool is missing
  getRandomBreakSuggestion(name, minutes) {
    const userName = (name || 'Operator').trim();
    const min = parseInt(minutes) || 90;
    const hour = new Date().getHours();

    // Get the phrase pool for current locale, fall back to English
    let pool = this.t('break_suggestions');
    if (!Array.isArray(pool) || pool.length === 0) {
      pool = (this.loaded['en'] && this.loaded['en']['break_suggestions']) || [];
    }
    if (!Array.isArray(pool) || pool.length === 0) {
      // Hard fallback — shouldn't ever be needed but safety net
      return this.t('break_suggestion', { min, name: userName });
    }

    // Build weighted index list — exclude last used index
    let candidates = pool.map((_, i) => i).filter(i => i !== this._lastBreakIdx);

    // Time-aware bonus: bias toward the last few phrases if they're time-relevant
    // Phrases at indices 15-17 tend to be the "late addition" bonus phrases —
    // give them a slight extra weight at edge-of-day hours
    if (hour >= 22 || hour <= 5) {
      // Late night: add these twice to double their probability
      const lateNight = candidates.filter(i => i >= Math.floor(pool.length * 0.7));
      candidates = [...candidates, ...lateNight];
    } else if (hour >= 6 && hour <= 9) {
      // Morning boost: prefer earlier, energetic phrases
      const morning = candidates.filter(i => i < Math.floor(pool.length * 0.4));
      candidates = [...candidates, ...morning];
    }

    // Pick random candidate
    const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)];
    this._lastBreakIdx = chosenIdx;

    // Substitute placeholders
    return pool[chosenIdx]
      .replace(/\{name\}/g, userName)
      .replace(/\{min\}/g, String(min));
  }

  getRandomWelcomePhrase(name) {
    const userName = (name || 'Operator').trim();
    let pool = this.t('welcome_phrases');
    if (!Array.isArray(pool) || pool.length === 0) {
      pool = (this.loaded['en'] && this.loaded['en']['welcome_phrases']) || [];
    }
    if (!Array.isArray(pool) || pool.length === 0) {
      return this.t('hex_greeting', { name: userName });
    }
    const chosenIdx = Math.floor(Math.random() * pool.length);
    return pool[chosenIdx].replace(/\{name\}/g, userName);
  }

  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const val = this.t(key);
      if (attr) el.setAttribute(attr, val);
      else if (!Array.isArray(val)) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
    });
  }
}

window.i18n = new I18n();
