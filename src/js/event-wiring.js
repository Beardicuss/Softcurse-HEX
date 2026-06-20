'use strict';
// ── event-wiring.js ─────────────────────────────────────────────────────────
// Replaces all inline onclick/onchange/oninput/onkeydown/ondblclick handlers
// in index.html with centralized event bindings.
// Loaded after all other modules so every global function is available.

(function wireAllEvents() {

    /* ── Helpers ──────────────────────────────────────────────── */
    function bind(id, event, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    }

    function bindSel(sel, event, fn) {
        const el = document.querySelector(sel);
        if (el) el.addEventListener(event, fn);
    }

    /* ── Lock Screen ─────────────────────────────────────────── */
    bindSel('#face-lock-overlay .btn-primary', 'click', () => attemptFaceUnlock());
    bindSel('#face-lock-overlay .btn-secondary', 'click', () => {
        document.getElementById('lock-pin-area').style.display = 'flex';
    });
    bindSel('#welcome-submit', 'click', () => window.hexOnboarding?.submit?.());
    bind('lock-pin', 'keydown', (e) => { if (e.key === 'Enter') attemptPinUnlock(); });
    // The "ENTER" button next to pin input — select by context
    document.querySelectorAll('#lock-pin-area .btn-secondary').forEach(btn => {
        if (btn.textContent.trim() === 'ENTER') btn.addEventListener('click', () => attemptPinUnlock());
    });

    /* ── Settings Tabs (delegation) ──────────────────────────── */
    bindSel('.settings-tabs', 'click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) switchSettingsTab(tab.dataset.tab);
    });

    /* ── Settings AI ─────────────────────────────────────────── */
    bind('cfg-provider', 'change', async () => { updateProviderUI(); if (AUTO_MODEL_PROVIDERS?.has(document.getElementById('cfg-provider')?.value || '')) await fetchAvailableModels().catch(() => {}); });
    bind('cfg-autoollama', 'change', () => updateProviderUI());
    bind('fetch-models-btn', 'click', () => fetchAvailableModels());
    bind('add-manual-key-btn', 'click', () => addManualApiKey());
    bind('cfg-manual-api-key', 'keydown', (e) => { if (e.key === 'Enter') addManualApiKey(); });

    /* ── Settings Voice — Models ─────────────────────────────── */
    bind('dl-stt-size', 'change', function () {
        document.getElementById('dl-stt-size-hint').textContent =
            this.options[this.selectedIndex].dataset.hint;
    });
    bind('download-models-btn', 'click', () => downloadVoiceModels());
    // Refresh voice status button (next to download)
    document.querySelectorAll('#tab-voice .btn-secondary').forEach(btn => {
        if (btn.textContent.trim() === '↻' && !btn.id) {
            // The refresh button adjacent to the download button
            const parent = btn.closest('.form-group');
            if (parent && parent.querySelector('#download-models-btn')) {
                btn.id = 'refresh-voice-status-btn';
                btn.addEventListener('click', () => refreshVoiceStatus());
            }
        }
    });

    /* ── Settings Voice — Directory ──────────────────────────── */
    // These buttons need IDs — assign them contextually
    const modelsDirRow = document.getElementById('cfg-models-dir')?.closest('.form-group');
    if (modelsDirRow) {
        const btns = modelsDirRow.querySelectorAll('.btn-secondary');
        btns.forEach(btn => {
            const txt = btn.textContent.trim();
            if (txt.includes('BROWSE')) { btn.id = 'browse-models-btn'; btn.addEventListener('click', () => browseModelsDir()); }
            else if (txt === 'APPLY') { btn.id = 'apply-models-btn'; btn.addEventListener('click', () => applyModelsDir()); }
            else if (txt.includes('CHECK')) { btn.id = 'check-voice-btn'; btn.addEventListener('click', () => checkVoiceStatus()); }
        });
    }
    // Open models dir folder button
    document.querySelectorAll('#tab-voice .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('OPEN FOLDER') && !btn.id) {
            btn.id = 'open-models-dir-btn';
            btn.addEventListener('click', () => openModelsDir());
        }
    });

    /* ── Settings Voice — Engine & Preview ───────────────────── */
    bind('tts-engine-local', 'change', () => updateTtsEngineUI());
    bind('tts-engine-os', 'change', () => updateTtsEngineUI());
    bind('cfg-local-voice', 'change', function () {
        window.hexVoice._localVoiceLang = this.value;
        updateTtsEngineUI();
    });

    // Local speed slider
    bind('cfg-local-speed', 'input', function () {
        document.getElementById('local-speed-val').textContent = parseFloat(this.value).toFixed(2);
    });

    // Preview buttons
    document.querySelectorAll('#local-voice-picker .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('TEST')) {
            btn.id = 'preview-local-voice-btn';
            btn.addEventListener('click', () => previewLocalVoice());
        }
    });
    document.querySelectorAll('#os-voice-picker .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('TEST')) {
            btn.id = 'preview-os-voice-btn';
            btn.addEventListener('click', () => previewSelectedVoice());
        }
    });

    /* ── Settings Voice — Sliders ────────────────────────────── */
    bind('cfg-rate', 'input', function () {
        document.getElementById('rate-val').textContent = this.value;
    });
    bind('cfg-pitch', 'input', function () {
        document.getElementById('pitch-val').textContent = this.value;
    });
    bind('cfg-volume', 'input', function () {
        document.getElementById('volume-val').textContent = parseFloat(this.value).toFixed(2);
    });

    /* ── Settings Persona ────────────────────────────────────── */
    document.querySelectorAll('#tab-persona .btn-primary').forEach(btn => {
        if (btn.textContent.includes('SAVE')) {
            btn.id = 'save-persona-btn';
            btn.addEventListener('click', () => savePersonality());
        }
    });
    document.querySelectorAll('#tab-persona .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('CLEAR')) {
            btn.id = 'clear-persona-btn';
            btn.addEventListener('click', () => clearPersonaForm());
        }
    });

    /* ── Settings Memory ─────────────────────────────────────── */
    bind('mem-search', 'input', function () { filterMemoryFacts(this.value); });
    bind('mem-type-filter', 'change', function () {
        filterMemoryFacts(document.getElementById('mem-search').value);
    });
    document.querySelectorAll('#tab-memory .btn-secondary').forEach(btn => {
        const txt = btn.textContent.trim();
        if (txt.includes('COMPRESS')) btn.addEventListener('click', () => compressSession());
        else if (txt.includes('HEALTH')) btn.addEventListener('click', () => showMemoryReport());
        else if (txt.includes('CLEAR FACTS')) btn.addEventListener('click', () => clearMemoryFacts());
        else if (txt.includes('CLEAR HISTORY')) btn.addEventListener('click', () => clearMemoryHistory());
        else if (txt.includes('WIPE ALL')) btn.addEventListener('click', () => clearAllMemory());
    });

    /* ── Settings Security ───────────────────────────────────── */
    bind('cfg-face-enabled', 'change', function () {
        toggleFaceAuth(this.value === 'true');
    });
    bind('cfg-face-threshold', 'input', function () {
        document.getElementById('face-thresh-val').textContent = Math.round(this.value * 100) + '%';
    });
    bind('cfg-face-threshold', 'change', function () {
        setFaceThreshold(this.value);
    });
    bind('btn-start-scanner', 'click', () => startFaceEnrollment());
    bind('btn-capture-face', 'click', () => captureFaceEnrollment());
    document.querySelectorAll('#tab-security .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('CLEAR DATA')) {
            btn.id = 'unenroll-face-btn';
            btn.addEventListener('click', () => unenrollFace());
        }
    });

    /* ── Settings Plugins ────────────────────────────────────── */
    bind('subtab-plugins-installed', 'click', () => switchPluginSubTab('installed'));
    bind('subtab-plugins-market', 'click', () => switchPluginSubTab('market'));
    document.querySelectorAll('#panel-plugins-installed .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('REFRESH')) btn.addEventListener('click', () => loadPluginsList());
        else if (btn.textContent.includes('OPEN FOLDER')) btn.addEventListener('click', () => openPluginsFolder());
    });
    document.querySelectorAll('#panel-plugins-market .btn-primary').forEach(btn => {
        if (btn.textContent.includes('BROWSE')) btn.addEventListener('click', () => browseAndInstallPlugin());
    });

    /* ── Settings Footer ─────────────────────────────────────── */
    document.querySelectorAll('#settings-modal > .settings-footer .btn-secondary, #settings-modal .btn-secondary[data-i18n="cancel"]').forEach(btn => {
        if (btn.textContent.trim() === 'CANCEL' || btn.dataset.i18n === 'cancel') {
            btn.id = 'settings-cancel-btn';
            btn.addEventListener('click', () => closeSettings());
        }
    });
    document.querySelectorAll('#settings-modal .btn-primary[data-i18n="save"]').forEach(btn => {
        btn.id = 'settings-save-btn';
        btn.addEventListener('click', () => saveSettings());
    });

    /* ── Process Manager ─────────────────────────────────────── */
    document.querySelectorAll('#process-modal .btn-secondary').forEach(btn => {
        const txt = btn.textContent.trim();
        if (txt.includes('REFRESH')) { btn.id = 'proc-refresh-btn'; btn.addEventListener('click', () => refreshProcesses()); }
        else if (txt.includes('CLOSE')) { btn.id = 'proc-close-btn'; btn.addEventListener('click', () => closeProcesses()); }
    });

    /* ── Clipboard Panel ─────────────────────────────────────── */
    document.querySelectorAll('#clipboard-modal .btn-secondary').forEach(btn => {
        if (btn.textContent.includes('CLOSE')) {
            btn.id = 'clipboard-close-btn';
            btn.addEventListener('click', () => closeClipboard());
        }
    });
    bind('clipboard-search', 'input', function () { searchClipboard(this.value); });

    /* ── Top Bar ─────────────────────────────────────────────── */
    bind('mic-status', 'click', () => toggleMic());
    bind('mode-switch-btn', 'click', () => switchMode('toggle'));
    bind('settings-btn', 'click', () => openSettings());

    /* ── Window Controls (delegation on .win-controls) ───────── */
    bindSel('.win-controls', 'click', (e) => {
        const orb = e.target.closest('.orb-outer');
        if (!orb) return;
        if (orb.classList.contains('orb-close')) { window.hexAPI.close(); }
        else if (orb.title === 'Maximize') { window.hexAPI.maximize(); }
        else if (orb.title === 'Minimize') { window.hexAPI.minimize(); }
    });

    /* ── Neural Surface — Persona Badge ──────────────────────── */
    bind('persona-badge', 'click', () => openSettings('tab-persona'));

    /* ── Chat Area ───────────────────────────────────────────── */
    bind('vision-btn', 'click', () => toggleVision());
    bind('mic-btn', 'click', () => toggleMic());
    bindSel('.chat-send-btn', 'click', () => sendMessage());
    bind('chat-input', 'keydown', (e) => handleInputKey(e));

    /* ── Browser Bar ─────────────────────────────────────────── */
    bind('browser-input', 'keydown', (e) => handleBrowserKey(e));
    document.querySelectorAll('.browser-bar-btn').forEach(btn => {
        if (btn.title === 'Go') btn.addEventListener('click', () => launchBrowser());
        else if (btn.id === 'search-engine-btn') btn.addEventListener('click', () => cycleSearchEngine());
    });

    /* ── Footer / Terminal ───────────────────────────────────── */
    bind('terminal-log', 'dblclick', () => clearTerminal());
    bind('terminal-clear', 'click', () => clearTerminal());
    bind('terminal-toggle', 'click', () => toggleTerminal());
    // Hover effect for terminal toggle (replaces onmouseenter/onmouseleave)
    const termToggle = document.getElementById('terminal-toggle');
    if (termToggle) {
        termToggle.addEventListener('mouseenter', function () { this.style.color = 'var(--cyan)'; });
        termToggle.addEventListener('mouseleave', function () { this.style.color = 'rgba(0,255,200,0.35)'; });
    }

    /* ── Right Panel — Recurring Refresh ─────────────────────── */
    document.querySelectorAll('.btn-secondary').forEach(btn => {
        if (btn.textContent.includes('REFRESH') && btn.closest('#recurring-section, .recurring-section, [id*="recurring"]')) {
            btn.id = btn.id || 'refresh-recurring-btn';
            btn.addEventListener('click', () => refreshRecurring());
        }
    });

})();

