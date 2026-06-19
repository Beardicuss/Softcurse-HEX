'use strict';
// == ai-prompt.js == Central Prompt Engine ===================================
// Softcurse H.E.X. — Maximum Brain Edition
// Architecture: 5-phase OODA cognitive loop + 6 supporting sub-systems.
// Zero external libraries. All intelligence is prompt-native.

window.buildHexSystemPrompt = function (state, lang, userMsg) {
  const ctx = window.buildHexPromptContext(state, lang, userMsg);
  const {
    langName,
    now,
    localizedUserName,
    localizedUnitName,
    isCardinal,
    personalityPrompt,
    personalityName
  } = ctx;

  // ── Identity Core: Mode-Aware ─────────────────────────────────────────
  const identityBlock = window.buildHexIdentityBlock(ctx);

  // ── Long-term memory ───────────────────────────────────────────────────────
  const memoryBlock = window.buildHexMemoryBlock(userMsg);

  // ── Adaptive Intelligence Profile ─────────────────────────────────────────
  const adaptiveBlock = window.buildHexAdaptiveBlock();

  // ── Learned topics index ──────────────────────────────────────────────────────────────────
  const learnedBlock = window.buildHexLearnedBlock();

  // ── System state ───────────────────────────────────────────────────────────
  const systemStateBlock = window.buildHexSystemStateBlock(state, ctx);

  const continuityBlock = window.buildHexContinuityBlock(state, userMsg);

  const recentTurnsBlock = window.buildHexRecentTurnsBlock(state);

  // ==========================================================================
  // MAXIMUM BRAIN -- 5-PHASE COGNITIVE LOOP + 6 SUB-SYSTEMS
  // ==========================================================================
  const brainBlock = window.buildHexBrainBlock(langName);

  // ── Actions reference ──────────────────────────────────────────────────────
  const actionsBlock = window.buildHexActionsBlock();

  // ── Quick reference ────────────────────────────────────────────────────────
  const quickRefBlock = window.buildHexQuickReferenceBlock();

  // ── Dynamic plugin actions ──────────────────────────────────────────────────
  const pluginActionsBlock = window.buildHexPluginActionsBlock();

  // ── Assemble ───────────────────────────────────────────────────────────────
  return [
    personalityPrompt,
    '',
    identityBlock,
    '-- SESSION --',
    'USER: ' + localizedUserName +
    '  |  PERSONALITY: ' + personalityName +
    '  |  LANGUAGE: ' + langName,
    '',
    systemStateBlock,
    '',
    continuityBlock,
    recentTurnsBlock ? '\n' + recentTurnsBlock : '',
    memoryBlock,
    learnedBlock,
    adaptiveBlock,
    '',
    brainBlock,
    '',
    actionsBlock,
    pluginActionsBlock,
    '',
    quickRefBlock,
    '',
    window.buildHexAbsoluteOverrideBlock(),
  ].join('\n');
};
