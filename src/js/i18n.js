'use strict';
// ── i18n: minimal translation engine ─────────────────────────────────────────

class I18n {
  constructor() {
    this.locale = 'en';
    this.strings = {};
    this.loaded = {};
  }

  async load(locale) {
    if (!this.loaded[locale]) {
      try {
        const res = await fetch(`../locales/${locale}.json`);
        this.loaded[locale] = await res.json();
      } catch (e) {
        console.warn(`i18n: failed to load ${locale}`, e);
        this.loaded[locale] = this.loaded['en'] || {};
      }
    }
    this.locale = locale;
    this.strings = this.loaded[locale];
    this.apply();
  }

  t(key, vars = {}) {
    let s = this.strings[key] || (this.loaded['en'] && this.loaded['en'][key]) || key;
    if (Array.isArray(s)) return s; // return arrays as-is (e.g. break_suggestions pool)
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  }

  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const val = this.t(key);
      if (attr) el.setAttribute(attr, val);
      else el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
    });
  }
}

window.i18n = new I18n();
