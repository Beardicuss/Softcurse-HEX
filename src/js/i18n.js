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

  getRaw(key) {
    return this.strings[key] || (this.loaded['en'] && this.loaded['en'][key]) || null;
  }

  getAssistantName(mode = 'hex', style = 'short') {
    if (mode === 'cardinal') {
      const cardinalKey = style === 'display' ? 'cardinal_name_display' : 'cardinal_name';
      const localizedCardinal = this.t(cardinalKey);
      return localizedCardinal !== cardinalKey
        ? localizedCardinal
        : (style === 'display' ? 'Cardinal' : 'CARDINAL');
    }
    const key = style === 'display' ? 'assistant_name_display' : 'assistant_name';
    const localizedHex = this.t(key);
    return localizedHex !== key
      ? localizedHex
      : (style === 'display' ? 'H.E.X.' : 'HEX');
  }

  getLocalizedUserName(name) {
    const userName = (name || 'Operator').trim();
    if (!userName) return this.t('user_label');
    if (this.locale === 'en' || /[^\u0000-\u007F]/.test(userName)) return userName;

    const aliases = this.getRaw('user_name_aliases');
    if (aliases && typeof aliases === 'object') {
      if (aliases[userName]) return aliases[userName];
      const match = Object.keys(aliases).find((key) => key.toLowerCase() === userName.toLowerCase());
      if (match) return aliases[match];
    }

    return this.transliterateName(userName);
  }

  transliterateName(name) {
    if (!name || this.locale === 'en' || /[^\u0000-\u007F]/.test(name)) return name;
    return String(name)
      .split(/(\s+|-)/)
      .map((part) => /[A-Za-z]/.test(part) ? this.transliterateWord(part) : part)
      .join('');
  }

  transliterateWord(word) {
    const source = String(word || '');
    if (!source) return source;

    const localeMaps = {
      ru: {
        pairs: {
          shch: 'щ', yo: 'ё', zh: 'ж', kh: 'х', ts: 'ц', ch: 'ч', sh: 'ш',
          yu: 'ю', ya: 'я', ye: 'е', ph: 'ф', qu: 'кв'
        },
        singles: {
          a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
          i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
          q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс',
          y: 'и', z: 'з'
        }
      },
      ka: {
        pairs: {
          shch: 'შჩ', ch: 'ჩ', sh: 'შ', zh: 'ჟ', kh: 'ხ', ts: 'ც', dz: 'ძ',
          gh: 'ღ', ph: 'ფ', qu: 'კვ'
        },
        singles: {
          a: 'ა', b: 'ბ', c: 'კ', d: 'დ', e: 'ე', f: 'ფ', g: 'გ', h: 'ჰ',
          i: 'ი', j: 'ჯ', k: 'კ', l: 'ლ', m: 'მ', n: 'ნ', o: 'ო', p: 'პ',
          q: 'ქ', r: 'რ', s: 'ს', t: 'ტ', u: 'უ', v: 'ვ', w: 'ვ', x: 'ექს',
          y: 'ი', z: 'ზ'
        }
      }
    };

    const map = localeMaps[this.locale];
    if (!map) return source;

    const lower = source.toLowerCase();
    let out = '';
    let i = 0;

    while (i < lower.length) {
      let matched = false;
      for (const [chunk, value] of Object.entries(map.pairs)) {
        if (lower.startsWith(chunk, i)) {
          out += value;
          i += chunk.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      out += map.singles[lower[i]] || source[i];
      i += 1;
    }

    if (this.locale === 'ru' && /^[A-Z]/.test(source)) {
      return out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
  }

  getDateLocale() {
    const map = {
      en: 'en-US',
      ru: 'ru-RU',
      ka: 'ka-GE'
    };
    return map[this.locale] || 'en-US';
  }

  formatDate(value, options = {}) {
    try {
      return new Date(value).toLocaleDateString(this.getDateLocale(), options);
    } catch (_) {
      return new Date(value).toLocaleDateString('en-US', options);
    }
  }

  formatTime(value, options = {}) {
    try {
      return new Date(value).toLocaleTimeString(this.getDateLocale(), options);
    } catch (_) {
      return new Date(value).toLocaleTimeString('en-US', options);
    }
  }

  getRandomPhrase(key, vars = {}) {
    let pool = this.t(key);
    if (!Array.isArray(pool) || pool.length === 0) {
      pool = (this.loaded['en'] && this.loaded['en'][key]) || [];
    }
    if (!Array.isArray(pool) || pool.length === 0) return key;
    const chosen = pool[Math.floor(Math.random() * pool.length)] || key;
    let text = chosen;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, value);
    }
    return text;
  }

  // ── Smart break suggestion picker ──────────────────────────────────────────
  // Selects randomly from the phrase pool with:
  //   • Anti-repeat (never the same phrase twice in a row)
  //   • Time-awareness (bonus phrases for morning / late-night sessions)
  //   • {name} and {min} substitution
  //   • Graceful fallback if pool is missing
  getRandomBreakSuggestion(name, minutes) {
    const userName = this.getLocalizedUserName(name || 'Operator');
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
    const userName = this.getLocalizedUserName(name || 'Operator');
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
    document.documentElement.lang = this.locale;
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
