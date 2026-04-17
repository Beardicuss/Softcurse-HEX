'use strict';
// ═══════════════════════════════════════════════════════════════
// neural-surface.js — Live Neural Modules + Field Intel Engine
// Powers the hex grid, coherence ring, trait bars, insights,
// memory feed, quick actions, vitals, and session stats.
// ═══════════════════════════════════════════════════════════════

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
                memVal.textContent = `${factCount} facts`;
                memCell.classList.add('active');
                memCell.classList.remove('offline');
            } else {
                memVal.textContent = 'INIT';
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
            voiceVal.textContent = 'READY';
            voiceCell.classList.add('active');
            voiceCell.classList.remove('offline');
        } else if (config.voice?.ttsProvider && config.voice.ttsProvider !== 'none') {
            voiceVal.textContent = 'CLOUD';
            voiceCell.classList.add('active');
            voiceCell.classList.remove('offline');
        } else {
            voiceVal.textContent = 'OFF';
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
            secVal.textContent = `${threats} found`;
            secCell.classList.add('alert');
            secCell.classList.remove('active', 'offline');
        } else {
            secVal.textContent = 'CLEAR';
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
                plugVal.textContent = `${count} loaded`;
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
            sysVal.textContent = 'WARN';
            sysCell.classList.add('alert');
            sysCell.classList.remove('active', 'offline');
        } else {
            sysVal.textContent = 'OK';
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
    if (disk > 85) actions.push({ icon: '⚠', text: `Disk ${disk}% — Run Cleanup`, task: 'disk_cleanup', urgent: true });
    if (ram > 90) actions.push({ icon: '⚠', text: `RAM ${ram}% — Kill Processes`, fn: 'openProcesses', urgent: true });
    if (cpu > 90) actions.push({ icon: '⚠', text: `CPU ${cpu}% — View Processes`, fn: 'openProcesses', urgent: true });

    // Always available
    actions.push({ icon: '🛡', text: 'Defender Scan', task: 'defender_scan' });
    actions.push({ icon: '🔄', text: 'Check Updates', task: 'update_check' });
    actions.push({ icon: '🧹', text: 'Browser Cache', task: 'browser_cache' });
    actions.push({ icon: '🧪', text: 'Network Test', task: 'network_diag' });
    actions.push({ icon: '🖥', text: 'Process Monitor', fn: 'openProcesses' });
    actions.push({ icon: '💾', text: 'Defragmentation', task: 'defrag' });
    actions.push({ icon: '🔥', text: 'Firewall Status', task: 'firewall_status' });
    actions.push({ icon: '🧠', text: 'Memory Diagnostics', task: 'memory_diag' });

    // Render top 6
    const top = actions.slice(0, 6);
    container.innerHTML = top.map(a => {
        const cls = a.urgent ? 'qa-row urgent' : 'qa-row';
        const handler = a.task ? `runTask('${a.task}')` : `${a.fn}()`;
        return `<div class="${cls}" onclick="${handler}">
      <span class="qa-icon">${a.icon}</span>
      <span class="qa-text">${a.text}</span>
    </div>`;
    }).join('');
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
                dHunter.textContent = 'ACTIVE';
                dHunter.className = 'daemon-val active';
            }
        });
    }

    // 2. Desktop Vision
    const dVision = document.getElementById('daemon-vision');
    if (dVision) {
        if (window.visionEnabled) {
            dVision.textContent = 'ACTIVE';
            dVision.className = 'daemon-val active';
        } else {
            dVision.textContent = 'OFF';
            dVision.className = 'daemon-val offline';
        }
    }

    // 3. Local LLM / Cloud
    const dLLM = document.getElementById('daemon-llm');
    if (dLLM) {
        const isCloud = config.llm?.provider !== 'ollama' && config.llm?.provider !== 'none';
        if (isCloud) {
            dLLM.textContent = 'CLOUD';
            dLLM.className = 'daemon-val cloud';
        } else if (config.llm?.provider === 'ollama') {
            dLLM.textContent = 'LOCAL';
            dLLM.className = 'daemon-val local';
        } else {
            dLLM.textContent = 'OFF';
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
    if (disk > 90) insights.push({ icon: '🔴', text: `Disk critical: ${disk}% used`, cls: 'critical' });
    else if (disk > 75) insights.push({ icon: '🟡', text: `Disk at ${disk}% — cleanup recommended`, cls: 'warn' });
    else insights.push({ icon: '🟢', text: `Disk healthy: ${disk}% used`, cls: 'good' });

    if (ram > 85) insights.push({ icon: '🟡', text: `RAM at ${ram}% — close unused apps`, cls: 'warn' });
    if (cpu > 85) insights.push({ icon: '🟡', text: `CPU load: ${cpu}%`, cls: 'warn' });

    // Brain insights
    try {
        const brain = window.hexBrain;
        if (brain && brain.profile) {
            const factCount = (brain.profile.insights?.length || 0) +
                (brain.profile.preferences?.favoriteApps?.length || 0);
            insights.push({ icon: '🧠', text: `${factCount} observations stored`, cls: '' });

            const lastSession = brain.profile.sessionHistory?.[brain.profile.sessionHistory.length - 1];
            if (lastSession?.summary) {
                insights.push({ icon: '📝', text: `Last: ${lastSession.summary.substring(0, 60)}`, cls: '' });
            }

            if (brain.profile.dayNumber) {
                insights.push({ icon: '📅', text: `HEX age: Day ${brain.profile.dayNumber}`, cls: '' });
            }
        }
    } catch (_) { }

    // Session insights
    if (_ns.commandCount > 0) {
        insights.push({ icon: '⚡', text: `${_ns.commandCount} commands this session`, cls: '' });
    }

    feed.innerHTML = insights.slice(0, 5).map(i =>
        `<div class="insight-card ${i.cls}">
      <span class="insight-icon">${i.icon}</span>
      <span class="insight-text">${i.text}</span>
    </div>`
    ).join('');
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
                entries.push({ icon: '🎯', text: `Expertise: ${brain.profile.user.expertise}` });
            }
            if (brain.profile.user?.communicationStyle && brain.profile.user.communicationStyle !== 'unknown') {
                entries.push({ icon: '💬', text: `Style: ${brain.profile.user.communicationStyle}` });
            }
            if (brain.profile.preferences?.favoriteApps?.length > 0) {
                entries.push({ icon: '⭐', text: `Apps: ${brain.profile.preferences.favoriteApps.slice(0, 3).join(', ')}` });
            }

            // Recent insights
            const recent = (brain.profile.insights || []).slice(-3);
            for (const ins of recent) {
                entries.push({ icon: '💡', text: ins.insight?.substring(0, 60) || 'Observation recorded' });
            }

            // Active hours
            if (brain.profile.user?.activeHours?.length > 0) {
                entries.push({ icon: '🕐', text: `Active hours: ${brain.profile.user.activeHours.join(', ')}` });
            }
        }
    } catch (_) { }

    if (entries.length === 0) {
        entries.push({ icon: '🧠', text: 'No memories recorded yet.' });
    }

    feed.innerHTML = entries.slice(0, 5).map(e =>
        `<div class="mem-entry">
      <span class="mem-icon">${e.icon}</span>
      <span class="mem-text">${e.text}</span>
    </div>`
    ).join('');
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
