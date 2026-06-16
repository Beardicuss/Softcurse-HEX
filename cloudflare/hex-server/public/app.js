const state = {
  bootstrap: null,
  profiles: [],
  selectedProfileId: '',
  continuity: null,
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
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
        <span class="profile-meta">${escapeHtml(profile.language.toUpperCase())} · ${escapeHtml(profile.assistant_mode)}</span>
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

  const browserLine = continuity.browser.open
    ? `${escapeHtml(continuity.browser.title || 'Untitled')} · ${escapeHtml(continuity.browser.url || '--')}`
    : 'No active browser session';

  panel.innerHTML = `
    <div class="metric-row"><span>Profile</span><strong>${escapeHtml(continuity.profile.display_name || '--')}</strong></div>
    <div class="metric-row"><span>Goal</span><strong>${escapeHtml(continuity.session.primaryGoal || 'none')}</strong></div>
    <div class="metric-row"><span>Surface</span><strong>${escapeHtml(continuity.session.activeSurface || 'chat')}</strong></div>
    <div class="metric-row"><span>Browser</span><strong>${browserLine}</strong></div>
    <div class="metric-row"><span>Messages</span><strong>${String(continuity.recentTurns.length)}</strong></div>
    <div class="metric-row"><span>Memories</span><strong>${String(continuity.memories.length)}</strong></div>
    <div class="continuity-block">
      <div class="continuity-label">Recent Turns</div>
      <pre>${escapeHtml(continuity.recentTurns.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`).join('\n\n') || 'No turns yet.')}</pre>
    </div>
  `;
}

function renderMemories() {
  const box = document.getElementById('memory-box');
  if (!box) return;
  const memories = state.continuity?.memories || [];
  if (!memories.length) {
    box.innerHTML = '<div class="empty-state">No indexed memories yet.</div>';
    return;
  }

  box.innerHTML = memories.map((memory) => `
    <article class="memory-chip">
      <span class="memory-kind">${escapeHtml(memory.kind)}</span>
      <strong>${escapeHtml(memory.content)}</strong>
      <small>confidence ${Math.round((memory.confidence || 0) * 100)}%</small>
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
  renderMemories();
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

  status.textContent = 'Creating profile...';
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
  try {
    const health = await fetchJson('/api/health');
    setHealth('ONLINE', health.now);

    const authShell = document.getElementById('auth-shell');
    const layout = document.querySelector('.layout');
    if (!state.token) {
      if (authShell) authShell.style.display = '';
      if (layout) layout.style.display = 'none';
      setText('version-value', 'locked');
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

    await loadProfiles();
    if (state.selectedProfileId) {
      await loadContinuity(state.selectedProfileId);
    } else {
      renderContinuity();
      renderMemories();
    }
  } catch (error) {
    setHealth('OFFLINE', error.message);
    setText('version-value', 'unreachable');
    const status = document.getElementById('token-status');
    if (status && /Unauthorized/i.test(error.message)) {
      status.textContent = 'Invalid token. Try again.';
    }
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
  try {
    await boot();
    status.textContent = 'Authorized.';
  } catch (_) {
    status.textContent = 'Authorization failed.';
  }
}

document.addEventListener('click', async (event) => {
  const card = event.target.closest('[data-profile-id]');
  if (!card) return;
  await loadContinuity(card.dataset.profileId);
});

document.getElementById('profile-create-form')?.addEventListener('submit', createProfile);
document.getElementById('token-form')?.addEventListener('submit', submitToken);

boot();
