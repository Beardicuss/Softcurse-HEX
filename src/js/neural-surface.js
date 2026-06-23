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

    const browCell = document.getElementById('hex-browser');
    const browVal = document.getElementById('hex-val-browser');
    if (browCell && browVal) {
        const engine = window.hexBrowser?.defaultEngine || config.browser?.searchEngine || 'google';
        browVal.textContent = engine.toUpperCase();
        browCell.classList.add('active');
        browCell.classList.remove('offline');
    }

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

function nsUpdateQuickActions() {
    const container = document.getElementById('quick-actions');
    if (!container) return;

    const actions = [];
    const cpu = _ns.lastVitals.cpu;
    const ram = _ns.lastVitals.ram;
    const disk = _ns.lastVitals.disk;

    if (disk > 85) actions.push({ icon: '⚠', text: nsT('qa_disk_cleanup', { disk }), task: 'disk_cleanup', urgent: true });
    if (ram > 90) actions.push({ icon: '⚠', text: nsT('qa_kill_processes', { ram }), fn: 'openProcesses', urgent: true });
    if (cpu > 90) actions.push({ icon: '⚠', text: nsT('qa_view_processes', { cpu }), fn: 'openProcesses', urgent: true });

    actions.push({ icon: '📸', text: 'Desktop Snapshot', task: 'screenshot' });
    actions.push({ icon: '🛡', text: nsT('qa_defender_scan'), task: 'defender_scan' });
    actions.push({ icon: '🔄', text: nsT('qa_check_updates'), task: 'update_check' });
    actions.push({ icon: '🧹', text: nsT('qa_browser_cache'), task: 'browser_cache' });
    actions.push({ icon: '🧪', text: nsT('qa_network_test'), task: 'network_diag' });
    actions.push({ icon: '🖥', text: nsT('qa_process_monitor'), fn: 'openProcesses' });
    actions.push({ icon: '💾', text: nsT('qa_defragmentation'), task: 'defrag' });
    actions.push({ icon: '🔥', text: nsT('qa_firewall_status'), task: 'firewall_status' });
    actions.push({ icon: '🧠', text: nsT('qa_memory_diagnostics'), task: 'memory_diag' });

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

function nsUpdateDaemons() {
    const config = window._hexConfig || {};
    const dHunter = document.getElementById('daemon-hunter');
    if (dHunter) {
        const cloudEnabled = !!(config?.cloud?.enabled && config?.cloud?.serverUrl);
        if (!cloudEnabled || !window.hexAPI?.cloud?.hunterStatus) {
            dHunter.textContent = 'offline';
            dHunter.className = 'daemon-val offline';
        } else {
            window.hexAPI.cloud.hunterStatus().then((status) => {
                if (status?.success && status.configured) {
                    dHunter.textContent = 'online';
                    dHunter.className = 'daemon-val active';
                } else {
                    dHunter.textContent = 'offline';
                    dHunter.className = 'daemon-val offline';
                }
            }).catch(() => {
                dHunter.textContent = 'offline';
                dHunter.className = 'daemon-val offline';
            });
        }
    }

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

function nsUpdateCoherence() {
    const arc = document.getElementById('coherence-arc');
    const valEl = document.getElementById('coherence-val');
    if (!arc || !valEl) return;

    let score = 20;
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

    score += Math.min(_ns.commandCount * 2, 20);

    const { cpu, ram, disk } = _ns.lastVitals;
    if (cpu < 50 && ram < 70 && disk < 80) score += 10;
    else if (cpu > 90 || ram > 90) score -= 10;

    if (window.hexVoice && (window.hexVoice._localSTT || window.hexVoice._localTTS)) score += 5;

    score = Math.max(0, Math.min(100, score));

    const circumference = 327;
    const offset = circumference - (score / 100) * circumference;
    arc.style.strokeDashoffset = offset;
    valEl.textContent = score;

    if (score >= 80) arc.style.stroke = '#00ffc8';
    else if (score >= 50) arc.style.stroke = '#0088ff';
    else if (score >= 30) arc.style.stroke = '#ff9500';
    else arc.style.stroke = '#ff44aa';
}

function nsUpdatePersonality() {
    const nameEl = document.getElementById('psyche-persona-name');
    if (!nameEl) return;

    try {
        const name = window.hexPersonalities?.getActiveName?.() || 'DEFAULT';
        nameEl.textContent = name.toUpperCase();
    } catch (_) {
        nameEl.textContent = 'DEFAULT';
    }

    const id = window.hexPersonalities?.activeId || 'hex_default';
    const traitMap = {
        'hex_default': { focus: 60, empathy: 50, precision: 55 },
        'hex_sarcastic': { focus: 70, empathy: 30, precision: 80 },
        'hex_friendly': { focus: 40, empathy: 85, precision: 45 },
        'hex_formal': { focus: 75, empathy: 40, precision: 90 },
        'hex_creative': { focus: 50, empathy: 65, precision: 35 },
    };
    const traits = traitMap[id] || { focus: 50, empathy: 50, precision: 50 };
    traits.focus = Math.min(100, traits.focus + Math.min(_ns.commandCount, 20));

    const focusBar = document.getElementById('trait-focus');
    const emBar = document.getElementById('trait-empathy');
    const precBar = document.getElementById('trait-precision');
    if (focusBar) focusBar.style.width = `${traits.focus}%`;
    if (emBar) emBar.style.width = `${traits.empathy}%`;
    if (precBar) precBar.style.width = `${traits.precision}%`;
}

function nsUpdateInsights() {
    const feed = document.getElementById('insight-feed');
    if (!feed) return;

    const insights = [];
    const { cpu, ram, disk } = _ns.lastVitals;

    if (disk > 90) insights.push({ icon: '🔴', text: nsT('insight_disk_critical', { disk }), cls: 'critical' });
    else if (disk > 75) insights.push({ icon: '🟡', text: nsT('insight_disk_warn', { disk }), cls: 'warn' });
    else insights.push({ icon: '🟢', text: nsT('insight_disk_good', { disk }), cls: 'good' });

    if (ram > 85) insights.push({ icon: '🟡', text: nsT('insight_ram_warn', { ram }), cls: 'warn' });
    if (cpu > 85) insights.push({ icon: '🟡', text: nsT('insight_cpu_warn', { cpu }), cls: 'warn' });

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

function nsUpdateMemoryFeed() {
    const feed = document.getElementById('memory-feed');
    if (!feed) return;

    const entries = [];

    try {
        const brain = window.hexBrain;
        if (brain && brain.profile) {
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

            const recent = (brain.profile.insights || []).slice(-3);
            for (const ins of recent) {
                entries.push({
                    icon: '💡',
                    text: ins.insight?.substring(0, 60) || nsT('memory_observation_recorded')
                });
            }

            if (brain.profile.user?.activeHours?.length > 0) {
                entries.push({
                    icon: '🕐',
                    text: nsT('memory_active_hours', { value: brain.profile.user.activeHours.join(', ') })
                });
            }
        }
    } catch (_) { }

    try {
        const pcEntities = window.hexPcEntityMemory?.topHighlights?.(3) || [];
        pcEntities.forEach((item) => {
            entries.push({
                icon: item.kind === 'app' ? '🧩' : item.kind === 'game' ? '🎮' : item.kind === 'folder' ? '📁' : item.kind === 'file' ? '📄' : '🧠',
                text: `Known ${item.kind || 'item'}: ${item.label}`.substring(0, 72)
            });
        });
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

window.nsTrackCommand = function () { _ns.commandCount++; };
window.nsTrackAction = function () { _ns.actionCount++; };

function nsRefreshAll() {
    const nsPanel = document.getElementById('panel-left');
    if (nsPanel && nsPanel.offsetParent === null) return;

    nsUpdateModules();
    nsUpdateCoherence();
    nsUpdatePersonality();
    nsUpdateInsights();
    nsUpdateMemoryFeed();
    nsUpdateSessionStats();
    nsUpdateQuickActions();
    nsUpdateDaemons();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(nsRefreshAll, 2000);
    setInterval(nsRefreshAll, 10000);

    const _origPoll = window._systemPollUpdate;
    window._systemPollUpdate = function (data) {
        if (_origPoll) _origPoll(data);
        if (data) _ns.lastVitals = { cpu: data.cpu || 0, ram: data.ram || 0, disk: data.disk || 0 };
    };

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

window.neuralSurface = {
    refresh: nsRefreshAll,
    trackCommand: window.nsTrackCommand,
    trackAction: window.nsTrackAction,
};
