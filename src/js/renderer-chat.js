'use strict';

function buildChatMsg(role, text, options = {}) {
  const el = window.hexRenderUtils.createEl('div', { className: `chat-msg ${role}` });
  const header = window.hexRenderUtils.createEl('div', { className: 'chat-msg-header' });
  const bubble = window.hexRenderUtils.createEl('div', { className: 'chat-bubble' });
  const ts = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const label = role === 'hex' ? window.i18n.t('hex_label') : window.i18n.t('user_label');

  header.appendChild(window.hexRenderUtils.createEl('span', { text: label }));
  header.appendChild(window.hexRenderUtils.createEl('span', { text: ts }));
  el.appendChild(header);

  if (role === 'hex') {
    window.hexRenderUtils.renderMarkdown(bubble, text);
  } else {
    bubble.textContent = String(text || '');
  }
  el.appendChild(bubble);

  if (Array.isArray(options.actions) && options.actions.length > 0) {
    const actionRow = window.hexRenderUtils.createEl('div', { className: 'chat-actions' });
    options.actions.forEach((action) => {
      const button = window.hexRenderUtils.createEl('button', {
        className: `action-btn chat-action-btn ${action.className || ''}`.trim(),
        text: action.label,
        dataset: {
          hexAction: action.kind,
          path: action.path,
        }
      });
      actionRow.appendChild(button);
    });
    el.appendChild(actionRow);
  }

  return el;
}

function insertMsg(el) {
  const log = document.getElementById('chat-log');
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
  const indicator = document.getElementById('typing-indicator');
  indicator?.classList.add('visible');
  scrollChat();
}

function hideTyping() {
  document.getElementById('typing-indicator')?.classList.remove('visible');
}

window.buildChatMsg = buildChatMsg;
window.insertMsg = insertMsg;
window.scrollChat = scrollChat;
window.addHexMessage = addHexMessage;
window.addUserMessage = addUserMessage;
window.showTyping = showTyping;
window.hideTyping = hideTyping;
