'use strict';
// == memory-ui.js == Memory Tab UI ===========================================
// Extracted from renderer.js
function refreshMemoryTab() {
  const stats = window.hexMemory.getStats();
  const $ = function (id) { return document.getElementById(id); };
  if ($('mem-stat-facts')) $('mem-stat-facts').textContent = stats.facts;
  if ($('mem-stat-turns')) $('mem-stat-turns').textContent = stats.turns;
  if ($('mem-stat-sessions')) $('mem-stat-sessions').textContent = stats.sessions || 0;
  if ($('mem-stat-oldest')) $('mem-stat-oldest').textContent = stats.oldestTurn || 'None';

  // Tier bar
  const t = stats.tierCounts || {};
  if ($('mem-tier-0')) { $('mem-tier-0').textContent = t.protected || 0; $('mem-tier-1').textContent = t.high || 0; $('mem-tier-2').textContent = t.active || 0; $('mem-tier-3').textContent = t.weak || 0; }

  // Working memory
  const wm = stats.workingMemory;
  const wmEl = $('mem-working');
  if (wmEl && wm) {
    const lines = [];
    if (wm.currentTask) lines.push('Task:  ' + wm.currentTask);
    if (wm.mood && wm.mood !== 'neutral') lines.push('Mood:  ' + wm.mood);
    if (wm.currentEntities && wm.currentEntities.length) lines.push('Focus: ' + wm.currentEntities.join(', '));
    if (wm.hypotheses && wm.hypotheses.length) lines.push('Hyp:   ' + wm.hypotheses[0].belief);
    wmEl.textContent = lines.length ? lines.join('\n') : 'No active session context.';
  }

  filterMemoryFacts('');
}

function filterMemoryFacts(query) {
  const listEl = document.getElementById('facts-list');
  if (!listEl) return;
  const typeFilter = (document.getElementById('mem-type-filter') || {}).value || '';
  const q = (query || '').toLowerCase().trim();
  const TIER_COLORS = ['#00ffc8', '#0088ff', '#ff6b35', 'rgba(255,255,255,0.25)'];

  const facts = window.hexMemory.facts || [];
  const filtered = facts.filter(function (f) {
    if (typeFilter && f.type !== typeFilter) return false;
    if (q && !((f.content || '').toLowerCase().includes(q) || (f.type || '').includes(q))) return false;
    return true;
  });

  const hint = document.getElementById('mem-filter-hint');
  if (hint) hint.textContent = filtered.length + '/' + facts.length;

  if (!filtered.length) {
    listEl.innerHTML = '<div class="form-hint" style="padding:8px;">' + (facts.length ? 'No facts match filter.' : 'No facts yet. Chat with HEX — learning happens automatically.') + '</div>';
    return;
  }
  listEl.innerHTML = '';
  filtered.forEach(function (f) {
    const tier = typeof f.tier === 'number' ? f.tier : 3;
    const conf = Math.round((f.confidence || 0) * 100);
    const ageDays = f.created_at ? Math.floor((Date.now() - f.created_at) / 86400000) : 0;
    const ageStr = ageDays < 1 ? 'today' : ageDays + 'd';
    const implicitMark = f.implicit ? ' ~' : '';
    const row = document.createElement('div');
    row.className = 'fact-row';
    row.style.borderLeft = '3px solid ' + TIER_COLORS[tier];
    row.style.paddingLeft = '8px';
    row.innerHTML =
      '<span class="fact-cat">' + (f.type || f.category || 'general') + '</span>' +
      '<span class="fact-text">' + escapeHtml((f.content || '').substring(0, 140)) + '</span>' +
      '<span style="font-size:13px;opacity:0.4;white-space:nowrap;margin:0 4px;">' + conf + '%' + implicitMark + ' ' + ageStr + '</span>' +
      '<button class="fact-del" onclick="deleteMemoryFact(' + f.id + ')">✕</button>';
    listEl.appendChild(row);
  });
}

function deleteMemoryFact(id) {
  window.hexMemory.removeFact(id);
  filterMemoryFacts((document.getElementById('mem-search') || {}).value || '');
}

function deleteFact(id) { deleteMemoryFact(id); }  // legacy alias

async function compressSession() {
  showToast('◆ MEMORY', 'Compressing session...', '', 3000);
  try {
    const ep = await window.hexMemory.compressCurrentSession();
    if (ep) {
      showToast('◆ MEMORY', 'Session compressed. Topics: ' + (ep.topics || []).join(', '), '', 5000);
      addLog('HEX', 'Session compressed: ' + (ep.topics || []).join(', '));
      refreshMemoryTab();
    } else {
      showToast('◆ MEMORY', 'Need more conversation or AI configured to compress.', 'warn', 4000);
    }
  } catch (e) {
    showToast('◆ MEMORY', 'Compress error: ' + e.message, 'alert', 4000);
  }
}

function showMemoryReport() {
  const report = window.hexMemory.getHealthReport();
  const el = document.getElementById('mem-report');
  if (el) {
    el.textContent = report;
    el.style.display = (el.style.display === 'none' || !el.style.display) ? '' : 'none';
  }
}

async function clearMemoryFacts() {
  if (!confirm('Clear all learned facts? HEX will lose knowledge about you but keep conversation history.')) return;
  window.hexMemory.clearFacts();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY', 'Facts cleared.', 'warn', 3000);
  addLog('HEX', 'Memory facts cleared.');
}

async function clearMemoryHistory() {
  if (!confirm('Clear all conversation history? HEX will not remember past conversations.')) return;
  window.hexMemory.clearHistory();
  window.hexAI.clearHistory();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY', 'Conversation history cleared.', 'warn', 3000);
  addLog('HEX', 'Conversation history cleared.');
}

async function clearAllMemory() {
  if (!confirm('WIPE ALL MEMORY? HEX will forget everything — facts, history, and summaries. This cannot be undone.')) return;
  window.hexMemory.clearAll();
  window.hexAI.clearHistory();
  await window.hexAPI.clearMemory();
  await window.hexMemory.forceSave();
  refreshMemoryTab();
  showToast('◆ MEMORY WIPED', 'All memory erased. HEX starts fresh.', 'alert', 5000);
  addLog('HEX', 'All memory wiped.');
}
