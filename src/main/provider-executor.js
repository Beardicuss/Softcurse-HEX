'use strict';

const OPENAI_COMPATIBLE = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  grok: { url: 'https://api.x.ai/v1/chat/completions', model: 'grok-3-mini' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.1-8b-instruct:free' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  together: { url: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Llama-3-8b-chat-hf' }
};

module.exports = async function executeProvider({ provider, apiKey, model, system, messages, visionData, maxTokens = 800 }) {
  const normalized = String(provider || '').trim().toLowerCase();
  const safeMessages = normalizeMessages(messages);
  const limit = Math.max(1, Math.min(4096, Number(maxTokens) || 800));

  if (OPENAI_COMPATIBLE[normalized]) {
    const config = OPENAI_COMPATIBLE[normalized];
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
    if (normalized === 'openrouter') {
      headers['HTTP-Referer'] = 'https://softcurse-hex.local';
      headers['X-Title'] = 'Softcurse H.E.X.';
    }
    return requestText(config.url, {
      headers,
      body: {
        model: normalizeModel(normalized, model, config.model),
        messages: [{ role: 'system', content: system }, ...safeMessages],
        max_tokens: limit,
        temperature: 0.75
      }
    }, normalized, (data) => data.choices?.[0]?.message?.content);
  }

  if (normalized === 'anthropic') {
    return requestText('https://api.anthropic.com/v1/messages', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: limit,
        system,
        messages: safeMessages
      }
    }, normalized, (data) => data.content?.[0]?.text);
  }

  if (normalized === 'gemini') {
    return executeGemini({ apiKey, model, system, messages: safeMessages, visionData, maxTokens: limit });
  }

  if (normalized === 'cohere') {
    const history = safeMessages.slice(0, -1).map((item) => ({
      role: item.role === 'user' ? 'USER' : 'CHATBOT',
      message: item.content
    }));
    return requestText('https://api.cohere.com/v1/chat', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: {
        model: model || 'command-r',
        preamble: system,
        chat_history: history,
        message: safeMessages.at(-1)?.content || '',
        max_tokens: limit,
        temperature: 0.75
      }
    }, normalized, (data) => data.text);
  }

  if (normalized === 'hf') {
    const selected = model || 'mistralai/Mixtral-8x7B-Instruct-v0.1';
    const prompt = system + '\n\n' + safeMessages.map((item) => item.role + ': ' + item.content).join('\n') + '\n\nAssistant:';
    return requestText('https://api-inference.huggingface.co/models/' + encodeURIComponent(selected).replace(/%2F/g, '/'), {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: { inputs: prompt, parameters: { max_new_tokens: limit, temperature: 0.7 } }
    }, normalized, (data) => data?.[0]?.generated_text || data?.generated_text);
  }

  throw new Error('Unsupported remote provider: ' + normalized);
};

async function executeGemini({ apiKey, model, system, messages, visionData, maxTokens }) {
  let selected = model && model !== 'gemini' ? String(model).trim().split(/\s+/)[0] : 'gemini-2.5-flash';
  if (selected.includes('gemini-1.5')) selected = 'gemini-2.5-flash';
  const contents = messages.map((item, index) => {
    const parts = [{ text: item.content }];
    if (index === messages.length - 1 && visionData) {
      const match = String(visionData).match(/^data:(image\/\w+);base64,(.*)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    return { role: item.role === 'assistant' ? 'model' : 'user', parts };
  });
  contents.unshift(
    { role: 'user', parts: [{ text: '[SYSTEM]\n' + system + '\n[/SYSTEM]\n\nAcknowledge briefly.' }] },
    { role: 'model', parts: [{ text: 'Understood. HEX online.' }] }
  );
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(selected) + ':generateContent?key=' + encodeURIComponent(apiKey);
  return requestText(url, {
    headers: { 'Content-Type': 'application/json' },
    body: { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.75 } }
  }, 'gemini', (data) => data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function requestText(url, options, provider, extract) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal
    });
    const data = await safeJson(response);
    if (!response.ok) {
      const reason = data?.error?.message || data?.message || data?.detail || data?.error || response.statusText;
      throw new Error(provider.toUpperCase() + ' ' + response.status + ': ' + String(reason));
    }
    return extract(data) || '...';
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 100000) }))
    .slice(-40);
}

function normalizeModel(provider, model, fallback) {
  const value = String(model || '').trim();
  if (provider === 'openrouter' && !value.includes('/')) return fallback;
  return value || fallback;
}

async function safeJson(response) {
  try { return await response.json(); } catch (_) { return {}; }
}
