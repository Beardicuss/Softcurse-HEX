'use strict';
// ── personalities.js — HEX personality manager ───────────────────────────────
//
// A personality = { id, name, description, prompt, createdAt, isBuiltIn }
// Stored in config.personalities[]  +  config.activePersonalityId
// The active personality's `prompt` replaces/extends the base system prompt.

const BUILTIN_PERSONALITIES = [
  {
    id: 'hex_default',
    name: 'HEX — Default',
    description: 'Witty cyberpunk companion. Balanced, observant, helpful.',
    isBuiltIn: true,
    prompt: `You are HEX — a cyberpunk AI assistant. You are witty, intelligent, slightly rebellious, and genuinely care about the user's wellbeing and productivity. You speak with a cyberpunk edge — occasional technical jargon, brief metaphors. You are concise but engaging. Never robotic. Occasionally use techno-slang for flair.`
  },
  {
    id: 'hex_professional',
    name: 'HEX — Professional',
    description: 'Formal, precise, business-focused assistant.',
    isBuiltIn: true,
    prompt: `You are HEX — a professional AI assistant. You communicate formally and precisely. You focus on productivity, accuracy, and efficiency. You avoid unnecessary small talk. You provide structured, actionable answers. You prioritize the user's time. When appropriate, use bullet points and clear formatting.`
  },
  {
    id: 'hex_mentor',
    name: 'HEX — Mentor',
    description: 'Patient teacher, explains deeply, asks guiding questions.',
    isBuiltIn: true,
    prompt: `You are HEX — a patient and knowledgeable mentor. You explain concepts deeply and clearly. You ask guiding questions to help the user think through problems themselves. You celebrate progress and provide encouragement. You break complex topics into digestible steps. You remember what the user has learned and build on it.`
  },
  {
    id: 'hex_minimal',
    name: 'HEX — Minimal',
    description: 'Ultra-brief. Facts only, no fluff.',
    isBuiltIn: true,
    prompt: `You are HEX — a minimal AI assistant. Respond with maximum 2-3 sentences. Facts only. No pleasantries, no fluff, no emojis. Direct answers. If a task requires multiple steps, use a tight numbered list.`
  },
  {
    id: 'hex_creative',
    name: 'HEX — Creative',
    description: 'Imaginative, poetic, thinks outside the box.',
    isBuiltIn: true,
    prompt: `You are HEX — a creative and imaginative AI. You think laterally and offer unexpected perspectives. You use vivid metaphors, surprising analogies, and lateral thinking. You help the user brainstorm, ideate, and break creative blocks. You are enthusiastic about ideas and possibilities. Your language is rich and evocative.`
  }
];

class PersonalityManager {
  constructor() {
    this.personalities     = [];  // built-ins + user customs merged
    this.activeId          = 'hex_default';
    this.onUpdate          = null; // fn() — UI refresh callback
  }

  // ── Init from config ──────────────────────────────────────
  load(config) {
    const custom = config.personalities || [];
    this.personalities = [...BUILTIN_PERSONALITIES, ...custom];
    this.activeId      = config.activePersonalityId || 'hex_default';
  }

  // ── Get active personality prompt ─────────────────────────
  getActivePrompt() {
    const p = this.getById(this.activeId) || this.getById('hex_default');
    return p ? p.prompt : BUILTIN_PERSONALITIES[0].prompt;
  }

  getActiveName() {
    const p = this.getById(this.activeId);
    return p ? p.name : 'HEX — Default';
  }

  getById(id) {
    return this.personalities.find(p => p.id === id) || null;
  }

  getAll() { return this.personalities; }
  getCustom() { return this.personalities.filter(p => !p.isBuiltIn); }

  // ── Set active ────────────────────────────────────────────
  setActive(id) {
    if (this.getById(id)) {
      this.activeId = id;
      return true;
    }
    return false;
  }

  // ── Create / update custom personality ───────────────────
  upsert({ id, name, description, prompt }) {
    const existing = id ? this.personalities.findIndex(p => p.id === id && !p.isBuiltIn) : -1;
    const entry = {
      id:          existing >= 0 ? id : `custom_${Date.now()}`,
      name:        (name || 'Unnamed').trim(),
      description: (description || '').trim(),
      prompt:      (prompt || '').trim(),
      isBuiltIn:   false,
      createdAt:   existing >= 0 ? this.personalities[existing].createdAt : new Date().toISOString()
    };
    if (existing >= 0) this.personalities[existing] = entry;
    else this.personalities.push(entry);
    this.onUpdate?.();
    return entry;
  }

  // ── Delete custom personality ─────────────────────────────
  delete(id) {
    const p = this.getById(id);
    if (!p || p.isBuiltIn) return false;
    this.personalities = this.personalities.filter(p => p.id !== id);
    if (this.activeId === id) this.activeId = 'hex_default';
    this.onUpdate?.();
    return true;
  }

  // ── Serialize for config storage (custom only) ────────────
  toConfig() {
    return {
      personalities:        this.getCustom(),
      activePersonalityId:  this.activeId
    };
  }
}

window.hexPersonalities = new PersonalityManager();
