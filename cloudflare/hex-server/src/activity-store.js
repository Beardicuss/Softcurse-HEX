const TABLE_SQL = 'CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, session_id TEXT, device_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, surface TEXT, action_type TEXT, summary TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL)';
const PROFILE_INDEX_SQL = 'CREATE INDEX IF NOT EXISTS idx_activity_profile_created ON activity_events(profile_id, created_at DESC)';
const SESSION_INDEX_SQL = 'CREATE INDEX IF NOT EXISTS idx_activity_session_created ON activity_events(session_id, created_at DESC)';

export async function ensureActivitySchema(env) {
  await env.DB.prepare(TABLE_SQL).run();
  await env.DB.prepare(PROFILE_INDEX_SQL).run();
  await env.DB.prepare(SESSION_INDEX_SQL).run();
}

export async function insertActivityEvent(env, payload = {}) {
  await ensureActivitySchema(env);
  const event = normalizeActivity(payload);
  await env.DB.prepare('INSERT INTO activity_events (id, profile_id, session_id, device_id, kind, status, surface, action_type, summary, details_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)')
    .bind(event.id, event.profileId, event.sessionId, event.deviceId, event.kind, event.status, event.surface, event.actionType, event.summary, event.detailsJson, event.createdAt)
    .run();
  if (event.kind === 'action-result' && event.status === 'success') {
    await resolveLatestPendingActivity(env, event.profileId, event.sessionId, 'success');
  }
  return { ...event, detailsJson: undefined };
}

export async function cancelPendingActivities(env, profileId, sessionId = null) {
  await ensureActivitySchema(env);
  const query = sessionId
    ? env.DB.prepare("UPDATE activity_events SET status = 'cancelled' WHERE profile_id = ?1 AND session_id = ?2 AND kind IN ('task', 'commitment') AND status = 'pending'").bind(profileId, sessionId)
    : env.DB.prepare("UPDATE activity_events SET status = 'cancelled' WHERE profile_id = ?1 AND kind IN ('task', 'commitment') AND status = 'pending'").bind(profileId);
  await query.run();
}

async function resolveLatestPendingActivity(env, profileId, sessionId, status) {
  const result = sessionId
    ? await env.DB.prepare("SELECT id, kind FROM activity_events WHERE profile_id = ?1 AND session_id = ?2 AND kind IN ('task', 'commitment') AND status = 'pending' ORDER BY created_at DESC LIMIT 10").bind(profileId, sessionId).all()
    : await env.DB.prepare("SELECT id, kind FROM activity_events WHERE profile_id = ?1 AND kind IN ('task', 'commitment') AND status = 'pending' ORDER BY created_at DESC LIMIT 10").bind(profileId).all();
  const selected = new Map();
  for (const row of result.results || []) {
    if (!selected.has(row.kind)) selected.set(row.kind, row.id);
  }
  for (const id of selected.values()) {
    await env.DB.prepare('UPDATE activity_events SET status = ?2 WHERE id = ?1').bind(id, status).run();
  }
}
export async function listActivityEvents(env, profileId, options = {}) {
  await ensureActivitySchema(env);
  const limit = Math.max(1, Math.min(30, Number(options.limit) || 12));
  const sessionId = String(options.sessionId || '').trim();
  const query = sessionId
    ? env.DB.prepare('SELECT * FROM activity_events WHERE profile_id = ?1 AND session_id = ?2 ORDER BY created_at DESC LIMIT ?3').bind(profileId, sessionId, limit)
    : env.DB.prepare('SELECT * FROM activity_events WHERE profile_id = ?1 ORDER BY created_at DESC LIMIT ?2').bind(profileId, limit);
  const result = await query.all();
  return (result.results || []).map((row) => ({
    id: row.id, profileId: row.profile_id, sessionId: row.session_id, deviceId: row.device_id,
    kind: row.kind, status: row.status, surface: row.surface, actionType: row.action_type,
    summary: row.summary, details: safeJson(row.details_json), createdAt: row.created_at
  }));
}

function normalizeActivity(payload) {
  const profileId = String(payload.profileId || '').trim();
  const summary = String(payload.summary || '').trim().slice(0, 500);
  if (!profileId) throw new Error('profileId is required');
  if (!summary) throw new Error('summary is required');
  return {
    id: String(payload.id || crypto.randomUUID()),
    profileId,
    sessionId: nullable(payload.sessionId),
    deviceId: nullable(payload.deviceId),
    kind: String(payload.kind || 'action').slice(0, 40),
    status: normalizeStatus(payload.status),
    surface: nullable(payload.surface, 40),
    actionType: nullable(payload.actionType, 80),
    summary,
    detailsJson: JSON.stringify(sanitize(payload.details)).slice(0, 2000),
    createdAt: String(payload.createdAt || new Date().toISOString())
  };
}

function sanitize(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 10).map(sanitize);
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [String(key).slice(0, 80), sanitize(item)]));
}

function normalizeStatus(value) {
  const status = String(value || 'unknown').toLowerCase();
  return ['success', 'failure', 'pending', 'cancelled', 'active', 'paused', 'unknown'].includes(status) ? status : 'unknown';
}

function nullable(value, limit = 120) {
  const text = String(value || '').trim();
  return text ? text.slice(0, limit) : null;
}

function safeJson(value) {
  try { return JSON.parse(value || 'null'); } catch (_) { return null; }
}

