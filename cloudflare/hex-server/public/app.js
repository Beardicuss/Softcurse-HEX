const state = {
  bootstrap: null,
  profiles: [],
  selectedProfileId: '',
  continuity: null,
  contextPacket: null,
  hunterCapabilities: null,
  hunterError: '',
  token: localStorage.getItem('hexServerToken') || '',
};

function setHealth(status, detail) {
  const pill = document.getElementById('health-pill');
  if (!pill) return;
  pill.textContent = status;
  pill.dataset.status = status.toLowerCase();
  if (detail) pill.title = detail;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactText(value, fallback = '--') {
  const text = String(value || '').trim();
  return text || fallback;
}

function formatAge(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return '--';
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.round(n / 60)}m`;
  return `${Math.round(n / 3600)}h`;
}

async function fetchJson(url, options) {
  const headers = {
    ...(options?.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...(options || {}), headers });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `${response.status} ${response.statusText}`);
  }
  return payload;
}

function renderProfiles() {
  const list = document.getElementById('profiles-list');
  if (!list) return;

  if (!state.profiles.length) {
    list.innerHTML = '<div class="empty-state">No profiles yet. Create one below.</div>';
    return;
  }

  list.innerHTML = state.profiles.map((profile) => {
    const active = profile.id === state.selectedProfileId ? 'profile-card active' : 'profile-card';
    return `
      <button class="${active}" data-profile-id="${escapeHtml(profile.id)}" type="button">
        <span class="profile-name">${escapeHtml(profile.display_name)}</span>
        <span class="profile-meta">${escapeHtml(String(profile.language || '').toUpperCase())} · ${escapeHtml(profile.assistant_mode)}</span>
      </button>
    `;
  }).join('');
}

function renderContinuity() {
  const panel = document.getElementById('continuity-box');
  if (!panel) return;

  const continuity = state.continuity;
  if (!continuity) {
    panel.innerHTML = '<div class="empty-state">Select a profile to inspect its active continuity packet.</div>';
    return;
  }

  const browserLine = continuity.browser?.open
    ? `${escapeHtml(continuity.browser.title || 'Untitled')} · ${escapeHtml(continuity.browser.url || '--')}`
    : 'No active browser session';

  panel.innerHTML = `
    <div class="metric-row"><span>Profile</span><strong>${escapeHtml(continuity.profile?.display_name || '--')}</strong></div>
    <div class="metric-row"><span>Goal</span><strong>${escapeHtml(continuity.session?.primaryGoal || 'none')}</strong></div>
    <div class="metric-row"><span>Surface</span><strong>${escapeHtml(continuity.session?.activeSurface || 'chat')}</strong></div>
    <div class="metric-row"><span>Browser</span><strong>${browserLine}</strong></div>
    <div class="metric-row"><span>Messages</span><strong>${String((continuity.recentTurns || []).length)}</strong></div>
    <div class="metric-row"><span>Memories</span><strong>${String((continuity.memories || []).length)}</strong></div>
    <div class="continuity-block">
      <div class="continuity-label">Recent Turns</div>
      <pre>${escapeHtml((continuity.recentTurns || []).map((turn) => `${String(turn.role || '').toUpperCase()}: ${turn.content}`).join('\n\n') || 'No turns yet.')}</pre>
    </div>
  `;
}

function renderContextPacket() {
  const overview = document.getElementById('context-overview');
  const freshness = document.getElementById('freshness-grid');
  const refs = document.getElementById('priority-references');
  const actions = document.getElementById('action-timeline');
  const reasons = document.getElementById('retrieval-reasons');
  if (!overview || !freshness || !refs || !actions || !reasons) return;

  const packet = state.contextPacket;
  if (!packet) {
    overview.innerHTML = '<div class="empty-state">No context packet loaded yet.</div>';
    freshness.innerHTML = '';
    refs.innerHTML = '';
    actions.innerHTML = '';
    reasons.innerHTML = '';
    return;
  }

  const contextUse = packet.retrieval?.contextUse || {};
  overview.innerHTML = `
    <div class="metric-row"><span>Schema</span><strong>${escapeHtml(packet.schema)}</strong></div>
    <div class="metric-row"><span>Query</span><strong>${escapeHtml(packet.query || '--')}</strong></div>
    <div class="metric-row"><span>Active Context</span><strong>${escapeHtml((contextUse.active || []).join(', ') || '--')}</strong></div>
    <div class="metric-row"><span>Background</span><strong>${escapeHtml((contextUse.background || []).join(', ') || 'none')}</strong></div>
    <p class="system-guidance">${escapeHtml(contextUse.guidance || 'No guidance generated yet.')}</p>
  `;

  const tiers = packet.continuityState?.freshnessTiers || {};
  const ages = packet.continuityState?.freshness || {};
  const ageByKey = {
    session: ages.sessionSeconds ?? ages.lastTurnSeconds,
    browser: ages.lastTurnSeconds ?? ages.sessionSeconds,
    inventory: ages.inventorySeconds,
    action: ages.lastActionSeconds ?? ages.lastTurnSeconds
  };
  freshness.innerHTML = ['session', 'browser', 'inventory', 'action'].map((key) => `
    <article class="freshness-card" data-tier="${escapeHtml(tiers[key] || 'unknown')}">
      <span>${escapeHtml(key)}</span>
      <strong>${escapeHtml(tiers[key] || 'unknown')}</strong>
      <small>${escapeHtml(formatAge(ageByKey[key]))}</small>
    </article>
  `).join('');

  const priority = packet.references?.priority || [];
  refs.innerHTML = priority.length ? priority.map((item) => `
    <article class="reference-card">
      <span>${escapeHtml(item.kind || item.source || 'reference')}</span>
      <strong>${escapeHtml(item.label || item.value || item.text || '--')}</strong>
      <small>${escapeHtml(item.retrievalReason || item.reason || 'selected by context priority')}</small>
    </article>
  `).join('') : '<div class="empty-state">No priority references selected.</div>';

  const timeline = packet.actionTimeline || [];
  actions.innerHTML = timeline.length ? timeline.map((item) => `
    <article class="timeline-card" data-status="${escapeHtml(item.status || 'unknown')}">
      <span>${escapeHtml(item.surface || 'chat')} · ${escapeHtml(item.status || 'unknown')}</span>
      <strong>${escapeHtml(item.text || item.actionType || item.kind || '--')}</strong>
      <small>${escapeHtml(item.at || '')}</small>
    </article>
  `).join('') : '<div class="empty-state">No action events yet.</div>';

  const reasonItems = [
    ...(packet.retrieval?.reasons?.memories || []).map((item) => ({ label: item.kind || item.id, reason: item.reason })),
    ...(packet.retrieval?.reasons?.turns || []).map((item) => ({ label: item.role || item.id, reason: item.reason })),
    ...(packet.retrieval?.reasons?.actions || []).map((item) => ({ label: item.actionType || item.kind, reason: item.reason }))
  ].slice(0, 12);
  reasons.innerHTML = reasonItems.length ? reasonItems.map((item) => `
    <div class="reason-row"><span>${escapeHtml(item.label || 'reason')}</span><strong>${escapeHtml(item.reason || '--')}</strong></div>
  `).join('') : '<div class="empty-state">No retrieval reasons available.</div>';
}

function renderInventory() {
  const box = document.getElementById('inventory-box');
  if (!box) return;
  const desktop = state.contextPacket?.desktopContext || {};
  const buckets = desktop.desktopByCategory || state.contextPacket?.references?.desktopByCategory || {};
  const entries = Object.entries(buckets).filter(([, values]) => Array.isArray(values) && values.length);
  if (!entries.length) {
    box.innerHTML = '<div class="empty-state">No device inventory has reached the server yet.</div>';
    return;
  }
  box.innerHTML = entries.map(([name, values]) => `
    <article class="inventory-card">
      <span>${escapeHtml(name)}</span>
      <strong>${values.length}</strong>
      <small>${escapeHtml(values.slice(0, 4).map((item) => item.label || item.value || item.text || item).join(' · '))}</small>
    </article>
  `).join('');
}

function renderHunterCapabilities() {
  const box = document.getElementById('hunter-box');
  if (!box) return;
  if (state.hunterError) {
    box.innerHTML = `<div class="empty-state warning">Hunter bridge degraded: ${escapeHtml(state.hunterError)}</div>`;
    return;
  }
  const packet = state.hunterCapabilities;
  if (!packet) {
    box.innerHTML = '<div class="empty-state">Hunter capability packet not loaded yet.</div>';
    return;
  }
  const providers = packet.providers || [];
  box.innerHTML = `
    <div class="metric-row"><span>Status</span><strong>${escapeHtml(packet.status || 'unknown')}</strong></div>
    <div class="metric-row"><span>Ready Providers</span><strong>${providers.filter((p) => p.ready).length}/${providers.length}</strong></div>
    <div class="provider-grid">
      ${providers.slice(0, 12).map((provider) => `
        <article class="provider-card" data-ready="${provider.ready ? 'true' : 'false'}">
          <span>${escapeHtml(provider.provider || provider.name || '--')}</span>
          <strong>${escapeHtml(provider.ready ? 'READY' : (provider.status || 'DEGRADED'))}</strong>
          <small>${escapeHtml((provider.models || []).slice(0, 3).join(' · ') || `${provider.validKeys || provider.keyCount || 0} usable keys`)}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function renderMemories() {
  const box = document.getElementById('memory-box');
  if (!box) return;
  const memories = state.contextPacket?.relevantMemories || state.continuity?.memories || [];
  if (!memories.length) {
    box.innerHTML = '<div class="empty-state">No indexed memories selected for the current packet.</div>';
    return;
  }

  box.innerHTML = memories.map((memory) => `
    <article class="memory-chip">
      <span class="memory-kind">${escapeHtml(memory.kind)}</span>
      <strong>${escapeHtml(memory.content)}</strong>
      <small>${escapeHtml(memory.retrievalReason || `confidence ${Math.round((memory.confidence || 0) * 100)}%`)}</small>
    </article>
  `).join('');
}

async function loadProfiles() {
  const payload = await fetchJson('/api/profiles');
  state.profiles = payload.profiles || [];
  if (!state.selectedProfileId && state.profiles[0]) {
    state.selectedProfileId = state.profiles[0].id;
  }
  renderProfiles();
}

async function loadContinuity(profileId) {
  if (!profileId) return;
  state.selectedProfileId = profileId;
  renderProfiles();
  const payload = await fetchJson(`/api/profiles/${encodeURIComponent(profileId)}/continuity`);
  state.continuity = payload.continuity || null;
  renderContinuity();
  await loadContextPacket('server dashboard refresh');
}

async function loadContextPacket(query = 'server dashboard refresh') {
  if (!state.selectedProfileId) {
    state.contextPacket = null;
    renderContextPacket();
    renderInventory();
    renderMemories();
    return;
  }
  const payload = await fetchJson('/api/context-packet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: state.selectedProfileId, query, requestedSurface: 'dashboard' })
  });
  state.contextPacket = payload.packet || null;
  renderContextPacket();
  renderInventory();
  renderMemories();
}

async function loadHunterCapabilities() {
  const box = document.getElementById('hunter-box');
  if (box) box.innerHTML = '<div class="empty-state">Loading Hunter capability packet...</div>';
  try {
    const payload = await fetchJson('/api/hunter/capabilities');
    state.hunterCapabilities = payload.capabilities || null;
    state.hunterError = '';
  } catch (error) {
    state.hunterCapabilities = null;
    state.hunterError = String(error?.message || 'unknown error');
  }
  renderHunterCapabilities();
}

async function createProfile(event) {
  event.preventDefault();
  const nameInput = document.getElementById('profile-name');
  const languageInput = document.getElementById('profile-language');
  const modeInput = document.getElementById('profile-mode');
  const status = document.getElementById('profile-create-status');
  if (!nameInput || !languageInput || !modeInput || !status) return;

  const displayName = nameInput.value.trim();
  if (!displayName) {
    status.textContent = 'Profile name is required.';
    return;
  }

  status.textContent = 'Resolving profile...';
  try {
    const payload = await fetchJson('/api/profiles/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        language: languageInput.value,
        assistantMode: modeInput.value,
      })
    });
    status.textContent = payload.created ? 'Profile created.' : 'Existing profile reused.';
    nameInput.value = '';
    await loadProfiles();
    if (payload.profile?.id) {
      await loadContinuity(payload.profile.id);
    }
  } catch (error) {
    status.textContent = error.message;
  }
}

async function boot() {
  const authShell = document.getElementById('auth-shell');
  const layout = document.querySelector('.layout');
  const status = document.getElementById('token-status');
  try {
    const health = await fetchJson('/api/health');
    setHealth('ONLINE', health.now);

    if (!state.token) {
      if (authShell) authShell.style.display = '';
      if (layout) layout.style.display = 'none';
      setText('version-value', 'token required');
      if (status) status.textContent = 'Server is online. Enter your access token to unlock data.';
      return;
    }
    if (authShell) authShell.style.display = 'none';
    if (layout) layout.style.display = 'grid';

    const bootstrap = await fetchJson('/api/bootstrap');
    state.bootstrap = bootstrap;
    setText('version-value', bootstrap.app.version);
    setText('profiles-state', bootstrap.metrics?.profiles ?? '--');
    setText('sessions-state', bootstrap.metrics?.sessions ?? '--');
    setText('messages-state', bootstrap.metrics?.messages ?? '--');
    setText('memory-state', bootstrap.metrics?.memories ?? '--');

    await Promise.all([loadProfiles(), loadHunterCapabilities()]);
    if (state.selectedProfileId) {
      await loadContinuity(state.selectedProfileId);
    } else {
      renderContinuity();
      renderContextPacket();
      renderInventory();
      renderMemories();
    }
  } catch (error) {
    const message = String(error?.message || 'Unknown error');
    if (/Unauthorized/i.test(message)) {
      setHealth('LOCKED', message);
      if (authShell) authShell.style.display = '';
      if (layout) layout.style.display = 'none';
      setText('version-value', 'auth required');
      if (status) status.textContent = 'Invalid or missing token. The server is reachable but locked.';
      return;
    }

    setHealth('OFFLINE', message);
    setText('version-value', 'unreachable');
    if (status) status.textContent = 'Could not reach HEX server.';
    console.error(error);
  }
}

async function submitToken(event) {
  event.preventDefault();
  const input = document.getElementById('token-input');
  const status = document.getElementById('token-status');
  if (!input || !status) return;
  state.token = input.value.trim();
  localStorage.setItem('hexServerToken', state.token);
  status.textContent = 'Checking token...';
  await boot();
  status.textContent = 'Authorized.';
}

function getSelectedContextQuery() {
  return document.querySelector('.scenario-chip.active')?.dataset.contextQuery || 'dashboard refresh';
}

document.addEventListener('click', async (event) => {
  const card = event.target.closest('[data-profile-id]');
  if (card) {
    await loadContinuity(card.dataset.profileId);
    return;
  }
  const scenario = event.target.closest('[data-context-query]');
  if (scenario) {
    document.querySelectorAll('.scenario-chip').forEach((item) => item.classList.remove('active'));
    scenario.classList.add('active');
    await loadContextPacket(scenario.dataset.contextQuery || 'dashboard refresh');
    return;
  }
  if (event.target.closest('#refresh-context')) {
    await loadContextPacket(getSelectedContextQuery());
    return;
  }
  if (event.target.closest('#refresh-hunter')) {
    await loadHunterCapabilities();
  }
});

document.getElementById('profile-create-form')?.addEventListener('submit', createProfile);
document.getElementById('token-form')?.addEventListener('submit', submitToken);

boot();
