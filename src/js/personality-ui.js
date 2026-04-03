'use strict';
// == personality-ui.js == Personality Editor UI ==============================
// Extracted from renderer.js
// Update the topbar badge showing active personality
function updatePersonaBadge() {
  const badge = document.getElementById('active-persona-badge');
  if (badge) badge.textContent = '◆ ' + window.hexPersonalities.getActiveName();
  // Also update active display in tab
  const nameEl = document.getElementById('active-persona-name');
  const descEl = document.getElementById('active-persona-desc');
  const p = window.hexPersonalities.getById(window.hexPersonalities.activeId);
  if (nameEl) nameEl.textContent = p ? p.name : 'HEX — Default';
  if (descEl) descEl.textContent = p ? p.description : '';
}

// Render the full personality list inside the tab
function refreshPersonaList() {
  const container = document.getElementById('persona-list');
  if (!container) return;
  container.innerHTML = '';
  const all = window.hexPersonalities.getAll();
  const activeId = window.hexPersonalities.activeId;

  if (!all.length) {
    container.innerHTML = '<div class="form-hint" style="padding:8px;">No personalities found.</div>';
    return;
  }

  all.forEach(p => {
    const row = document.createElement('div');
    row.className = 'persona-row' + (p.id === activeId ? ' active-persona' : '');

    const activeBtnLabel = p.id === activeId ? '✓ ACTIVE' : 'ACTIVATE';
    const activeBtnCls = p.id === activeId ? 'persona-btn activate is-active' : 'persona-btn activate';
    const badgeCls = p.isBuiltIn ? 'persona-row-badge' : 'persona-row-badge custom';
    const badgeLabel = p.isBuiltIn ? 'BUILT-IN' : 'CUSTOM';

    row.innerHTML =
      '<div class="persona-row-info">' +
      '<span class="persona-row-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="persona-row-desc">' + escapeHtml(p.description || '') + '</span>' +
      '</div>' +
      '<span class="' + badgeCls + '">' + badgeLabel + '</span>' +
      '<button class="' + activeBtnCls + '" onclick="activatePersonality(\'' + p.id + '\')">' + activeBtnLabel + '</button>' +
      (!p.isBuiltIn
        ? '<button class="persona-btn edit-btn" onclick="editPersonality(\'' + p.id + '\')">EDIT</button>'
        + '<button class="persona-btn del-btn" onclick="deletePersonality(\'' + p.id + '\')">✕</button>'
        : '<button class="persona-btn edit-btn" onclick="clonePersonality(\'' + p.id + '\')">CLONE</button>'
        + '<div></div>'
      );
    container.appendChild(row);
  });

  updatePersonaBadge();
}

function activatePersonality(id) {
  window.hexPersonalities.setActive(id);
  refreshPersonaList();
  updatePersonaBadge();
  addLog('HEX', 'Personality activated: ' + window.hexPersonalities.getActiveName());
  // Persist active ID into config
  config.activePersonalityId = id;
  window.hexAPI.setConfig({ activePersonalityId: id });
}

function editPersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p || p.isBuiltIn) return;
  document.getElementById('persona-edit-id').value = p.id;
  document.getElementById('persona-name').value = p.name;
  document.getElementById('persona-desc').value = p.description || '';
  document.getElementById('persona-prompt').value = p.prompt;
}

function clonePersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p) return;
  document.getElementById('persona-edit-id').value = ''; // blank = create new
  document.getElementById('persona-name').value = p.name + ' (copy)';
  document.getElementById('persona-desc').value = p.description || '';
  document.getElementById('persona-prompt').value = p.prompt;
}

function deletePersonality(id) {
  const p = window.hexPersonalities.getById(id);
  if (!p || p.isBuiltIn) return;
  if (!confirm('Delete personality "' + p.name + '"? This cannot be undone.')) return;
  window.hexPersonalities.delete(id);
  refreshPersonaList();
  persistPersonalities();
  addLog('HEX', 'Personality deleted: ' + p.name);
}

function savePersonality() {
  const id = document.getElementById('persona-edit-id').value.trim();
  const name = document.getElementById('persona-name').value.trim();
  const desc = document.getElementById('persona-desc').value.trim();
  const prompt = document.getElementById('persona-prompt').value.trim();

  if (!name) { showToast('◆ VALIDATION', 'Name is required.', 'alert', 3000); return; }
  if (!prompt) { showToast('◆ VALIDATION', 'System prompt is required.', 'alert', 3000); return; }

  const entry = window.hexPersonalities.upsert({ id: id || null, name, description: desc, prompt });
  clearPersonaForm();
  refreshPersonaList();
  persistPersonalities();
  showToast('◆ PERSONALITY SAVED', '"' + entry.name + '" saved.', '', 3000);
  addLog('HEX', 'Personality saved: ' + entry.name);
}

function clearPersonaForm() {
  document.getElementById('persona-edit-id').value = '';
  document.getElementById('persona-name').value = '';
  document.getElementById('persona-desc').value = '';
  document.getElementById('persona-prompt').value = '';
}

function persistPersonalities() {
  const pcfg = window.hexPersonalities.toConfig();
  config = { ...config, ...pcfg };
  window.hexAPI.setConfig(pcfg);
}
