function getHunterApiBaseUrl(env) {
  return String(env.HUNTER_API_BASE_URL || '').trim().replace(/\/$/, '');
}

function getHunterApiToken(env) {
  return String(env.HUNTER_API_TOKEN || '').trim();
}

export function isHunterApiConfigured(env) {
  return !!(getHunterApiBaseUrl(env) && getHunterApiToken(env));
}

async function fetchHunterJson(env, path) {
  const baseUrl = getHunterApiBaseUrl(env);
  const token = getHunterApiToken(env);

  if (!baseUrl || !token) {
    throw new Error('Hunter API is not configured');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'authorization': `Bearer ${token}`,
      'x-hex-token': token,
      'user-agent': 'hex-server/0.1.0'
    }
  });

  const payload = await safeReadJson(response);
  if (!response.ok) {
    const reason = payload?.error || payload?.message || `Remote API returned ${response.status}`;
    throw new Error(reason);
  }

  return payload;
}

export async function fetchHunterProviderStats(env) {
  const payload = await fetchHunterJson(env, '/api/hunter/provider-stats');
  return Array.isArray(payload?.stats) ? payload.stats : [];
}

export async function fetchHunterAuditLogs(env, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const payload = await fetchHunterJson(env, `/api/hunter/audit?limit=${safeLimit}`);
  return Array.isArray(payload?.logs) ? payload.logs : [];
}

export async function fetchHunterKeySummary(env) {
  const payload = await fetchHunterJson(env, '/api/hunter/key-summary');
  return payload?.summary || {};
}

export async function fetchHunterValidKeys(env) {
  const payload = await fetchHunterJson(env, '/api/hunter/valid-keys');
  return payload?.keys && typeof payload.keys === 'object' ? payload.keys : {};
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}
