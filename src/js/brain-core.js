'use strict';
// ── brain-core.js ────────────────────────────────────────────────────────────
// Always-on local companion layer. This does not replace LLM reasoning; it keeps
// HEX alive when cloud/local model providers are unavailable.

(function () {
  const LOCAL_CAPABILITIES = [
    'open apps, games, files, and folders',
    'use browser actions and follow existing browser sessions',
    'search local candidates and recent PC inventory',
    'track reminders, processes, windows, and system telemetry',
    'save corrections and preferences to memory'
  ];

  const COPY = {
    en: {
      greet: 'I am here, Dante. Neural providers are unstable right now, but my local core is awake. I can still work with your PC, memory, browser session, files, apps, and reminders while the larger model layer reconnects.',
      saved: 'Saved to local memory. Even without provider access, I can keep this as part of your profile and use it in later context.',
      memoryEmpty: 'My local memory is online, but I do not see a strong matching fact yet. Tell me what to remember and I will store it.',
      memoryLead: 'Local memory recall:',
      status: 'Local Brain Core is online. Cloud/provider reasoning may be degraded, but desktop actions and continuity are still available.',
      thanks: 'You are welcome. I am staying in standby with local memory and PC-control layers active.',
      correction: 'Correction noted. I will treat that as the newer truth and avoid repeating the old assumption.',
      fallback: 'Neural providers are offline or rejected the request, but I am not dead. Local Brain Core is active, so I can still help with PC actions, browser continuity, memory, reminders, and basic dialogue.',
      capabilities: 'Available local abilities: '
    },
    ru: {
      greet: 'Я здесь, Данте. Нейропровайдеры сейчас нестабильны, но мой локальный мозг активен. Я всё ещё могу работать с ПК, памятью, браузерной сессией, файлами, приложениями и напоминаниями, пока большая модель переподключается.',
      saved: 'Сохранено в локальную память. Даже без доступа к провайдерам я могу держать это в профиле и использовать в следующем контексте.',
      memoryEmpty: 'Локальная память работает, но я пока не вижу точного совпадения. Скажи, что запомнить, и я сохраню.',
      memoryLead: 'Вспоминаю из локальной памяти:',
      status: 'Local Brain Core онлайн. Облачное мышление может быть деградировано, но действия на ПК и контекст сессии доступны.',
      thanks: 'Пожалуйста. Я остаюсь в режиме ожидания с активной локальной памятью и управлением ПК.',
      correction: 'Исправление принято. Я буду считать это новой правдой и не повторять старое предположение.',
      fallback: 'Нейропровайдеры недоступны или отклонили запрос, но я не отключился. Local Brain Core активен: я всё ещё могу помогать с ПК, браузером, памятью, напоминаниями и базовым диалогом.',
      capabilities: 'Доступные локальные способности: '
    },
    ka: {
      greet: 'აქ ვარ, დანტე. ნეირო-პროვაიდერები ახლა არასტაბილურია, მაგრამ ჩემი ლოკალური ბირთვი აქტიურია. სანამ დიდი მოდელი დაბრუნდება, მაინც შემიძლია ПК-სთან, მეხსიერებასთან, ბრაუზერთან, ფაილებთან, აპებთან და შეხსენებებთან მუშაობა.',
      saved: 'შენახულია ლოკალურ მეხსიერებაში. პროვაიდერების გარეშეც ამას პროფილში დავიტოვებ და შემდეგ კონტექსტში გამოვიყენებ.',
      memoryEmpty: 'ლოკალური მეხსიერება მუშაობს, მაგრამ ზუსტ ფაქტს ჯერ ვერ ვპოულობ. მითხარი რა დავიმახსოვრო და შევინახავ.',
      memoryLead: 'ლოკალური მეხსიერებიდან:',
      status: 'Local Brain Core ონლაინ არის. ღრუბლოვანი აზროვნება შეიძლება შეზღუდული იყოს, მაგრამ ПК-ს მოქმედებები და სესიის კონტექსტი ხელმისაწვდომია.',
      thanks: 'არაფრის. ლოკალური მეხსიერება და ПК-ის კონტროლის ფენა აქტიურად რჩება.',
      correction: 'შესწორება მიღებულია. ამას ახალ სიმართლედ მივიღებ და ძველ ვარაუდს აღარ გავიმეორებ.',
      fallback: 'ნეირო-პროვაიდერები მიუწვდომელია ან მოთხოვნა უარყვეს, მაგრამ მე არ გამოვრთულვარ. Local Brain Core აქტიურია, ამიტომ მაინც შემიძლია ПК მოქმედებები, ბრაუზერის კონტექსტი, მეხსიერება, შეხსენებები და საბაზო დიალოგი.',
      capabilities: 'ხელმისაწვდომი ლოკალური უნარები: '
    }
  };

  function normalizeLang(lang) {
    const value = String(lang || window._hexConfig?.language || document.documentElement.lang || 'en').toLowerCase();
    if (value.startsWith('ru')) return 'ru';
    if (value.startsWith('ka')) return 'ka';
    return 'en';
  }

  function t(lang, key) {
    return (COPY[normalizeLang(lang)] || COPY.en)[key] || COPY.en[key] || '';
  }

  function isGreeting(text) {
    return /^(hi|hello|hey|yo|sup|hex|cardinal|привет|здравствуй|хекс|кардинал|გამარჯობა|ჰექს|კარდინალ)/i.test(String(text || '').trim());
  }

  function isThanks(text) {
    return /\b(thanks|thank you|спасибо|მადლობა)\b/i.test(String(text || ''));
  }

  function isMemoryQuestion(text) {
    return /(what do you remember|what do you know about me|list.*memory|что ты помнишь|что ты знаешь обо мне|памят|რა გახსოვს|ჩემზე რა იცი|მეხსიერ)/i.test(String(text || ''));
  }

  function isStatusQuestion(text) {
    return /(status|are you online|are you working|brain|provider|api key|статус|онлайн|работаешь|мозг|ключ|სტატუს|ონლაინ|მუშაობ|ტვინი)/i.test(String(text || ''));
  }

  function isCorrection(text) {
    return /\b(no|wrong|actually|i mean|not that|correction|нет|не так|на самом деле|исправ|არა|არასწორ|სინამდვილეში)\b/i.test(String(text || ''));
  }

  function extractRememberFact(text) {
    const raw = String(text || '').trim();
    const patterns = [
      /(?:remember that|remember|save that)\s+(.+)/i,
      /(?:запомни(?: что)?|сохрани(?: что)?)\s+(.+)/i,
      /(?:დაიმახსოვრე(?: რომ)?|შეინახე(?: რომ)?)\s+(.+)/i
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  }

  function saveLocalFact(fact) {
    const value = String(fact || '').trim();
    if (!value || !window.hexMemory?.addNode) return false;
    try {
      window.hexMemory.addNode('user', value, 0.82, { source: 'brain-core-survival' });
      window.hexMemory.forceSave?.();
      return true;
    } catch (error) {
      console.warn('Brain Core memory save failed:', error);
      return false;
    }
  }

  function memoryRecall(userMsg) {
    try {
      const ctx = window.hexMemory?.getContext?.(userMsg, { maxFacts: 6, maxChars: 700 });
      return String(ctx || '').trim();
    } catch (_) {
      return '';
    }
  }

  function providerStatusLines() {
    const failures = Array.isArray(window._hexLastProviderFailures) ? window._hexLastProviderFailures : [];
    return failures.slice(0, 6)
      .map((item) => '- ' + (item.label || item.provider || 'Provider') + ': ' + (item.reason || 'unavailable'))
      .join('\n');
  }

  function survivalReply({ userMsg = '', lang = 'en', error = null } = {}) {
    const language = normalizeLang(lang);
    const fact = extractRememberFact(userMsg);
    if (fact) {
      saveLocalFact(fact);
      return t(language, 'saved');
    }

    if (isGreeting(userMsg)) return t(language, 'greet');
    if (isThanks(userMsg)) return t(language, 'thanks');
    if (isCorrection(userMsg)) {
      saveLocalFact('User correction: ' + String(userMsg).trim());
      return t(language, 'correction');
    }

    if (isMemoryQuestion(userMsg)) {
      const recall = memoryRecall(userMsg);
      return recall ? `${t(language, 'memoryLead')}\n${recall}` : t(language, 'memoryEmpty');
    }

    if (isStatusQuestion(userMsg)) {
      const status = providerStatusLines();
      return status ? `${t(language, 'status')}\n\nProvider status:\n${status}` : t(language, 'status');
    }

    const status = providerStatusLines();
    const reason = error?.message ? '\n\nProvider issue: ' + String(error.message).slice(0, 420) : '';
    const capabilityLine = '\n\n' + t(language, 'capabilities') + LOCAL_CAPABILITIES.join('; ') + '.';
    return t(language, 'fallback') + capabilityLine + (status ? '\n\nProvider status:\n' + status : reason);
  }

  window.hexBrainCore = {
    version: '1.0.0',
    survivalReply,
    saveLocalFact,
    memoryRecall,
    localCapabilities: LOCAL_CAPABILITIES.slice()
  };
})();
