import { fetchHunterKeySummary, fetchHunterProviderStats, fetchHunterValidKeys } from './hunter-api';

export const HUNTER_CAPABILITY_SCHEMA = 'hex.hunter-capabilities.v1';

const PACKET_KEY = 'hunter:capabilities:v1:last-good';
const STATE_PREFIX = 'hunter:provider-state:';
const HARD_COOLDOWN_MS = 15 * 60 * 1000;
const SOFT_COOLDOWN_MS = 5 * 60 * 1000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const STALE_AFTER_MS = 10 * 60 * 1000;

export async function buildHunterCapabilityPacket(env, options = {}) {
  const preferredProvider = normalizeProvider(options.preferredProvider);
  try {
    const [stats, summary, validKeys, states] = await Promise.all([
      fetchHunterProviderStats(env),
      fetchHunterKeySummary(env),
      fetchHunterValidKeys(env),
      getStateMap(env)
    ]);
    const packet = createPacket(stats, summary, validKeys, states, preferredProvider);
    await cachePacket(env, packet);
    return packet;
  } catch (error) {
    const cached = await readCachedPacket(env);
    if (!cached) throw error;
    return finalize(
      rankProviders(cached.providers || [], preferredProvider),
      preferredProvider,
      {
        generatedAt: new Date().toISOString(),
        fetchedAt: cached.fetchedAt || cached.generatedAt || null,
        stale: true,
        staleAgeMs: ageOf(cached.fetchedAt || cached.generatedAt),
        staleAfterMs: STALE_AFTER_MS,
        degraded: true,
        source: 'hunter-cache',
        degradationReason: String(error?.message || 'Hunter unavailable').slice(0, 300)
      }
    );
  }
}

export async function updateProviderCapabilityState(env, provider, payload = {}) {
  const normalized = normalizeProvider(provider);
  if (!normalized) throw new Error('provider is required');
  const current = await getState(env, normalized);
  const now = new Date();
  const ok = payload.ok === true;
  const next = {
    provider: normalized,
    updatedAt: now.toISOString(),
    lastError: ok ? null : String(payload.error || payload.reason || 'Provider failure').slice(0, 500),
    lastSuccessAt: ok ? now.toISOString() : (current.lastSuccessAt || null),
    lastFailureAt: ok ? (current.lastFailureAt || null) : now.toISOString(),
    consecutiveFailures: ok ? 0 : Number(current.consecutiveFailures || 0) + 1,
    cooldownUntil: null
  };
  if (!ok) {
    const requested = Number(payload.cooldownMs || 0);
    const duration = requested > 0
      ? Math.min(requested, 60 * 60 * 1000)
      : (next.consecutiveFailures >= 2 ? HARD_COOLDOWN_MS : SOFT_COOLDOWN_MS);
    next.cooldownUntil = new Date(now.getTime() + duration).toISOString();
  }
  await putState(env, normalized, next);
  return next;
}

export function toPublicCapabilityPacket(packet) {
  if (!packet) return null;
  return {
    ...packet,
    providers: (packet.providers || []).map(({ liveKeys, ...provider }) => provider)
  };
}

function createPacket(stats, summary, validKeys, states, preferredProvider) {
  const statsMap = indexStats(stats);
  const summaryMap = indexSummary(summary);
  const keyMap = normalizeKeys(validKeys);
  const names = new Set([
    ...Object.keys(statsMap),
    ...Object.keys(summaryMap),
    ...Object.keys(keyMap),
    ...Object.keys(states)
  ]);
  const providers = Array.from(names).map((provider) => {
    const stat = statsMap[provider] || {};
    const sum = summaryMap[provider] || {};
    const liveKeys = keyMap[provider] || [];
    return {
      provider,
      label: provider.toUpperCase(),
      validKeys: Math.max(Number(stat.validKeys || 0), Number(sum.validKeys || 0), liveKeys.length),
      totalKeys: Math.max(Number(stat.totalKeys || 0), Number(sum.totalKeys || 0), liveKeys.length),
      liveKeys,
      models: collectModels(stat.raw, sum.raw),
      validationFreshness: findFreshness(stat.raw, sum.raw),
      state: states[provider] || {}
    };
  });
  const generatedAt = new Date().toISOString();
  return finalize(rankProviders(providers, preferredProvider), preferredProvider, {
    generatedAt,
    fetchedAt: generatedAt,
    stale: false,
    staleAgeMs: 0,
    staleAfterMs: STALE_AFTER_MS,
    degraded: false,
    source: 'hunter-live'
  });
}

function rankProviders(providers, preferredProvider) {
  const now = Date.now();
  return providers.map((item) => {
    const cooldownUntil = item.state?.cooldownUntil || item.cooldownUntil || null;
    const onCooldown = cooldownUntil ? Date.parse(cooldownUntil) > now : false;
    const failures = Number(item.state?.consecutiveFailures || 0);
    const score = Number((
      (item.validKeys > 0 ? 4 : 0) +
      Number(item.validKeys || 0) * 1.25 +
      Math.min(Number(item.totalKeys || 0) * 0.15, 2) +
      (item.state?.lastSuccessAt ? 0.8 : 0) +
      (preferredProvider && item.provider === preferredProvider ? 1.5 : 0) -
      Math.min(failures * 0.7, 3.5) -
      (onCooldown ? 6 : 0)
    ).toFixed(2));
    return {
      ...item,
      score,
      preferred: !!(preferredProvider && item.provider === preferredProvider),
      onCooldown,
      cooldownUntil,
      status: classifyProviderStatus(item, onCooldown)
    };
  }).sort((a, b) => b.score - a.score || b.validKeys - a.validKeys || a.provider.localeCompare(b.provider));
}


function ageOf(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.max(0, Date.now() - time) : null;
}

function classifyProviderStatus(item, onCooldown) {
  if (onCooldown) return 'cooldown';
  if (Number(item.validKeys || 0) > 0) return 'ready';
  const raw = JSON.stringify([item.state?.lastError, item.state?.reason, item.validationFreshness, item.models]).toLowerCase();
  if (/rate.?limit|429|quota/.test(raw)) return 'rate_limited';
  if (/invalid|unauthori[sz]ed|401|403|authentication|api key/.test(raw)) return 'invalid';
  if (/exhausted|credit|billing|license/.test(raw)) return 'exhausted';
  if (Number(item.totalKeys || 0) > 0) return 'degraded';
  return 'unavailable';
}
function finalize(providers, preferredProvider, metadata) {
  return {
    schema: HUNTER_CAPABILITY_SCHEMA,
    ...metadata,
    preferredProvider: preferredProvider || null,
    activeProvider: providers.find((item) => item.status === 'ready')?.provider || null,
    providers,
    summary: {
      totalProviders: providers.length,
      readyProviders: providers.filter((item) => item.status === 'ready').length,
      cooldownProviders: providers.filter((item) => item.status === 'cooldown').length,
      degradedProviders: providers.filter((item) => ['invalid', 'rate_limited', 'exhausted', 'degraded', 'unavailable'].includes(item.status)).length,
      liveKeys: providers.reduce((sum, item) => sum + Number(item.validKeys || 0), 0)
    }
  };
}

async function getStateMap(env) {
  if (!env.CACHE?.list) return {};
  const result = await env.CACHE.list({ prefix: STATE_PREFIX, limit: 200 });
  const pairs = await Promise.all((result?.keys || []).map(async ({ name }) => {
    const provider = String(name || '').slice(STATE_PREFIX.length);
    return [provider, await getState(env, provider)];
  }));
  return Object.fromEntries(pairs.filter(([provider, state]) => provider && state));
}

async function getState(env, provider) {
  if (!env.CACHE?.get) return {};
  return (await env.CACHE.get(STATE_PREFIX + provider, 'json')) || {};
}

async function putState(env, provider, state) {
  if (env.CACHE?.put) await env.CACHE.put(STATE_PREFIX + provider, JSON.stringify(state));
}

async function readCachedPacket(env) {
  return env.CACHE?.get ? env.CACHE.get(PACKET_KEY, 'json') : null;
}

async function cachePacket(env, packet) {
  if (env.CACHE?.put) {
    await env.CACHE.put(PACKET_KEY, JSON.stringify(packet), { expirationTtl: CACHE_TTL_SECONDS });
  }
}

function indexStats(stats) {
  const map = {};
  for (const entry of Array.isArray(stats) ? stats : []) {
    const provider = normalizeProvider(entry?.provider || entry?.name);
    if (provider) map[provider] = {
      validKeys: Number(entry?.valid_keys ?? entry?.validKeys ?? 0),
      totalKeys: Number(entry?.total_keys ?? entry?.totalKeys ?? 0),
      raw: entry
    };
  }
  return map;
}

function indexSummary(summary) {
  const map = {};
  for (const [name, entry] of Object.entries(summary?.providers || {})) {
    const provider = normalizeProvider(name);
    if (provider) map[provider] = {
      validKeys: Number(entry?.valid_keys ?? entry?.validKeys ?? 0),
      totalKeys: Number(entry?.total_keys ?? entry?.totalKeys ?? 0),
      raw: entry
    };
  }
  return map;
}

function normalizeKeys(validKeys) {
  const map = {};
  for (const [name, keys] of Object.entries(validKeys || {})) {
    const provider = normalizeProvider(name);
    if (provider) map[provider] = Array.isArray(keys) ? keys.filter(Boolean) : [];
  }
  return map;
}

function normalizeProvider(value) {
  const name = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    xai: 'grok', googlegemini: 'gemini', google: 'gemini',
    huggingface: 'hf'
  };
  return aliases[name] || name;
}

function collectModels(...entries) {
  const models = new Set();
  for (const entry of entries) {
    for (const candidate of [entry?.models, entry?.availableModels, entry?.model_inventory]) {
      if (!Array.isArray(candidate)) continue;
      candidate.forEach((model) => models.add(String(model?.id || model?.name || model).trim()));
    }
  }
  return Array.from(models).filter(Boolean).slice(0, 200);
}

function findFreshness(...entries) {
  for (const entry of entries) {
    const value = entry?.last_sync ?? entry?.lastSync ?? entry?.validatedAt ?? entry?.updatedAt;
    if (value) return String(value);
  }
  return null;
}


