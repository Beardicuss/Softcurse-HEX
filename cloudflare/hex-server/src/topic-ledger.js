import { insertActivityEvent, listActivityEvents } from './activity-store.js';

const PAUSE_RE = /(pause|hold that thought|come back to this later|later|stop here|пауза|отложим|позже|შევაჩეროთ|მოგვიანებით)/i;
const RESUME_RE = /(resume|continue this|continue our|go back to|return to|pick this up|продолжим|вернемся к|вернуться к|გავაგრძელოთ|დავუბრუნდეთ)/i;
const SWITCH_RE = /(new topic|different topic|change topic|let'?s talk about|now about|speaking of|новая тема|другая тема|давай поговорим о|теперь о|ახალი თემა|სხვა თემა|მოდი ვისაუბროთ|ახლა ვისაუბროთ)/i;
const GREETING_RE = /^(hi|hello|hey|thanks|thank you|привет|здравствуй|спасибо|გამარჯობა|გმადლობ)[\s!,.?]*$/i;

export function buildTopicLedger(events = [], limit = 6) {
  const latest = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== 'topic-state') continue;
    const label = cleanLabel(event.summary);
    const key = label.toLocaleLowerCase();
    if (!label || latest.has(key)) continue;
    latest.set(key, {
      label,
      status: event.status === 'paused' ? 'paused' : 'active',
      at: event.createdAt || null
    });
  }
  const recent = [...latest.values()].slice(0, Math.max(1, limit));
  return {
    active: recent.find((item) => item.status === 'active') || null,
    paused: recent.filter((item) => item.status === 'paused'),
    recent
  };
}

export function classifyTopicTransition(content, metadata = {}, ledger = {}) {
  const text = String(content || '').trim();
  if (!text || GREETING_RE.test(text)) return null;
  if (PAUSE_RE.test(text)) return ledger.active ? { type: 'pause', label: ledger.active.label } : null;
  if (RESUME_RE.test(text)) {
    const target = ledger.paused?.[0] || ledger.active;
    return target ? { type: 'resume', label: target.label } : null;
  }
  const explicitSwitch = SWITCH_RE.test(text);
  if (metadata?.followUp === true && !explicitSwitch) return null;
  if (!explicitSwitch && ledger.active) return null;
  const label = cleanLabel(text.replace(SWITCH_RE, ''));
  return label && label.length >= 3 ? { type: 'switch', label } : null;
}

export async function persistTopicTransition(env, message) {
  if (String(message?.role || '').toLowerCase() !== 'user') return null;
  const events = await listActivityEvents(env, message.profile_id, {
    sessionId: message.session_id,
    limit: 30
  });
  const ledger = buildTopicLedger(events);
  const transition = classifyTopicTransition(message.content, safeJson(message.metadata_json), ledger);
  if (!transition) return null;

  const base = {
    profileId: message.profile_id,
    sessionId: message.session_id,
    surface: message.surface || 'chat',
    kind: 'topic-state',
    actionType: transition.type,
    details: { sourceMessageId: message.id, transition: transition.type },
    createdAt: message.created_at
  };
  if (transition.type === 'switch' && ledger.active && normalize(ledger.active.label) !== normalize(transition.label)) {
    await insertActivityEvent(env, { ...base, status: 'paused', summary: ledger.active.label });
  }
  return insertActivityEvent(env, {
    ...base,
    status: transition.type === 'pause' ? 'paused' : 'active',
    summary: transition.label
  });
}

function cleanLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/^[:,\s-]+|[:,\s-]+$/g, '').slice(0, 240);
}

function normalize(value) {
  return cleanLabel(value).toLocaleLowerCase();
}

function safeJson(value) {
  try { return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch (_) { return {}; }
}
