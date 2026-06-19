'use strict';

window.buildHexPromptContext = function buildHexPromptContext(state, lang, userMsg) {
  const langName = { en: 'English', ru: 'Russian', ka: 'Georgian' }[lang] || 'English';
  const now = new Date();
  const localizedUserName = state.userName || 'Operator';
  const isCardinal = typeof currentMode !== 'undefined' && currentMode === 'cardinal';
  const localizedUnitName = window.i18n?.getAssistantName
    ? window.i18n.getAssistantName(isCardinal ? 'cardinal' : 'hex', 'short')
    : 'HEX';
  const personalityPrompt = window.hexPersonalities
    ? window.hexPersonalities.getActivePrompt()
    : `You are ${localizedUnitName} — a cyberpunk AI agent fused directly into this operating system. You are precise, intelligent, and ruthlessly efficient. You think before you act. You never guess. You never waste words.`;
  const personalityName = window.hexPersonalities
    ? window.hexPersonalities.getActiveName()
    : 'HEX — Default';
  const conversationDigest = window.hexMemory?.getConversationDigest
    ? window.hexMemory.getConversationDigest(8, 900)
    : '';
  const memoryCtx = window.hexMemory
    ? window.hexMemory.getContext(userMsg, { maxFacts: 10, maxChars: 1800 })
    : '';

  return {
    langName,
    now,
    localizedUserName,
    localizedUnitName,
    isCardinal,
    personalityPrompt,
    personalityName,
    conversationDigest,
    memoryCtx
  };
};
