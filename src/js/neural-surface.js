'use strict';
// ═══════════════════════════════════════════════════════════════
// neural-surface.js — Live Neural Modules + Field Intel Engine
// Powers the hex grid, coherence ring, trait bars, insights,
// memory feed, quick actions, vitals, and session stats.
// ═══════════════════════════════════════════════════════════════

function nsT(key, vars = {}) {
    return window.i18n?.t ? window.i18n.t(key, vars) : key;
}

const _ns = {
    startTime: Date.now(),
    commandCount: 0,
    actionCount: 0,
    lastVitals: { cpu: 0, ram: 0, disk: 0 },
};

// ── Module Grid Updates ───────────────────────────────────────
function nsUpdateModules() {
    const config = window._hexConfig || {};

    // Memory module
    const memCell = document.getElementById('hex-memory');
    const memVal = document.getElementById('hex-val-memory');
    if (memCell && memVal) {
        try {
            const brain = window.hexBrain;
            if (brain && brain.profile) {
                const factCount = Object.keys(brain.profile.user || {}).length +
                    (brain.profile.preferences?.favoriteApps?.length || 0) +
                    (brain.profile.insights?.length || 0) +
                    (brain.profile.sessionHistory?.length || 0);
                memVal.textContent = nsT('memory_facts_count', { count: factCount });
                memCell.classList.add('active');
                memCell.classList.remove('offline');
            } else {
                memVal.textContent = nsT('status_init');
                memCell.classList.remove('active');
            }
        } catch (_) { memVal.textContent = '—'; }
    }

    // Voice module
    const voiceCell = document.getElementById('hex-voice');
    const voiceVal = document.getElementById('hex-val-voice');
    if (voiceCell && voiceVal) {
        const voice = window.hexVoice;
        if (voice && (voice._localSTT || voice._localTTS)) {
            voiceVal.textContent = nsT('status_ready');
            voiceCell.classList.add('active');
            voiceCell.classList.remove('offline');
        } else if (config.voice?.ttsProvider && config.voice.ttsProvider !== 'none') {
            voiceVal.textContent = nsT('status_cloud');
            voiceCell.classList.add('active');
            voiceCell.classList.remove('offline');
        } else {
            voiceVal.textContent = nsT('status_off');
            voiceCell.classList.add('offline');
            voiceCell.classList.remove('active');
        }
    }

    // Security module
    const secCell = document.getElementById('hex-security');
    const secVal = document.getElementById('hex-val-security');
    if (secCell && secVal) {
        const threats = parseInt(document.getElementById('stat-threats')?.textContent || '0') || 0;
        if (threats > 0) {
            secVal.textContent = nsT('security_found_count', { count: threats });
            secCell.classList.add('alert');
            secCell.classList.remove('active', 'offline');
        } else {
            secVal.textContent = nsT('status_clear');
            secCell.classList.add('active');
            secCell.classList.remove('alert', 'offline');
        }
    }

    // Browser module
    const browCell = document.getElementById('hex-browser');
    const browVal = document.getElementById('hex-val-browser');
    if (browCell && browVal) {
        const engine = window.hexBrowser?.defaultEngine || config.browser?.searchEngine || 'google';
        browVal.textContent = engine.toUpperCase();
        browCell.classList.add('active');
        browCell.classList.remove('offline');
    }

    // Plugins module
    const plugCell = document.getElementById('hex-plugins');
    const plugVal = document.getElementById('hex-val-plugins');
    if (plugCell && plugVal) {
        try {
            window.hexAPI.plugins.list().then(res => {
                const list = res.plugins || [];
                const count = Array.isArray(list) ? list.length : 0;
                plugVal.textContent = nsT('plugins_loaded_count', { count });
                if (count > 0) { plugCell.classList.add('active'); plugCell.classList.remove('offline'); }
                else { plugCell.classList.add('offline'); plugCell.classList.remove('active'); }
            }).catch(() => { plugVal.textContent = '0'; });
        } catch (_) { plugVal.textContent = '0'; }
    }

    // System module
    const sysCell = document.getElementById('hex-system');
    const sysVal = document.getElementById('hex-val-system');
    if (sysCell && sysVal) {
        const cpu = _ns.lastVitals.cpu;
        const ram = _ns.lastVitals.ram;
        const disk = _ns.lastVitals.disk;
        if (cpu > 90 || ram > 90 || disk > 95) {
            sysVal.textContent = nsT('status_warn');
            sysCell.classList.add('alert');
            sysCell.classList.remove('active', 'offline');
        } else {
            sysVal.textContent = nsT('status_ok');
            sysCell.classList.add('active');
            sysCell.classList.remove('alert', 'offline');
        }
    }
}

// ── Quick Actions (Context-Aware) ─────────────────────────────
function nsUpdateQuickActions() {
    const container = document.getElementById('quick-actions');
    if (!container) return;

    const actions = [];
    const cpu = _ns.lastVitals.cpu;
    const ram = _ns.lastVitals.ram;
    const disk = _ns.lastVitals.disk;

    // Urgent context-aware actions
    if (disk > 85) actions.push({ icon: '⚠', text: nsT('qa_disk_cleanup', { disk }), task: 'disk_cleanup', urgent: true });
    if (ram > 90) actions.push({ icon: '⚠', text: nsT('qa_kill_processes', { ram }), fn: 'openProcesses', urgent: true });
    if (cpu > 90) actions.push({ icon: '⚠', text: nsT('qa_view_processes', { cpu }), fn: 'openProcesses', urgent: true });

    // Always available
    actions.push({ icon: '🕷', text: nsT('qa_credential_hunter'), task: 'hunter_scan' });
    actions.push({ icon: '🛡', text: nsT('qa_defender_scan'), task: 'defender_scan' });
    actions.push({ icon: '🔄', text: nsT('qa_check_updates'), task: 'update_check' });
    actions.push({ icon: '🧹', text: nsT('qa_browser_cache'), task: 'browser_cache' });
    actions.push({ icon: '🧪', text: nsT('qa_network_test'), task: 'network_diag' });
    actions.push({ icon: '🖥', text: nsT('qa_process_monitor'), fn: 'openProcesses' });
    actions.push({ icon: '💾', text: nsT('qa_defragmentation'), task: 'defrag' });
    actions.push({ icon: '🔥', text: nsT('qa_firewall_status'), task: 'firewall_status' });
    actions.push({ icon: '🧠', text: nsT('qa_memory_diagnostics'), task: 'memory_diag' });

    // Render top 6
    // Render top 8
    const top = actions.slice(0, 8);
    window.hexRenderUtils.clearNode(container);
    top.forEach((action) => {
        const row = window.hexRenderUtils.createEl('div', {
            className: action.urgent ? 'qa-row urgent' : 'qa-row',
            dataset: { qaTask: action.task, qaFn: action.fn }
        });
        row.appendChild(window.hexRenderUtils.createEl('span', { className: 'qa-icon', text: action.icon }));
        row.appendChild(window.hexRenderUtils.createEl('span', { className: 'qa-text', text: action.text }));
        container.appendChild(row);
    });
}

// ── Background Daemons ─────────────────────────────────────────
function nsUpdateDaemons() {
    // Replaces the old Vitals strip with smart daemon tracking
    const config = window._hexConfig || {};

    // 1. Credential Hunter
    if (window.hexAPI && typeof window.hexAPI.getHunterStatus === 'function') {
        window.hexAPI.getHunterStatus().then(status => {
            const dHunter = document.getElementById('daemon-hunter');
            if (!dHunter) return;

            const { delayMs, userLimitMinutes } = status || {};
            // If completely disabled or limit is huge but zero logically? The app enforces 1440 if disabled but user might turn off with a specific setting.
            // If the user's config doesn't have it enabled, this should show OFF. But let's assume it's running if limit > 0

            if (delayMs > 0) {
                let totalSec = Math.floor(delayMs / 1000);
                let h = Math.floor(totalSec / 3600);
                let m = Math.floor((totalSec % 3600) / 60);
                let s = totalSec % 60;

                let timeStr = '';
                if (h > 0) timeStr += `${h}h `;
                if (m > 0 || h > 0) timeStr += `${m}m `;
                timeStr += `${s}s`;

                dHunter.textContent = timeStr.trim();
                dHunter.className = 'daemon-val local';
            } else {
                dHunter.textContent = nsT('status_active');
                dHunter.className = 'daemon-val active';
            }
        });
    }

    // 2. Desktop Vision
    const dVision = document.getElementById('daemon-vision');
    if (dVision) {
        if (window.visionEnabled) {
            dVision.textContent = nsT('status_active');
            dVision.className = 'daemon-val active';
        } else {
            dVision.textContent = nsT('status_off');
            dVision.className = 'daemon-val offline';
        }
    }

    // 3. Local LLM / Cloud
    const dLLM = document.getElementById('daemon-llm');
    if (dLLM) {
        const isCloud = config.llm?.provider !== 'ollama' && config.llm?.provider !== 'none';
        if (isCloud) {
            dLLM.textContent = nsT('status_cloud');
            dLLM.className = 'daemon-val cloud';
        } else if (config.llm?.provider === 'ollama') {
            dLLM.textContent = nsT('status_local');
            dLLM.className = 'daemon-val local';
        } else {
            dLLM.textContent = nsT('status_off');
            dLLM.className = 'daemon-val offline';
        }
    }
}

// ── Coherence Ring ────────────────────────────────────────────
function nsUpdateCoherence() {
    const arc = document.getElementById('coherence-arc');
    const valEl = document.getElementById('coherence-val');
    if (!arc || !valEl) return;

    // Coherence = weighted score from multiple signals
    let score = 20; // baseline

    // Memory depth
    try {
        const brain = window.hexBrain;
        if (brain && brain.profile) {
            const insightCount = brain.profile.insights?.length || 0;
            const sessionCount = brain.profile.sessionHistory?.length || 0;
            score += Math.min(insightCount * 3, 20);
            score += Math.min(sessionCount * 2, 15);
            score += brain.profile.dayNumber ? Math.min(brain.profile.dayNumber, 10) : 0;
        }
    } catch (_) { }

    // Session activity
    score += Math.min(_ns.commandCount * 2, 20);

    // System health bonus
    const { cpu, ram, disk } = _ns.lastVitals;
    if (cpu < 50 && ram < 70 && disk < 80) score += 10;
    else if (cpu > 90 || ram > 90) score -= 10;

    // Voice active bonus
    if (window.hexVoice && (window.hexVoice._localSTT || window.hexVoice._localTTS)) score += 5;

    score = Math.max(0, Math.min(100, score));

    // Animate ring
    const circumference = 327; // 2 * π * 52
    const offset = circumference - (score / 100) * circumference;
    arc.style.strokeDashoffset = offset;
    valEl.textContent = score;

    // Color shift based on score
    if (score >= 80) arc.style.stroke = '#00ffc8';
    else if (score >= 50) arc.style.stroke = '#0088ff';
    else if (score >= 30) arc.style.stroke = '#ff9500';
    else arc.style.stroke = '#ff44aa';
}

// ── Personality + Trait Bars ──────────────────────────────────
function nsUpdatePersonality() {
    const nameEl = document.getElementById('psyche-persona-name');
    if (!nameEl) return;

    try {
        const name = window.hexPersonalities?.getActiveName?.() || 'DEFAULT';
        nameEl.textContent = name.toUpperCase();
    } catch (_) {
        nameEl.textContent = 'DEFAULT';
    }

    // Trait mapping based on active personality characteristics
    const id = window.hexPersonalities?.activeId || 'hex_default';

    // Different personalities emphasize different traits
    const traitMap = {
        'hex_default': { focus: 60, empathy: 50, precision: 55 },
        'hex_sarcastic': { focus: 70, empathy: 30, precision: 80 },
        'hex_friendly': { focus: 40, empathy: 85, precision: 45 },
        'hex_formal': { focus: 75, empathy: 40, precision: 90 },
        'hex_creative': { focus: 50, empathy: 65, precision: 35 },
    };
    const traits = traitMap[id] || { focus: 50, empathy: 50, precision: 50 };

    // Boost focus based on session activity
    traits.focus = Math.min(100, traits.focus + Math.min(_ns.commandCount, 20));

    const focusBar = document.getElementById('trait-focus');
    const emBar = document.getElementById('trait-empathy');
    const precBar = document.getElementById('trait-precision');
    if (focusBar) focusBar.style.width = `${traits.focus}%`;
    if (emBar) emBar.style.width = `${traits.empathy}%`;
    if (precBar) precBar.style.width = `${traits.precision}%`;
}

// ── Proactive Insights ────────────────────────────────────────
function nsUpdateInsights() {
    const feed = document.getElementById('insight-feed');
    if (!feed) return;

    const insights = [];
    const { cpu, ram, disk } = _ns.lastVitals;

    // System state insights
    if (disk > 90) insights.push({ icon: '🔴', text: nsT('insight_disk_critical', { disk }), cls: 'critical' });
    else if (disk > 75) insights.push({ icon: '🟡', text: nsT('insight_disk_warn', { disk }), cls: 'warn' });
    else insights.push({ icon: '🟢', text: nsT('insight_disk_good', { disk }), cls: 'good' });

    if (ram > 85) insights.push({ icon: '🟡', text: nsT('insight_ram_warn', { ram }), cls: 'warn' });
    if (cpu > 85) insights.push({ icon: '🟡', text: nsT('insight_cpu_warn', { cpu }), cls: 'warn' });

    // Brain insights
    try {
        const brain = window.hexBrain;
        if (brain && brain.profile) {
            const factCount = (brain.profile.insights?.length || 0) +
                (brain.profile.preferences?.favoriteApps?.length || 0);
            insights.push({ icon: '🧠', text: nsT('insight_observations_stored', { count: factCount }), cls: '' });

            const lastSession = brain.profile.sessionHistory?.[brain.profile.sessionHistory.length - 1];
            if (lastSession?.summary) {
                insights.push({ icon: '📝', text: nsT('insight_last_session', { summary: lastSession.summary.substring(0, 60) }), cls: '' });
            }

            if (brain.profile.dayNumber) {
                insights.push({ icon: '📅', text: nsT('insight_hex_age', { day: brain.profile.dayNumber }), cls: '' });
            }
        }
    } catch (_) { }

    // Session insights
    if (_ns.commandCount > 0) {
        insights.push({ icon: '⚡', text: nsT('insight_commands_session', { count: _ns.commandCount }), cls: '' });
    }

    window.hexRenderUtils.clearNode(feed);
    insights.slice(0, 5).forEach((item) => {
        const card = window.hexRenderUtils.createEl('div', {
            className: `insight-card ${item.cls}`.trim()
        });
        card.appendChild(window.hexRenderUtils.createEl('span', { className: 'insight-icon', text: item.icon }));
        card.appendChild(window.hexRenderUtils.createEl('span', { className: 'insight-text', text: item.text }));
        feed.appendChild(card);
    });
}

// ── Memory Feed ───────────────────────────────────────────────
function nsUpdateMemoryFeed() {
    const feed = document.getElementById('memory-feed');
    if (!feed) return;

    const entries = [];

    try {
        const brain = window.hexBrain;
        if (brain && brain.profile) {
            // User preferences
            if (brain.profile.user?.expertise && brain.profile.user.expertise !== 'unknown') {
                entries.push({
                    icon: '🎯',
                    text: nsT('memory_expertise', { value: brain.profile.user.expertise })
                });
            }
            if (brain.profile.user?.communicationStyle && brain.profile.user.communicationStyle !== 'unknown') {
                entries.push({
                    icon: '💬',
                    text: nsT('memory_style', { value: brain.profile.user.communicationStyle })
                });
            }
            if (brain.profile.preferences?.favoriteApps?.length > 0) {
                entries.push({
                    icon: '⭐',
                    text: nsT('memory_apps', {
                        value: brain.profile.preferences.favoriteApps.slice(0, 3).join(', ')
                    })
                });
            }

            // Recent insights
            const recent = (brain.profile.insights || []).slice(-3);
            for (const ins of recent) {
                entries.push({
                    icon: '💡',
                    text: ins.insight?.substring(0, 60) || nsT('memory_observation_recorded')
                });
            }

            // Active hours
            if (brain.profile.user?.activeHours?.length > 0) {
                entries.push({
                    icon: '🕐',
                    text: nsT('memory_active_hours', { value: brain.profile.user.activeHours.join(', ') })
                });
            }
        }
    } catch (_) { }

    if (entries.length === 0) {
        entries.push({ icon: '🧠', text: nsT('memory_empty') });
    }

    window.hexRenderUtils.clearNode(feed);
    entries.slice(0, 5).forEach((entry) => {
        const row = window.hexRenderUtils.createEl('div', { className: 'mem-entry' });
        row.appendChild(window.hexRenderUtils.createEl('span', { className: 'mem-icon', text: entry.icon }));
        row.appendChild(window.hexRenderUtils.createEl('span', { className: 'mem-text', text: entry.text }));
        feed.appendChild(row);
    });
}

// ── Session Stats ─────────────────────────────────────────────
function nsUpdateSessionStats() {
    const cmdEl = document.getElementById('ss-commands');
    const actEl = document.getElementById('ss-actions');
    const upEl = document.getElementById('ss-uptime');

    if (cmdEl) cmdEl.textContent = _ns.commandCount;
    if (actEl) actEl.textContent = _ns.actionCount;
    if (upEl) {
        const mins = Math.floor((Date.now() - _ns.startTime) / 60000);
        if (mins < 60) upEl.textContent = `${mins}m`;
        else upEl.textContent = `${Math.floor(mins / 60)}h${mins % 60}m`;
    }
}

// ── Public Increment Hooks ────────────────────────────────────
window.nsTrackCommand = function () { _ns.commandCount++; };
window.nsTrackAction = function () { _ns.actionCount++; };

// ── Master Refresh ────────────────────────────────────────────
function nsRefreshAll() {
    nsUpdateModules();
    nsUpdateCoherence();
    nsUpdatePersonality();
    nsUpdateInsights();
    nsUpdateMemoryFeed();
    nsUpdateSessionStats();
    nsUpdateQuickActions();
    nsUpdateDaemons();
}

// ── Init + Polling ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Initial render after a short delay to let other systems init
    setTimeout(nsRefreshAll, 2000);

    // Refresh every 10 seconds
    setInterval(nsRefreshAll, 10000);

    // Hook into vitals polling (intercept existing bar updates)
    const _origPoll = window._systemPollUpdate;
    window._systemPollUpdate = function (data) {
        if (_origPoll) _origPoll(data);
        if (data) _ns.lastVitals = { cpu: data.cpu || 0, ram: data.ram || 0, disk: data.disk || 0 };
    };

    // Hex cell click handlers — open relevant settings tab
    document.querySelectorAll('.hex-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            const module = cell.dataset.module;
            const tabMap = {
                memory: 'tab-memory',
                voice: 'tab-voice',
                security: 'tab-security',
                browser: 'tab-general',
                plugins: 'tab-plugins',
                system: 'tab-general',
            };
            const tabId = tabMap[module];
            if (tabId && typeof openSettings === 'function') {
                openSettings(tabId);
            }
        });
    });
});

// ── Expose for external consumption ───────────────────────────
window.neuralSurface = {
    refresh: nsRefreshAll,
    trackCommand: window.nsTrackCommand,
    trackAction: window.nsTrackAction,
};
