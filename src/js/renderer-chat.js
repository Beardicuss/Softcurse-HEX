'use strict';

window.hexFeedbackBuffer = window.hexFeedbackBuffer || new Map();

// ── Script detection ──────────────────────────────────────────────────────────
// Detects the dominant script in a string and returns a BCP-47 language tag.
// Used to set lang= on chat bubbles so CSS :lang() and browser hyphenation work.

function detectLang(text) {
  if (!text || text.length < 4) return null;

  // Count characters in each Unicode block
  let cyrillic  = 0;
  let georgian  = 0;
  let latin     = 0;
  let total     = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Cyrillic: U+0400–U+04FF
    if (cp >= 0x0400 && cp <= 0x04FF) { cyrillic++; total++; }
    // Georgian: U+10A0–U+10FF (Mkhedruli) + U+2D00–U+2D2F (Mtavruli)
    else if ((cp >= 0x10A0 && cp <= 0x10FF) || (cp >= 0x2D00 && cp <= 0x2D2F)) { georgian++; total++; }
    // Basic Latin letters only (not digits/punct)
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) { latin++; total++; }
  }

  if (total === 0) return null;

  const georgianRatio  = georgian  / total;
  const cyrillicRatio  = cyrillic  / total;

  // Threshold: at least 20% of letter chars must be that script
  if (georgianRatio  >= 0.20) return 'ka';
  if (cyrillicRatio  >= 0.20) return 'ru';
  return null; // default — CSS will use inherited lang from <html>
}

// ── Message builder ───────────────────────────────────────────────────────────

function buildChatMsg(role, text, options = {}) {
  const el     = window.hexRenderUtils.createEl('div', { className: `chat-msg ${role}` });
  const header = window.hexRenderUtils.createEl('div', { className: 'chat-msg-header' });
  const bubble = window.hexRenderUtils.createEl('div', { className: 'chat-bubble' });

  const ts = window.i18n?.formatTime
    ? window.i18n.formatTime(new Date(), {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    : new Date().toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  const label = role === 'hex'
    ? (window.i18n?.getAssistantName?.('hex', 'short') || window.i18n.t('hex_label'))
    : (window.i18n?.getLocalizedUserName?.(window._hexConfig?.userName) || window.i18n.t('user_label'));

  header.appendChild(window.hexRenderUtils.createEl('span', { text: label }));
  header.appendChild(window.hexRenderUtils.createEl('span', { text: ts }));
  el.appendChild(header);

  if (role === 'hex') {
    window.hexRenderUtils.renderMarkdown(bubble, text);
  } else {
    bubble.textContent = String(text || '');
  }

  // Detect script and set lang attribute so CSS :lang() and browser hyphenation work
  const lang = detectLang(String(text || ''));
  if (lang) {
    bubble.setAttribute('lang', lang);
    bubble.setAttribute('xml:lang', lang);
  }

  el.appendChild(bubble);

  if (Array.isArray(options.actions) && options.actions.length > 0) {
    const actionRow = window.hexRenderUtils.createEl('div', { className: 'chat-actions' });
    options.actions.forEach((action) => {
      const button = window.hexRenderUtils.createEl('button', {
        className: `action-btn chat-action-btn ${action.className || ''}`.trim(),
        text: action.label,
        dataset: { hexAction: action.kind, path: action.path },
      });
      actionRow.appendChild(button);
    });
    el.appendChild(actionRow);
  }

  if (role === 'hex' && options.feedback !== false) {
    const feedbackId = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    window.hexFeedbackBuffer.set(feedbackId, {
      user: String(options.feedback?.user || window._lastUserMsg || '').slice(0, 4000),
      assistant: String(text || '').slice(0, 8000),
      brainRoute: options.feedback?.brainRoute || null,
      actions: Array.isArray(options.feedback?.actions) ? options.feedback.actions.slice(0, 12) : [],
      actionTypes: Array.isArray(options.feedback?.actions) ? options.feedback.actions.map((action) => action?.type).filter(Boolean).slice(0, 12) : [],
      language: document.documentElement?.lang || window._hexConfig?.language || 'en',
      assistantMode: window.currentMode || window._hexConfig?.mode || 'hex',
      createdAt: new Date().toISOString()
    });
    const feedbackRow = window.hexRenderUtils.createEl('div', { className: 'chat-actions chat-feedback-actions' });
    [
      { kind: 'good', label: 'GOOD' },
      { kind: 'wrong', label: 'WRONG' },
      { kind: 'fix', label: 'FIX' }
    ].forEach((item) => {
      feedbackRow.appendChild(window.hexRenderUtils.createEl('button', {
        className: 'action-btn chat-feedback-btn',
        text: item.label,
        dataset: { hexFeedback: item.kind, feedbackId }
      }));
    });
    el.appendChild(feedbackRow);
  }

  return el;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function insertMsg(el) {
  const log    = document.getElementById('chat-log');
  const typing = document.getElementById('typing-indicator');
  if (!log || !typing || !el) return;
  log.insertBefore(el, typing);
}

function scrollChat() {
  const log = document.getElementById('chat-log');
  if (log) log.scrollTop = log.scrollHeight;
}

function addHexMessage(text, options = {}) {
  const el = buildChatMsg('hex', text, options);
  insertMsg(el);
  scrollChat();
}

function addUserMessage(text) {
  const el = buildChatMsg('user', text);
  insertMsg(el);
  scrollChat();
}

function showTyping() {
  document.getElementById('typing-indicator')?.classList.add('visible');
  scrollChat();
}

function hideTyping() {
  document.getElementById('typing-indicator')?.classList.remove('visible');
}

window.buildChatMsg    = buildChatMsg;
window.insertMsg       = insertMsg;
window.scrollChat      = scrollChat;
window.addHexMessage   = addHexMessage;
window.addUserMessage  = addUserMessage;
window.showTyping      = showTyping;
window.hideTyping      = hideTyping;
window.detectLang      = detectLang; // exposed for testing
