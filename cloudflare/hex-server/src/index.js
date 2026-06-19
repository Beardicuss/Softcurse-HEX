import { isHunterApiConfigured, fetchHunterAuditLogs, fetchHunterKeySummary, fetchHunterProviderStats, fetchHunterValidKeys } from './hunter-api';
export class ProfileSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const stored = await this.state.storage.get('session');
      return json({ success: true, session: stored || null });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      const current = (await this.state.storage.get('session')) || {};
      const next = {
        ...current,
        ...payload,
        updatedAt: nowIso()
      };
      await this.state.storage.put('session', next);
      return json({ success: true, session: next });
    }

    if (request.method === 'DELETE') {
      await this.state.storage.delete('session');
      return json({ success: true });
    }

    return json({ success: false, error: `Unsupported method for ${url.pathname}` }, 405);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (!isAuthorizedRequest(request, env, url.pathname)) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  if (url.pathname === '/api/health') {
    return json({
      success: true,
      service: 'hex-server',
      version: env.HEX_SERVER_VERSION || 'dev',
      now: nowIso()
    });
  }

  if (url.pathname === '/api/hunter/status' && request.method === 'GET') {
    return json({
      success: true,
      configured: isHunterApiConfigured(env),
      source: 'remote-hunter-api'
    });
  }

  if (url.pathname === '/api/hunter/provider-stats' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const stats = await fetchHunterProviderStats(env);
      return json({ success: true, stats });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to read hunter provider stats' }, 502);
    }
  }

  if (url.pathname === '/api/hunter/audit' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10) || 20;
      const logs = await fetchHunterAuditLogs(env, limit);
      return json({ success: true, logs });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to read hunter audit logs' }, 502);
    }
  }

  if (url.pathname === '/api/hunter/key-summary' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const summary = await fetchHunterKeySummary(env);
      return json({ success: true, summary });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to read hunter key summary' }, 502);
    }
  }

  if (url.pathname === '/api/hunter/valid-keys' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const keys = await fetchHunterValidKeys(env);
      return json({ success: true, keys });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to read hunter valid keys' }, 502);
    }
  }

  if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
    const metrics = await getMetrics(env);
    return json({
      success: true,
      app: {
        name: 'HEX Server',
        version: env.HEX_SERVER_VERSION || 'dev'
      },
      features: {
        profiles: true,
        sessions: true,
        memory: true,
        aiGateway: true,
        queues: true
      },
      metrics,
      nextSteps: [
        'Create D1, KV, Queue, and R2 resources and replace placeholder IDs in wrangler.jsonc',
        'Connect Electron HEX client to /api/profiles and /api/sessions',
        'Move memory assembly and session continuity to this backend'
      ]
    });
  }

  if (url.pathname === '/api/profiles' && request.method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
      FROM profiles
      ORDER BY updated_at DESC
      LIMIT 50
    `).all();
    return json({ success: true, profiles: result.results || [] });
  }

  if (url.pathname === '/api/profiles' && request.method === 'POST') {
    const body = await readJson(request);
    const created = await createProfile(env, body);
    return json({ success: true, profile: created.profile, created: true });
  }

  if (url.pathname === '/api/profiles/resolve' && request.method === 'POST') {
    const body = await readJson(request);
    const displayName = String(body.displayName || '').trim();
    if (!displayName) {
      return json({ success: false, error: 'displayName is required' }, 400);
    }

    const normalizedName = normalizeName(displayName);
    const existing = await env.DB.prepare(`
      SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
      FROM profiles
      WHERE normalized_name = ?1
      LIMIT 1
    `).bind(normalizedName).first();

    if (existing) {
      await persistRegistrationFacts(env, existing.id, body.registration || null);
      await persistDevice(env, existing.id, body.device || null);
      await env.DB.prepare(`
        UPDATE profiles
        SET updated_at = ?2,
            language = COALESCE(?3, language),
            assistant_mode = COALESCE(?4, assistant_mode)
        WHERE id = ?1
      `).bind(
        existing.id,
        nowIso(),
        body.language ? String(body.language) : null,
        body.assistantMode ? String(body.assistantMode) : null
      ).run();
      const refreshed = await env.DB.prepare(`
        SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
        FROM profiles
        WHERE id = ?1
        LIMIT 1
      `).bind(existing.id).first();
      return json({ success: true, profile: refreshed, created: false });
    }

    const created = await createProfile(env, body);
    return json({ success: true, profile: created.profile, created: true });
  }

  if (url.pathname.startsWith('/api/profiles/') && url.pathname.endsWith('/continuity') && request.method === 'GET') {
    const profileId = getProfileIdFromPath(url.pathname);
    const continuity = await buildContinuityPacket(env, profileId);
    if (!continuity) return json({ success: false, error: 'Profile not found' }, 404);
    return json({ success: true, continuity });
  }

  if (url.pathname.startsWith('/api/profiles/') && request.method === 'GET') {
    const profileId = getProfileIdFromPath(url.pathname);
    const profile = await env.DB.prepare(`
      SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
      FROM profiles
      WHERE id = ?1
      LIMIT 1
    `).bind(profileId).first();
    if (!profile) return json({ success: false, error: 'Profile not found' }, 404);

    const memories = await env.DB.prepare(`
      SELECT id, kind, content, confidence, status, updated_at
      FROM memories
      WHERE profile_id = ?1
      ORDER BY updated_at DESC
      LIMIT 12
    `).bind(profileId).all();

    const sessions = await env.DB.prepare(`
      SELECT id, title, status, current_goal, current_surface, browser_url, browser_title, updated_at
      FROM sessions
      WHERE profile_id = ?1
      ORDER BY updated_at DESC
      LIMIT 12
    `).bind(profileId).all();

    return json({
      success: true,
      profile,
      memories: memories.results || [],
      sessions: sessions.results || []
    });
  }
  if (url.pathname === '/api/sessions' && request.method === 'POST') {
    const body = await readJson(request);
    const profileId = String(body.profileId || '').trim();
    if (!profileId) return json({ success: false, error: 'profileId is required' }, 400);

    await persistDevice(env, profileId, {
      deviceId: body.deviceId ? String(body.deviceId) : null,
      hostname: body.deviceHostname ? String(body.deviceHostname) : null,
      platform: body.devicePlatform ? String(body.devicePlatform) : null,
      os: body.deviceOs ? String(body.deviceOs) : null,
      localIps: Array.isArray(body.localIps) ? body.localIps : []
    });

    const session = {
      id: 'sess_' + crypto.randomUUID(),
      profile_id: profileId,
      device_id: body.deviceId ? String(body.deviceId) : null,
      title: body.title ? String(body.title) : 'Active Session',
      status: 'active',
      current_goal: body.currentGoal ? String(body.currentGoal) : null,
      current_surface: body.currentSurface ? String(body.currentSurface) : 'chat',
      browser_url: body.browserUrl ? String(body.browserUrl) : null,
      browser_title: body.browserTitle ? String(body.browserTitle) : null,
      last_user_message: body.lastUserMessage ? String(body.lastUserMessage) : null,
      last_assistant_message: body.lastAssistantMessage ? String(body.lastAssistantMessage) : null,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    await env.DB.prepare(`
      INSERT INTO sessions (
        id, profile_id, device_id, title, status, current_goal, current_surface,
        browser_url, browser_title, last_user_message, last_assistant_message,
        created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `)
      .bind(
        session.id,
        session.profile_id,
        session.device_id,
        session.title,
        session.status,
        session.current_goal,
        session.current_surface,
        session.browser_url,
        session.browser_title,
        session.last_user_message,
        session.last_assistant_message,
        session.created_at,
        session.updated_at
      )
      .run();

    return json({ success: true, session });
  }

  if (url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/messages') && request.method === 'POST') {
    const body = await readJson(request);
    const parts = url.pathname.split('/');
    const sessionId = parts[3];
    const profileId = String(body.profileId || '').trim();
    if (!sessionId || !profileId) return json({ success: false, error: 'sessionId and profileId are required' }, 400);

    const message = {
      id: 'msg_' + crypto.randomUUID(),
      session_id: sessionId,
      profile_id: profileId,
      role: String(body.role || 'user'),
      surface: body.surface ? String(body.surface) : 'chat',
      content: String(body.content || '').trim(),
      summary: body.summary ? String(body.summary) : null,
      metadata_json: body.metadata ? JSON.stringify(body.metadata) : null,
      created_at: nowIso()
    };

    if (!message.content) return json({ success: false, error: 'content is required' }, 400);

    await env.DB.prepare(`
      INSERT INTO messages (id, session_id, profile_id, role, surface, content, summary, metadata_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `)
      .bind(
        message.id,
        message.session_id,
        message.profile_id,
        message.role,
        message.surface,
        message.content,
        message.summary,
        message.metadata_json,
        message.created_at
      )
      .run();

    await env.DB.prepare(`
      UPDATE sessions
      SET
        last_user_message = CASE WHEN ?2 = 'user' THEN ?1 ELSE last_user_message END,
        last_assistant_message = CASE WHEN ?2 = 'assistant' THEN ?1 ELSE last_assistant_message END,
        updated_at = ?3
      WHERE id = ?4
      `)
      .bind(message.content, message.role, nowIso(), sessionId)
      .run();

    const sessionSnapshot = await env.DB.prepare(`
      SELECT profile_id, current_goal, current_surface, browser_url, browser_title, last_user_message, last_assistant_message, updated_at
      FROM sessions
      WHERE id = ?1
      LIMIT 1
    `).bind(sessionId).first();

    await updateLiveSessionFromMessage(env, profileId, sessionId, sessionSnapshot, message);
    await upsertDerivedMemories(env, profileId, sessionId, message);

    if (env.MEMORY_QUEUE) {
      await env.MEMORY_QUEUE.send({
        type: 'message-index',
        profileId,
        sessionId,
        messageId: message.id
      });
    }

    return json({ success: true, message });
  }

  if (url.pathname.startsWith('/api/live-session/') && request.method === 'POST') {
    const profileId = url.pathname.split('/').at(-1);
    const id = env.PROFILE_SESSIONS.idFromName(profileId);
    const stub = env.PROFILE_SESSIONS.get(id);
    return stub.fetch(request);
  }

  if (url.pathname.startsWith('/api/live-session/') && request.method === 'GET') {
    const profileId = url.pathname.split('/').at(-1);
    const id = env.PROFILE_SESSIONS.idFromName(profileId);
    const stub = env.PROFILE_SESSIONS.get(id);
    return stub.fetch(request);
  }

  return json({ success: false, error: `Route not found: ${url.pathname}` }, 404);
}

async function createProfile(env, body) {
  const displayName = String(body.displayName || '').trim();
  if (!displayName) {
    throw new Error('displayName is required');
  }

  const profile = {
    id: 'prof_' + crypto.randomUUID(),
    display_name: displayName,
    normalized_name: normalizeName(displayName),
    language: String(body.language || 'ka'),
    assistant_mode: String(body.assistantMode || 'hex'),
    persona_id: body.personaId ? String(body.personaId) : null,
    created_at: nowIso(),
    updated_at: nowIso()
  };

  await env.DB.prepare(`
    INSERT INTO profiles (id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `)
    .bind(
      profile.id,
      profile.display_name,
      profile.normalized_name,
      profile.language,
      profile.assistant_mode,
      profile.persona_id,
      profile.created_at,
      profile.updated_at
    )
    .run();

  await persistRegistrationFacts(env, profile.id, body.registration || null);
  await persistDevice(env, profile.id, body.device || null);

  return { profile };
}

async function getMetrics(env) {
  const [profiles, sessions, messages, memories] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM messages').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM memories').first()
  ]);

  return {
    profiles: profiles?.count || 0,
    sessions: sessions?.count || 0,
    messages: messages?.count || 0,
    memories: memories?.count || 0
  };
}

function getProfileIdFromPath(pathname) {
  return pathname.split('/')[3];
}

async function buildContinuityPacket(env, profileId) {
  const profile = await env.DB.prepare(`
    SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
    FROM profiles
    WHERE id = ?1
    LIMIT 1
  `).bind(profileId).first();
  if (!profile) return null;

  const recentSession = await env.DB.prepare(`
    SELECT id, title, status, current_goal, current_surface, browser_url, browser_title, last_user_message, last_assistant_message, updated_at
    FROM sessions
    WHERE profile_id = ?1
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(profileId).first();

  const recentTurns = recentSession
    ? await env.DB.prepare(`
      SELECT role, surface, content, summary, created_at
      FROM messages
      WHERE session_id = ?1
      ORDER BY created_at DESC
      LIMIT 8
    `).bind(recentSession.id).all()
    : { results: [] };

  const memories = await env.DB.prepare(`
    SELECT id, kind, content, confidence, status, updated_at
    FROM memories
    WHERE profile_id = ?1
      AND status = 'active'
    ORDER BY updated_at DESC, confidence DESC
    LIMIT 12
  `).bind(profileId).all();

  const liveSessionState = await fetchLiveSessionState(env, profileId);
  const fallbackTurns = (recentTurns.results || []).slice().reverse();

  return {
    profile,
    session: {
      sessionId: liveSessionState?.sessionId || recentSession?.id || null,
      primaryGoal: liveSessionState?.primaryGoal || recentSession?.current_goal || null,
      activeSurface: liveSessionState?.activeSurface || recentSession?.current_surface || 'chat',
      lastUserMessage: liveSessionState?.lastUserMessage || recentSession?.last_user_message || null,
      lastAssistantMessage: liveSessionState?.lastAssistantMessage || recentSession?.last_assistant_message || null,
      lastActionSummary: liveSessionState?.lastActionSummary || null,
      lastSystemDataSummary: liveSessionState?.lastSystemDataSummary || null,
      updatedAt: liveSessionState?.updatedAt || recentSession?.updated_at || null
    },
    browser: {
      open: !!(liveSessionState?.browserOpen || recentSession?.browser_url),
      url: liveSessionState?.browserUrl || recentSession?.browser_url || null,
      title: liveSessionState?.browserTitle || recentSession?.browser_title || null
    },
    workingMemory: liveSessionState?.workingMemory || null,
    memories: memories.results || [],
    recentTurns: Array.isArray(liveSessionState?.recentTurns) && liveSessionState.recentTurns.length > 0
      ? liveSessionState.recentTurns
      : fallbackTurns
  };
}

async function fetchLiveSessionState(env, profileId) {
  if (!env.PROFILE_SESSIONS) return null;
  try {
    const id = env.PROFILE_SESSIONS.idFromName(profileId);
    const stub = env.PROFILE_SESSIONS.get(id);
    const response = await stub.fetch(new Request(`https://hex-server.invalid/api/live-session/${profileId}`, { method: 'GET' }));
    const payload = await response.json();
    return payload.session || null;
  } catch (_) {
    return null;
  }
}

async function updateLiveSessionFromMessage(env, profileId, sessionId, sessionSnapshot, message) {
  if (!env.PROFILE_SESSIONS) return;
  try {
    const id = env.PROFILE_SESSIONS.idFromName(profileId);
    const stub = env.PROFILE_SESSIONS.get(id);
    const payload = {
      sessionId,
      primaryGoal: sessionSnapshot?.current_goal || inferGoalFromText(message.content),
      lastUserMessage: message.role === 'user' ? message.content : sessionSnapshot?.last_user_message || null,
      lastAssistantMessage: message.role === 'assistant' ? message.content : sessionSnapshot?.last_assistant_message || null,
      activeSurface: sessionSnapshot?.current_surface || message.surface || 'chat',
      browserOpen: !!sessionSnapshot?.browser_url,
      browserUrl: sessionSnapshot?.browser_url || null,
      browserTitle: sessionSnapshot?.browser_title || null,
      updatedAt: nowIso()
    };

    await stub.fetch(new Request(`https://hex-server.invalid/api/live-session/${profileId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  } catch (_) {}
}

async function upsertDerivedMemories(env, profileId, sessionId, message) {
  if (message.role !== 'user') return;
  const candidates = extractMemoryCandidates(message.content);
  for (const candidate of candidates) {
    const existing = await env.DB.prepare(`
      SELECT id, confidence
      FROM memories
      WHERE profile_id = ?1
        AND kind = ?2
        AND content = ?3
        AND status = 'active'
      LIMIT 1
    `).bind(profileId, candidate.kind, candidate.content).first();

    if (existing) {
      await env.DB.prepare(`
        UPDATE memories
        SET confidence = MIN(1, confidence + 0.04),
            updated_at = ?2
        WHERE id = ?1
      `).bind(existing.id, nowIso()).run();
      continue;
    }

    await env.DB.prepare(`
      INSERT INTO memories (
        id, profile_id, kind, content, confidence, source_session_id, source_message_id, tags_json, status, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10)
    `).bind(
      'mem_' + crypto.randomUUID(),
      profileId,
      candidate.kind,
      candidate.content,
      candidate.confidence,
      sessionId,
      message.id,
      JSON.stringify(candidate.tags || []),
      nowIso(),
      nowIso()
    ).run();
  }
}

function extractMemoryCandidates(content) {
  const text = String(content || '').trim();
  if (!text) return [];

  const candidates = [];
  const nameMatch = text.match(/(?:my name is|call me)\s+([^\n,.!?]+)/i);
  if (nameMatch) {
    candidates.push({
      kind: 'identity',
      content: `User's name is ${nameMatch[1].trim()}`,
      confidence: 0.96,
      tags: ['identity', 'name']
    });
  }

  const langMatch = text.match(/(?:speak|talk|answer|write)\s+(?:to me\s+)?in\s+(russian|georgian|english)/i);
  if (langMatch) {
    candidates.push({
      kind: 'preference',
      content: `Preferred response language is ${langMatch[1].trim().toLowerCase()}`,
      confidence: 0.9,
      tags: ['language']
    });
  }

  const likeMatch = text.match(/(?:i like|i love|i prefer)\s+([^\n.!?]+)/i);
  if (likeMatch) {
    candidates.push({
      kind: 'preference',
      content: `User preference: ${likeMatch[1].trim()}`,
      confidence: 0.76,
      tags: ['preference']
    });
  }

  const websiteMatch = text.match(/https?:\/\/[^\s]+/i);
  if (websiteMatch) {
    candidates.push({
      kind: 'resource',
      content: `Known URL: ${websiteMatch[0].replace(/[.,;!?]+$/, '')}`,
      confidence: 0.88,
      tags: ['url']
    });
  }

  return candidates;
}

function inferGoalFromText(content) {
  const text = String(content || '').trim();
  if (!text) return null;
  return text.length > 180 ? text.slice(0, 180) : text;
}

async function persistRegistrationFacts(env, profileId, registration) {
  if (!registration || typeof registration !== 'object') return;
  const fields = [
    ['age', registration.age, 'User age is'],
    ['country', registration.country, 'User country is'],
    ['region', registration.region, 'User region is'],
    ['city', registration.city, 'User city is'],
    ['occupation', registration.occupation, 'User occupation is'],
    ['interests', registration.interests, 'User interests include'],
    ['bio', registration.bio, 'User bio']
  ];

  for (const [key, value, prefix] of fields) {
    const clean = String(value || '').trim();
    if (!clean) continue;
    await env.DB.prepare(`
      INSERT INTO memories (
        id, profile_id, kind, content, confidence, source_session_id, source_message_id, tags_json, status, created_at, updated_at
      )
      VALUES (?1, ?2, 'registration', ?3, ?4, NULL, NULL, ?5, 'active', ?6, ?7)
    `).bind(
      'mem_' + crypto.randomUUID(),
      profileId,
      `${prefix} ${clean}`,
      0.98,
      JSON.stringify(['registration', key]),
      nowIso(),
      nowIso()
    ).run();
  }
}

async function persistDevice(env, profileId, device) {
  if (!device || typeof device !== 'object') return;
  const deviceId = String(device.deviceId || '').trim();
  if (!deviceId) return;

  const labelParts = [device.hostname, device.os, device.platform].filter(Boolean);
  await env.DB.prepare(`
    INSERT OR REPLACE INTO devices (
      id, profile_id, label, platform, app_version, created_at, updated_at
    )
    VALUES (
      ?1,
      ?2,
      COALESCE((SELECT label FROM devices WHERE id = ?1), ?3),
      ?4,
      ?5,
      COALESCE((SELECT created_at FROM devices WHERE id = ?1), ?6),
      ?7
    )
  `).bind(
    deviceId,
    profileId,
    labelParts.join(' | ') || 'HEX Device',
    String(device.platform || '').trim() || null,
    String(device.os || '').trim() || null,
    nowIso(),
    nowIso()
  ).run();

  const ipList = Array.isArray(device.localIps) ? device.localIps.filter(Boolean).join(', ') : '';
  if (ipList) {
    await env.DB.prepare(`
      INSERT INTO memories (
        id, profile_id, kind, content, confidence, source_session_id, source_message_id, tags_json, status, created_at, updated_at
      )
      VALUES (?1, ?2, 'device', ?3, 0.85, NULL, NULL, ?4, 'active', ?5, ?6)
    `).bind(
      'mem_' + crypto.randomUUID(),
      profileId,
      `Known local IPs for device ${deviceId}: ${ipList}`,
      JSON.stringify(['device', 'ip']),
      nowIso(),
      nowIso()
    ).run();
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '');
}

function nowIso() {
  return new Date().toISOString();
}

function isAuthorizedRequest(request, env, pathname) {
  if (pathname === '/api/health') return true;
  const expected = String(env.HEX_API_TOKEN || '').trim();
  if (!expected) return false;

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const alt = (request.headers.get('x-hex-token') || '').trim();
  return bearer === expected || alt === expected;
}

