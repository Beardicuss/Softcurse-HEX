import { isHunterApiConfigured, fetchHunterAuditLogs, fetchHunterKeySummary, fetchHunterProviderStats, fetchHunterValidKeys } from './hunter-api';
import { buildHunterCapabilityPacket, toPublicCapabilityPacket, updateProviderCapabilityState } from './hunter-capabilities';
import { buildTopicLedger, persistTopicTransition } from './topic-ledger';
import { cancelPendingActivities, insertActivityEvent, listActivityEvents } from './activity-store';
import { assembleContextPacketV2 } from './context-packet-v2';
import { buildPriorityReferences } from './retrieval-priority';
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

  if (url.pathname === '/api/hunter/capabilities' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const preferredProvider = String(url.searchParams.get('preferredProvider') || '').trim();
      const packet = await buildHunterCapabilityPacket(env, { preferredProvider });
      return json({ success: true, capabilities: toPublicCapabilityPacket(packet) });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to build Hunter capabilities' }, 502);
    }
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
  if (url.pathname === '/api/hunter/orchestration' && request.method === 'GET') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const preferredProvider = String(url.searchParams.get('preferredProvider') || '').trim();
      const orchestration = await buildHunterCapabilityPacket(env, { preferredProvider });
      return json({ success: true, orchestration });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to build hunter orchestration' }, 502);
    }
  }
  if (url.pathname === '/api/hunter/orchestration/report' && request.method === 'POST') {
    if (!isHunterApiConfigured(env)) {
      return json({ success: false, error: 'Hunter API is not configured' }, 503);
    }
    try {
      const body = await readJson(request);
      const provider = normalizeProviderName(body.provider);
      if (!provider) {
        return json({ success: false, error: 'provider is required' }, 400);
      }
      const state = await updateProviderCapabilityState(env, provider, body || {});
      const orchestration = await buildHunterCapabilityPacket(env, {
        preferredProvider: String(body.preferredProvider || provider || '').trim()
      });
      return json({ success: true, state, orchestration });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to update hunter orchestration state' }, 502);
    }
  }

  if (url.pathname === '/api/activity' && request.method === 'POST') {
    try {
      const event = await insertActivityEvent(env, await readJson(request));
      return json({ success: true, event });
    } catch (error) {
      return json({ success: false, error: error?.message || 'Failed to record activity' }, 400);
    }
  }

  if (url.pathname === '/api/activity' && request.method === 'GET') {
    const profileId = String(url.searchParams.get('profileId') || '').trim();
    if (!profileId) return json({ success: false, error: 'profileId is required' }, 400);
    const events = await listActivityEvents(env, profileId, {
      sessionId: url.searchParams.get('sessionId') || null,
      limit: url.searchParams.get('limit') || 12
    });
    return json({ success: true, events });
  }
  if (url.pathname === '/api/context-packet' && request.method === 'POST') {
    const body = await readJson(request);
    const profileId = String(body.profileId || '').trim();
    if (!profileId) {
      return json({ success: false, error: 'profileId is required' }, 400);
    }

    const packet = await buildContextPacket(env, profileId, String(body.query || ''), body || {});
    if (!packet) return json({ success: false, error: 'Profile not found' }, 404);
    return json({ success: true, packet });
  }

  if (url.pathname === '/api/device-inventory' && request.method === 'POST') {
    const body = await readJson(request);
    const profileId = String(body.profileId || '').trim();
    if (!profileId) {
      return json({ success: false, error: 'profileId is required' }, 400);
    }
    const updated = await persistDeviceInventory(env, profileId, body || {});
    return json({ success: true, updated });
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

  if (url.pathname === '/api/memories' && request.method === 'POST') {
    const body = await readJson(request);
    const profileId = String(body.profileId || '').trim();
    const content = String(body.content || '').trim();
    if (!profileId) return json({ success: false, error: 'profileId is required' }, 400);
    if (!content) return json({ success: false, error: 'content is required' }, 400);
    const memory = await upsertExplicitMemory(env, {
      profileId,
      sessionId: body.sessionId || null,
      messageId: body.messageId || null,
      kind: body.kind || 'explicit',
      content,
      confidence: body.confidence,
      tags: Array.isArray(body.tags) ? body.tags : ['explicit', 'desktop']
    });
    return json({ success: true, memory });
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
    await persistDialogueActivity(env, message);
    await persistTopicTransition(env, message);
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

async function buildContinuityPacket(env, profileId, options = {}) {
  const profile = await env.DB.prepare(`
    SELECT id, display_name, normalized_name, language, assistant_mode, persona_id, created_at, updated_at
    FROM profiles
    WHERE id = ?1
    LIMIT 1
  `).bind(profileId).first();
  if (!profile) return null;

  const preferredSessionId = String(options.sessionId || '').trim();
  const preferredDeviceId = String(options.deviceId || '').trim();

  const recentSession = preferredSessionId
    ? await env.DB.prepare(`
      SELECT id, title, status, current_goal, current_surface, browser_url, browser_title, last_user_message, last_assistant_message, updated_at, device_id
      FROM sessions
      WHERE id = ?1 AND profile_id = ?2
      LIMIT 1
    `).bind(preferredSessionId, profileId).first()
    : await env.DB.prepare(`
      SELECT id, title, status, current_goal, current_surface, browser_url, browser_title, last_user_message, last_assistant_message, updated_at, device_id
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
    LIMIT 18
  `).bind(profileId).all();

  const liveSessionState = await fetchLiveSessionState(env, profileId);
  const fallbackTurns = (recentTurns.results || []).slice().reverse();
  const effectiveDeviceId = preferredDeviceId || liveSessionState?.deviceId || recentSession?.device_id || null;
  const storedDesktopContext = await getStoredDeviceDesktopContext(env, profileId, effectiveDeviceId);
  const mergedDesktopContext = mergeDesktopContexts(liveSessionState?.desktopContext || null, storedDesktopContext);

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
      updatedAt: liveSessionState?.updatedAt || recentSession?.updated_at || null,
      deviceId: effectiveDeviceId
    },
    browser: {
      open: !!(liveSessionState?.browserOpen || recentSession?.browser_url),
      url: liveSessionState?.browserUrl || recentSession?.browser_url || null,
      title: liveSessionState?.browserTitle || recentSession?.browser_title || null
    },
    workingMemory: liveSessionState?.workingMemory || null,
    desktopContext: mergedDesktopContext,
    memories: memories.results || [],
    recentTurns: Array.isArray(liveSessionState?.recentTurns) && liveSessionState.recentTurns.length > 0
      ? liveSessionState.recentTurns
      : fallbackTurns
  };
}

async function buildContextPacket(env, profileId, query, options = {}) {
  const continuity = await buildContinuityPacket(env, profileId, options);
  if (!continuity) return null;

  continuity.activityEvents = await listActivityEvents(env, profileId, { sessionId: continuity.session?.sessionId, limit: 30 });
  continuity.topicLedger = buildTopicLedger(continuity.activityEvents);
  const retrievalPlan = buildRetrievalPlan(query, continuity, options);
  const relevantMemories = rankRelevantMemories(query, continuity.memories || [], 6, retrievalPlan);
  const relevantTurns = rankRelevantTurns(query, continuity.recentTurns || [], 6, retrievalPlan);
  const references = extractContinuityReferences(continuity, query, options);
  const unresolvedTasks = deriveUnresolvedTasks(continuity, relevantTurns);
  const actionTimeline = buildActionTimeline(continuity, relevantTurns, retrievalPlan);

  return assembleContextPacketV2({
    continuity,
    retrieval: summarizeRetrievalPlan(retrievalPlan, references),
    relevantMemories,
    relevantTurns,
    references,
    unresolvedTasks,
    actionTimeline,
    summary: buildContextSummary(continuity, relevantMemories, relevantTurns, references, unresolvedTasks, actionTimeline, retrievalPlan),
    query
  });
}

function mergeDesktopContexts(primary = null, fallback = null) {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;

  const listFields = ['promotedRecent', 'knownLocations', 'appCandidates', 'fileCandidates', 'folderCandidates', 'gameCandidates', 'windowCandidates', 'processCandidates', 'inventoryHighlights', 'entityMatches'];
  const merged = { ...fallback, ...primary };
  for (const field of listFields) {
    const seen = new Set();
    merged[field] = [...(Array.isArray(primary?.[field]) ? primary[field] : []), ...(Array.isArray(fallback?.[field]) ? fallback[field] : [])]
      .map((item) => String(item || '').trim())
      .filter((item) => {
        if (!item) return false;
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, field === 'inventoryHighlights' ? 10 : 16);
  }
  return merged;
}

async function getStoredDeviceDesktopContext(env, profileId, deviceId = null) {
  const deviceTag = String(deviceId || '').trim();
  let row = null;
  if (deviceTag) {
    row = await env.DB.prepare(`
      SELECT content, updated_at
      FROM memories
      WHERE profile_id = ?1
        AND kind = 'device_inventory'
        AND tags_json LIKE ?2
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(profileId, '%' + deviceTag + '%').first();
  }
  if (!row) {
    row = await env.DB.prepare(`
      SELECT content, updated_at
      FROM memories
      WHERE profile_id = ?1
        AND kind = 'device_inventory'
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(profileId).first();
  }
  if (!row?.content) return null;
  return parseStoredDeviceInventory(row.content, row.updated_at);
}

function parseStoredDeviceInventory(content, updatedAt = null) {
  const text = String(content || '').trim();
  if (!text) return null;
  const parts = text.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const result = {
    promotedRecent: [],
    knownLocations: [],
    appCandidates: [],
    fileCandidates: [],
    folderCandidates: [],
    gameCandidates: [],
    windowCandidates: [],
    processCandidates: [],
    inventoryHighlights: [],
    entityMatches: [],
    inventorySummary: text,
    inventoryUpdatedAt: updatedAt || null
  };

  for (const part of parts) {
    result.inventoryHighlights.push(part);
    const splitAt = part.indexOf(':');
    if (splitAt === -1) continue;
    const label = part.slice(0, splitAt).trim().toLowerCase();
    const values = part.slice(splitAt + 1).split(',').map((item) => item.trim()).filter(Boolean);
    if (label === 'apps') result.appCandidates.push(...values);
    else if (label === 'files') result.fileCandidates.push(...values);
    else if (label === 'folders' || label === 'locations') result.folderCandidates.push(...values);
    else if (label === 'games') result.gameCandidates.push(...values);
    else if (label === 'windows') result.windowCandidates.push(...values);
    else if (label === 'processes') result.processCandidates.push(...values);
  }

  result.promotedRecent = result.inventoryHighlights.slice(0, 8);
  result.knownLocations = result.folderCandidates.slice(0, 8);
  return result;
}

function rankRelevantMemories(query, memories, limit = 6, retrievalPlan = null) {
  const queryText = String(query || '').trim();
  const tokens = tokenizeForSearch(queryText);
  const source = Array.isArray(memories) ? memories : [];

  return source
    .map((memory) => {
      const score = scoreMemoryMatch(queryText, tokens, memory, retrievalPlan);
      return {
        ...memory,
        score,
        retrievalReason: buildMemoryRetrievalReason(queryText, tokens, memory, retrievalPlan, score)
      };
    })
    .filter((memory) => memory.score > 0 || !queryText)
    .sort((a, b) => (b.score - a.score) || ((b.confidence || 0) - (a.confidence || 0)))
    .slice(0, limit)
    .map(({ score, ...memory }) => memory);
}

function rankRelevantTurns(query, turns, limit = 6, retrievalPlan = null) {
  const queryText = String(query || '').trim();
  const tokens = tokenizeForSearch(queryText);
  const source = Array.isArray(turns) ? turns : [];

  return source
    .map((turn, index) => {
      const score = scoreTurnMatch(queryText, tokens, turn, index, source.length, retrievalPlan);
      return {
        ...turn,
        score,
        retrievalReason: buildTurnRetrievalReason(queryText, tokens, turn, index, source.length, retrievalPlan, score)
      };
    })
    .filter((turn) => turn.score > 0 || !queryText)
    .sort((a, b) => (b.score - a.score))
    .slice(0, limit)
    .map(({ score, ...turn }) => turn);
}

function normalizeReferenceItem(item, fallbackKind = 'recent', index = 0) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const label = String(item.label || item.value || item.path || '').trim();
    if (!label) return null;
    return {
      index: Number.isFinite(item.index) ? item.index : index + 1,
      kind: String(item.kind || fallbackKind || 'recent').trim(),
      label,
      path: item.path || null,
      value: item.value || item.path || label,
      meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : {}
    };
  }

  const label = String(item || '').trim();
  if (!label) return null;
  return {
    index: index + 1,
    kind: fallbackKind || 'recent',
    label,
    path: null,
    value: label,
    meta: {}
  };
}

function buildCategoryBucket(items, fallbackKind, limit = 8) {
  const unique = [];
  const seen = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const normalized = normalizeReferenceItem(raw, fallbackKind, unique.length);
    if (!normalized) continue;
    const key = [normalized.kind, normalized.path || '', normalized.value || '', normalized.label].join('::').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...normalized, index: unique.length + 1 });
    if (unique.length >= limit) break;
  }
  return unique;
}

function buildDesktopReferenceBuckets(desktop = {}) {
  return {
    apps: buildCategoryBucket(desktop.appCandidates || [], 'app', 8),
    files: buildCategoryBucket(desktop.fileCandidates || [], 'file', 8),
    folders: buildCategoryBucket(desktop.folderCandidates || [], 'folder', 8),
    games: buildCategoryBucket(desktop.gameCandidates || [], 'game', 8),
    windows: buildCategoryBucket(desktop.windowCandidates || [], 'window', 8),
    processes: buildCategoryBucket(desktop.processCandidates || [], 'process', 8),
    locations: buildCategoryBucket(desktop.knownLocations || [], 'folder', 8),
    recent: buildCategoryBucket(desktop.promotedRecent || desktop.inventoryHighlights || [], 'recent', 8),
    entityMatches: buildCategoryBucket(desktop.entityMatches || [], 'recent', 8)
  };
}

function detectDesktopReferenceFocus(queryText) {
  const lower = String(queryText || '').toLowerCase();
  if (!lower) return ['recent', 'entityMatches', 'apps', 'files', 'folders', 'games', 'windows', 'processes', 'locations'];
  if (/\b(game|steam|epic|play|launch)\b/.test(lower)) return ['games', 'apps', 'recent'];
  if (/\b(app|program|software|install|open app|run app)\b/.test(lower)) return ['apps', 'recent', 'windows'];
  if (/\b(file|document|txt|pdf|image|photo|video|song)\b/.test(lower)) return ['files', 'recent', 'folders'];
  if (/\b(folder|directory|location|desktop|downloads|documents|pictures|videos|music)\b/.test(lower)) return ['folders', 'locations', 'recent'];
  if (/\b(window|tab|focus|switch|bring)\b/.test(lower)) return ['windows', 'apps', 'recent'];
  if (/\b(process|task|service|pid|kill|terminate|running)\b/.test(lower)) return ['processes', 'windows', 'recent'];
  return ['entityMatches', 'recent', 'apps', 'files', 'folders', 'games', 'windows', 'processes', 'locations'];
}

function flattenPreferredDesktopReferences(buckets, focusOrder, queryText, limit = 10) {
  const merged = [];
  const seen = new Set();
  for (const key of focusOrder) {
    for (const value of Array.isArray(buckets[key]) ? buckets[key] : []) {
      const normalized = normalizeReferenceItem(value, key, merged.length);
      if (!normalized) continue;
      const id = [normalized.kind, normalized.path || '', normalized.value || '', normalized.label].join('::').toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(normalized);
    }
  }
  return merged
    .map((item, index) => ({ item, score: scoreTextMatch(queryText, tokenizeForSearch(queryText), item.label + ' ' + (item.path || '') + ' ' + (item.value || '')) + Math.max(0, (20 - index) * 0.01) }))
    .filter((entry) => entry.score > 0 || !String(queryText || '').trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, index) => ({ ...entry.item, index: index + 1 }));
}

function extractContinuityReferences(continuity, query, options = {}) {
  const desktop = continuity?.desktopContext || {};
  const browser = continuity?.browser || {};
  const queryText = String(query || '').trim();
  const desktopByCategory = buildDesktopReferenceBuckets(desktop);
  const focusOrder = detectDesktopReferenceFocus(queryText);
  const desktopHits = flattenPreferredDesktopReferences(desktopByCategory, focusOrder, queryText, 10);
  const browserPool = [];
  if (browser.open) {
    if (browser.title) browserPool.push(String(browser.title));
    if (browser.url) browserPool.push(String(browser.url));
  }
  for (const turn of Array.isArray(continuity?.recentTurns) ? continuity.recentTurns : []) {
    if (turn?.surface === 'browser' && turn?.content) browserPool.push(String(turn.content).substring(0, 180));
  }
  const browserHits = rankReferenceStrings(queryText, browserPool, 6);
  const priority = buildPriorityReferences({
    query: queryText,
    desktopByCategory,
    focusOrder,
    desktopHits,
    browserHits,
    limit: 12
  });

  return {
    priority,
    desktop: desktopHits,
    desktopByCategory,
    desktopFocusOrder: focusOrder,
    browser: browserHits,
    query: queryText,
    requestedSurface: String(options.surface || '').trim() || null
  };
}

function deriveUnresolvedTasks(continuity, relevantTurns) {
  const lifecycleEvents = Array.isArray(continuity?.activityEvents) ? continuity.activityEvents : [];
  const durable = lifecycleEvents
    .filter((event) => (event?.kind === 'task' || event?.kind === 'commitment') && event?.status === 'pending')
    .map((event) => ({ kind: event.kind, text: String(event.summary || '').trim() }))
    .filter((item) => item.text);
  if (lifecycleEvents.length > 0) return dedupeTasks(durable).slice(0, 6);

  const session = continuity?.session || {};
  const turns = Array.isArray(relevantTurns) && relevantTurns.length > 0
    ? relevantTurns
    : (Array.isArray(continuity?.recentTurns) ? continuity.recentTurns : []);
  const legacy = [];
  if (session.primaryGoal) legacy.push({ kind: 'goal', text: session.primaryGoal });
  if (session.lastActionSummary) legacy.push({ kind: 'action-plan', text: session.lastActionSummary });
  for (const turn of turns) {
    const content = String(turn?.content || '').trim();
    if ((turn?.role || '').toLowerCase() === 'user' && /\b(continue|next|open|show|find|search|play|launch|check|read|focus|close|fix|remember)\b/i.test(content)) {
      legacy.push({ kind: 'user-follow-up', text: content });
    }
  }
  return dedupeTasks(legacy).slice(0, 6);
}

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = String(task?.text || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function buildActionTimeline(continuity, relevantTurns, retrievalPlan = null) {
  const timeline = (continuity?.activityEvents || [])
    .filter((event) => event?.kind === 'action-result')
    .map((event) => ({
    kind: event.kind || 'action',
    status: event.status || 'unknown',
    actionType: event.actionType || null,
    text: event.summary,
    surface: event.surface || 'chat',
    at: event.createdAt || null
  }));
  const turns = Array.isArray(continuity?.recentTurns) ? continuity.recentTurns : [];
  const scored = Array.isArray(relevantTurns) ? relevantTurns : [];

  if (continuity?.session?.lastActionSummary) {
    timeline.push({
      kind: 'action-plan',
      text: String(continuity.session.lastActionSummary),
      surface: continuity.session.activeSurface || 'chat',
      at: continuity.session.updatedAt || null
    });
  }

  for (const turn of turns.slice(-6)) {
    const text = String(turn?.content || '').trim();
    if (!text) continue;
    const role = String(turn?.role || 'user').toLowerCase();
    const isActionish = role === 'assistant' || /\[ACTION:/i.test(text) || /(opening|launching|checking|searching|reading|focusing|closing)/i.test(text);
    if (!isActionish) continue;
    timeline.push({
      kind: role === 'assistant' ? 'assistant-step' : 'user-request',
      text: text.substring(0, 180),
      surface: turn?.surface || continuity?.session?.activeSurface || 'chat',
      at: turn?.created_at || null
    });
  }

  for (const turn of scored.slice(0, 2)) {
    const text = String(turn?.content || '').trim();
    if (!text) continue;
    timeline.push({
      kind: 'relevant-turn',
      text: text.substring(0, 160),
      surface: turn?.surface || 'chat',
      at: turn?.created_at || null
    });
  }

  return dedupeTimeline(timeline).slice(0, 10);
}

function dedupeTimeline(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = `${String(item?.kind || '')}::${String(item?.surface || '')}::${String(item?.text || '').toLowerCase()}`;
    if (!item?.text || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildContextSummary(continuity, relevantMemories, relevantTurns, references, unresolvedTasks, actionTimeline) {
  const session = continuity?.session || {};
  const browser = continuity?.browser || {};
  return {
    goal: session.primaryGoal || null,
    activeSurface: session.activeSurface || 'chat',
    browserOpen: !!browser.open,
    memoryHighlights: relevantMemories.slice(0, 3).map((item) => item.content),
    recentTurnHighlights: relevantTurns.slice(0, 3).map((item) => `${String(item.role || 'user').toUpperCase()}: ${String(item.content || '').substring(0, 120)}`),
    desktopReferences: (references?.desktop || []).slice(0, 5),
    desktopFocusOrder: (references?.desktopFocusOrder || []).slice(0, 4),
    browserReferences: (references?.browser || []).slice(0, 5),
    unresolvedTaskTexts: (unresolvedTasks || []).slice(0, 4).map((item) => item.text),
    actionHighlights: (actionTimeline || []).slice(0, 5).map((item) => item.text)
  };
}

function buildRetrievalPlan(query, continuity, options = {}) {
  const queryText = String(query || '').trim();
  const lower = queryText.toLowerCase();
  const browserOpen = !!continuity?.browser?.open;
  const requestedSurface = String(options?.surface || '').trim().toLowerCase();
  let surface = requestedSurface || (browserOpen ? 'browser' : (continuity?.session?.activeSurface || 'chat'));
  if (/\b(browser|page|site|website|url|link|tab|video|result|button|youtube|google)\b/.test(lower)) surface = 'browser';
  if (/\b(file|folder|directory|document|app|program|software|game|window|process|desktop|downloads|documents)\b/.test(lower)) surface = 'desktop';

  let intent = 'general';
  if (/\b(open|launch|play|run|click|select|choose|focus|close|kill|terminate)\b/.test(lower)) intent = 'action';
  else if (/\b(find|search|look for|where|which|show|list|what exists|what is on this pc)\b/.test(lower)) intent = 'lookup';
  else if (/\b(remember|who|what|why|how|when|continue|resume|again|same|previous|next)\b/.test(lower)) intent = 'continuity';

  const focusKinds = [];
  const push = (value) => {
    const clean = String(value || '').trim();
    if (!clean || focusKinds.includes(clean)) return;
    focusKinds.push(clean);
  };

  if (/\b(video|result|button|link|page|article|browser)\b/.test(lower)) {
    ['browser', 'video', 'result', 'link', 'button', 'page', 'article'].forEach(push);
  }
  if (/\b(game|steam|epic)\b/.test(lower)) push('game');
  if (/\b(app|program|software)\b/.test(lower)) push('app');
  if (/\b(file|document|pdf|image|photo|video file|song)\b/.test(lower)) push('file');
  if (/\b(folder|directory|location|desktop|downloads|documents|pictures|videos|music)\b/.test(lower)) push('folder');
  if (/\b(window|tab)\b/.test(lower)) push('window');
  if (/\b(process|task|service|pid)\b/.test(lower)) push('process');
  if (!focusKinds.length) {
    if (surface === 'browser') ['browser', 'page', 'result'].forEach(push);
    else if (surface === 'desktop') ['app', 'file', 'folder', 'game', 'window', 'process'].forEach(push);
  }

  return {
    query: queryText,
    surface,
    intent,
    browserOpen,
    focusKinds,
    sessionSurface: continuity?.session?.activeSurface || 'chat'
  };
}

function summarizeRetrievalPlan(plan, references) {
  return {
    query: plan?.query || '',
    surface: plan?.surface || 'chat',
    intent: plan?.intent || 'general',
    browserOpen: !!plan?.browserOpen,
    focusKinds: Array.isArray(plan?.focusKinds) ? plan.focusKinds.slice(0, 6) : [],
    desktopReferenceCount: Array.isArray(references?.desktop) ? references.desktop.length : 0,
    browserReferenceCount: Array.isArray(references?.browser) ? references.browser.length : 0
  };
}

function rankReferenceStrings(query, values, limit = 8) {
  const queryText = String(query || '').trim();
  const tokens = tokenizeForSearch(queryText);
  const unique = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const clean = String(value || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }

  return unique
    .map((value, index) => ({ value, score: scoreTextMatch(queryText, tokens, value) + Math.max(0, (20 - index) * 0.01) }))
    .filter((item) => item.score > 0 || !queryText)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.value);
}

function buildMemoryRetrievalReason(queryText, tokens, memory, retrievalPlan = null, score = 0) {
  const reasons = [];
  const kind = String(memory?.kind || '').toLowerCase();
  const hay = [memory?.content, memory?.kind, memory?.status].filter(Boolean).join(' ').toLowerCase();
  const matched = tokens.filter((token) => hay.includes(token)).slice(0, 4);
  if (matched.length) reasons.push('matched: ' + matched.join(', '));
  if (memory?.confidence != null) reasons.push('confidence ' + Number(memory.confidence || 0).toFixed(2));
  if (/identity|preference|registration/.test(kind)) reasons.push('profile memory');
  if (kind === 'device_inventory') reasons.push('device inventory');
  if (Array.isArray(retrievalPlan?.focusKinds) && retrievalPlan.focusKinds.some((item) => kind.includes(item) || item.includes(kind))) reasons.push('focus kind ' + retrievalPlan.focusKinds.join('/'));
  if (retrievalPlan?.surface === 'browser' && /browser|page|result|link|video|article/.test(kind)) reasons.push('browser surface');
  if (retrievalPlan?.surface === 'desktop' && /device_inventory|app|file|folder|game|window|process/.test(kind)) reasons.push('desktop surface');
  if (retrievalPlan?.intent === 'continuity' && /identity|preference|registration|summary|conversation/.test(kind)) reasons.push('continuity intent');
  if (!reasons.length && !queryText) reasons.push('recent memory fallback');
  return reasons.slice(0, 4).join(' | ') || ('score ' + Number(score || 0).toFixed(2));
}

function buildTurnRetrievalReason(queryText, tokens, turn, index, total, retrievalPlan = null, score = 0) {
  const reasons = [];
  const hay = [turn?.role, turn?.surface, turn?.content, turn?.summary].filter(Boolean).join(' ').toLowerCase();
  const matched = tokens.filter((token) => hay.includes(token)).slice(0, 4);
  if (matched.length) reasons.push('matched: ' + matched.join(', '));
  const recency = Math.max(0, total - index);
  if (recency > 0) reasons.push('recent turn ' + recency);
  if (String(turn?.role || '').toLowerCase() === 'user') reasons.push('user turn');
  if (retrievalPlan?.surface && String(turn?.surface || '').toLowerCase() === retrievalPlan.surface) reasons.push('surface ' + retrievalPlan.surface);
  if (retrievalPlan?.intent === 'action' && /(open|launch|play|click|focus|close|run|search|find|show)/i.test(String(turn?.content || ''))) reasons.push('action intent');
  if (retrievalPlan?.intent === 'continuity' && String(turn?.role || '').toLowerCase() === 'user') reasons.push('continuity intent');
  return reasons.slice(0, 4).join(' | ') || ('score ' + Number(score || 0).toFixed(2));
}
function scoreMemoryMatch(queryText, tokens, memory, retrievalPlan = null) {
  const hay = [memory?.content, memory?.kind, memory?.status].filter(Boolean).join(' ');
  const base = scoreTextMatch(queryText, tokens, hay);
  const confidence = Number(memory?.confidence || 0) * 0.4;
  const preferenceBoost = /identity|preference|registration/.test(String(memory?.kind || '')) ? 0.12 : 0;
  const deviceBoost = String(memory?.kind || '') === 'device_inventory' ? 0.24 : 0;
  const recencyBoost = memory?.updated_at ? 0.05 : 0;
  const kind = String(memory?.kind || '').toLowerCase();
  const focusBoost = Array.isArray(retrievalPlan?.focusKinds) && retrievalPlan.focusKinds.some((item) => kind.includes(item) || item.includes(kind)) ? 0.32 : 0;
  const browserBoost = retrievalPlan?.surface === 'browser' && /browser|page|result|link|video|article/.test(kind) ? 0.26 : 0;
  const desktopBoost = retrievalPlan?.surface === 'desktop' && /device_inventory|app|file|folder|game|window|process/.test(kind) ? 0.18 : 0;
  const continuityBoost = retrievalPlan?.intent === 'continuity' && /identity|preference|registration|summary|conversation/.test(kind) ? 0.16 : 0;
  return base + confidence + preferenceBoost + deviceBoost + recencyBoost + focusBoost + browserBoost + desktopBoost + continuityBoost;
}

function scoreTurnMatch(queryText, tokens, turn, index, total, retrievalPlan = null) {
  const hay = [turn?.role, turn?.surface, turn?.content, turn?.summary].filter(Boolean).join(' ');
  const base = scoreTextMatch(queryText, tokens, hay);
  const recencyBoost = Math.max(0, (total - index) * 0.03);
  const userBoost = String(turn?.role || '').toLowerCase() === 'user' ? 0.05 : 0;
  const surfaceBoost = retrievalPlan?.surface && String(turn?.surface || '').toLowerCase() === retrievalPlan.surface ? 0.22 : 0;
  const continuityBoost = retrievalPlan?.intent === 'continuity' && String(turn?.role || '').toLowerCase() === 'user' ? 0.08 : 0;
  const actionBoost = retrievalPlan?.intent === 'action' && /(open|launch|play|click|focus|close|run|search|find|show)/i.test(String(turn?.content || '')) ? 0.12 : 0;
  return base + recencyBoost + userBoost + surfaceBoost + continuityBoost + actionBoost;
}

function scoreTextMatch(queryText, tokens, text) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return 0;
  if (!queryText) return 0.05;
  let score = 0;
  const cleanQuery = String(queryText || '').toLowerCase();
  if (cleanQuery && hay.includes(cleanQuery)) score += 1.2;
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 0.35 : 0.18;
  }
  return score;
}

function tokenizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 16);
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

async function persistDialogueActivity(env, message) {
  const role = String(message?.role || '').toLowerCase();
  const content = String(message?.content || '').trim();
  const base = {
    profileId: message.profile_id,
    sessionId: message.session_id,
    surface: message.surface || 'chat',
    details: { sourceMessageId: message.id },
    createdAt: message.created_at
  };

  if (role === 'user' && /\b(cancel|stop|never mind|nevermind|forget it|do not continue|don't continue)\b/i.test(content)) {
    await cancelPendingActivities(env, message.profile_id, message.session_id);
    return;
  }

  const isCorrection = role === 'user' && /\b(no,?|actually|i mean|not that|instead|correction|don't|do not)\b/i.test(content);
  if (isCorrection) {
    await cancelPendingActivities(env, message.profile_id, message.session_id);
    await insertActivityEvent(env, { ...base, kind: 'correction', status: 'success', summary: content.slice(0, 500) });
  }

  if (role === 'user' && /\b(open|launch|play|run|click|select|focus|close|find|search|show|read|check|fix|create|move|copy|delete|set|remind|continue|install|update)\b/i.test(content)) {
    await insertActivityEvent(env, { ...base, kind: 'task', status: 'pending', summary: content.slice(0, 500) });
  }

  if (role === 'assistant' && /\b(i will|i'll|let me|next i|we will|i can)\b/i.test(content)) {
    await insertActivityEvent(env, { ...base, kind: 'commitment', status: 'pending', summary: content.slice(0, 500) });
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

async function upsertExplicitMemory(env, payload = {}) {
  const profileId = String(payload.profileId || '').trim();
  const content = String(payload.content || '').trim().slice(0, 1200);
  const kind = String(payload.kind || 'explicit').trim().slice(0, 60) || 'explicit';
  const confidence = Math.max(0.1, Math.min(1, Number(payload.confidence || 0.97)));
  const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).slice(0, 50)).filter(Boolean).slice(0, 12) : ['explicit'];
  const existing = await env.DB.prepare(`
    SELECT id, confidence
    FROM memories
    WHERE profile_id = ?1
      AND kind = ?2
      AND content = ?3
      AND status = 'active'
    LIMIT 1
  `).bind(profileId, kind, content).first();

  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE memories
      SET confidence = MIN(1, confidence + 0.05),
          tags_json = ?2,
          updated_at = ?3
      WHERE id = ?1
    `).bind(existing.id, JSON.stringify(tags), nowIso()).run();
    return { id: existing.id, profile_id: profileId, kind, content, confidence: Math.min(1, Number(existing.confidence || confidence) + 0.05), updatedExisting: true };
  }

  const id = 'mem_' + crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO memories (
      id, profile_id, kind, content, confidence, source_session_id, source_message_id, tags_json, status, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10)
  `).bind(
    id,
    profileId,
    kind,
    content,
    confidence,
    payload.sessionId ? String(payload.sessionId) : null,
    payload.messageId ? String(payload.messageId) : null,
    JSON.stringify(tags),
    nowIso(),
    nowIso()
  ).run();
  return { id, profile_id: profileId, kind, content, confidence, updatedExisting: false };
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
  const rememberMatch = text.match(/(?:remember that|remember|save that|запомни(?: что)?|сохрани(?: что)?|დაიმახსოვრე(?: რომ)?|შეინახე(?: რომ)?)\s+([^\n]+)/i);
  if (rememberMatch) {
    candidates.push({
      kind: 'explicit',
      content: rememberMatch[1].trim().replace(/[.!?]+$/, ''),
      confidence: 0.97,
      tags: ['explicit', 'remember']
    });
  }

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

async function persistDeviceInventory(env, profileId, payload) {
  const deviceId = String(payload.deviceId || '').trim() || String(payload.sessionId || '').trim() || ('inv_' + crypto.randomUUID());
  const inventory = payload.inventory && typeof payload.inventory === 'object' ? payload.inventory : {};
  const highlights = buildInventoryHighlights(inventory);
  const content = `Known PC inventory for device ${deviceId}: ${highlights.join(' | ')}`;

  const existing = await env.DB.prepare(`
    SELECT id
    FROM memories
    WHERE profile_id = ?1
      AND kind = 'device_inventory'
      AND tags_json LIKE ?2
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(profileId, '%' + deviceId + '%').first();

  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE memories
      SET content = ?2,
          confidence = 0.92,
          tags_json = ?3,
          updated_at = ?4
      WHERE id = ?1
    `).bind(
      existing.id,
      content,
      JSON.stringify(['device', 'inventory', deviceId]),
      nowIso()
    ).run();
    return { deviceId, highlights, updatedExisting: true };
  }

  await env.DB.prepare(`
    INSERT INTO memories (
      id, profile_id, kind, content, confidence, source_session_id, source_message_id, tags_json, status, created_at, updated_at
    )
    VALUES (?1, ?2, 'device_inventory', ?3, 0.92, NULL, NULL, ?4, 'active', ?5, ?6)
  `).bind(
    'mem_' + crypto.randomUUID(),
    profileId,
    content,
    JSON.stringify(['device', 'inventory', deviceId]),
    nowIso(),
    nowIso()
  ).run();

  return { deviceId, highlights, updatedExisting: false };
}

function buildInventoryHighlights(inventory = {}) {
  const parts = [];
  const pushBucket = (label, list, limit = 5) => {
    const items = (Array.isArray(list) ? list : [])
      .map((item) => String(item?.label || item?.value || item?.path || '').trim())
      .filter(Boolean)
      .slice(0, limit);
    if (items.length) parts.push(`${label}: ${items.join(', ')}`);
  };
  pushBucket('apps', inventory.apps, 5);
  pushBucket('games', inventory.games, 5);
  pushBucket('files', inventory.files, 4);
  pushBucket('folders', inventory.folders, 4);
  pushBucket('windows', inventory.windows, 4);
  pushBucket('processes', inventory.processes, 4);
  pushBucket('locations', inventory.knownLocations, 4);
  return parts.slice(0, 8);
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
