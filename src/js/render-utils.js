'use strict';

(() => {
  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function appendText(parent, value) {
    if (!value) return;
    parent.appendChild(document.createTextNode(value));
  }

  function createEl(tagName, options = {}) {
    const el = document.createElement(tagName);
    if (options.className) el.className = options.className;
    if (options.text != null) el.textContent = String(options.text);
    if (options.title) el.title = options.title;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        if (value != null) el.setAttribute(key, String(value));
      });
    }
    if (options.dataset) {
      Object.entries(options.dataset).forEach(([key, value]) => {
        if (value != null) el.dataset[key] = String(value);
      });
    }
    return el;
  }

  function isSafeHref(href) {
    try {
      const url = new URL(href, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function normalizeMessage(text) {
    return String(text || '').replace(/\[ACTION:[^\]]+\]/g, '');
  }

  function appendInlineTokens(parent, text) {
    const source = normalizeMessage(text);
    const tokenPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(source))) {
      appendText(parent, source.slice(cursor, match.index));

      if (match[1] && match[2]) {
        if (isSafeHref(match[2])) {
          const link = createEl('a', {
            text: match[1],
            attrs: {
              href: match[2],
              target: '_blank',
              rel: 'noopener noreferrer'
            }
          });
          parent.appendChild(link);
        } else {
          appendText(parent, match[1]);
        }
      } else if (match[3]) {
        parent.appendChild(createEl('code', { text: match[3] }));
      } else if (match[4]) {
        const strong = createEl('strong');
        appendInlineTokens(strong, match[4]);
        parent.appendChild(strong);
      } else if (match[5]) {
        const em = createEl('em');
        appendInlineTokens(em, match[5]);
        parent.appendChild(em);
      }

      cursor = match.index + match[0].length;
    }

    appendText(parent, source.slice(cursor));
  }

  function renderMarkdown(target, text) {
    if (!target) return;
    clearNode(target);

    const lines = normalizeMessage(text).replace(/\r/g, '').split('\n');
    let index = 0;

    const appendSpacer = () => {
      const spacer = createEl('div', { className: 'chat-spacer' });
      spacer.setAttribute('aria-hidden', 'true');
      target.appendChild(spacer);
    };

    while (index < lines.length) {
      const rawLine = lines[index];
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        if (target.lastChild && !target.lastChild.classList?.contains('chat-spacer')) appendSpacer();
        index += 1;
        continue;
      }

      if (line.startsWith('> ')) {
        const quote = createEl('blockquote');
        appendInlineTokens(quote, line.slice(2));
        target.appendChild(quote);
        index += 1;
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-•]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (unorderedMatch || orderedMatch) {
        const list = createEl(orderedMatch ? 'ol' : 'ul');
        while (index < lines.length) {
          const candidate = lines[index].trimEnd();
          const listMatch = orderedMatch
            ? candidate.match(/^\s*\d+\.\s+(.+)$/)
            : candidate.match(/^\s*[-•]\s+(.+)$/);
          if (!listMatch) break;
          const item = createEl('li');
          appendInlineTokens(item, listMatch[1]);
          list.appendChild(item);
          index += 1;
        }
        target.appendChild(list);
        continue;
      }

      const paragraph = createEl('div', { className: 'chat-line' });
      appendInlineTokens(paragraph, line);
      target.appendChild(paragraph);
      index += 1;
    }
  }

  function setPlainText(target, text, className = '') {
    if (!target) return;
    clearNode(target);
    const block = createEl('div', { className, text });
    target.appendChild(block);
  }

  window.hexRenderUtils = {
    escapeHtml,
    clearNode,
    appendText,
    createEl,
    isSafeHref,
    renderMarkdown,
    setPlainText,
  };

  window.escapeHtml = escapeHtml;
  window.renderMarkdown = function legacyRenderMarkdown(target, text) {
    renderMarkdown(target, text == null ? target?.textContent || '' : text);
  };
})();
