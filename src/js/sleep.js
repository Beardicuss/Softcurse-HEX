'use strict';
// ── sleep.js — HEX/Cardinal Sleep/Standby Mode ───────────────────────────────
// When user is idle for a configurable time, HEX enters sleep:
//   • Full-screen dark overlay with sci-fi analog clock
//   • Suspends system monitoring, animations, neural surface to reduce load
//   • Wake via click, keypress, or voice ("wake up" / wake word)

(function () {

    let _idleTimer = null;
    let _clockInterval = null;
    let _sleeping = false;
    let _canvas = null;
    let _ctx = null;
    let _micWasActive = false;

    // ── Saved state for suspended resources ──
    const _suspended = {
        sysStatsInterval: null,
        neuralInterval: null,
        orbRAF: null,
    };

    // ── Public API ──────────────────────────────────────────────────────────────

    window.hexSleep = {
        get isSleeping() { return _sleeping; },

        init() {
            _createOverlay();
            _resetIdleTimer();

            // Idle reset on any interaction
            document.addEventListener('mousemove', _resetIdleTimer);
            document.addEventListener('keydown', _onKeyDuringIdle);
            document.addEventListener('click', _resetIdleTimerIfNotSleep);
        },

        resetIdle() { _resetIdleTimer(); },

        sleep() { _enterSleep(); },

        wake() { _exitSleep(); },

        getTimeoutMin() {
            return config?.sleepTimeoutMin || 0;
        },
    };

    // ── Idle Timer ──────────────────────────────────────────────────────────────

    function _resetIdleTimer() {
        if (_sleeping) return;
        if (_idleTimer) clearTimeout(_idleTimer);

        const minutes = config?.sleepTimeoutMin || 0;
        if (minutes <= 0) return; // disabled

        _idleTimer = setTimeout(() => {
            _enterSleep();
        }, minutes * 60 * 1000);
    }

    function _resetIdleTimerIfNotSleep() {
        if (!_sleeping) _resetIdleTimer();
    }

    function _onKeyDuringIdle(e) {
        if (_sleeping) {
            e.preventDefault();
            _exitSleep();
        } else {
            _resetIdleTimer();
        }
    }

    // ── Enter Sleep ─────────────────────────────────────────────────────────────

    function _enterSleep() {
        if (_sleeping) return;
        _sleeping = true;

        // Save mic state and keep it running for wake word
        _micWasActive = window.hexVoice?._listening || false;

        // Hook voice for wake detection (localized wake words)
        if (window.hexVoice && _micWasActive) {
            window.hexVoice._sleepWakeHook = (transcript) => {
                const t = transcript.toLowerCase().trim();
                // English, Russian, Georgian wake phrases + wake word
                const wakeWords = [
                    'wake up',
                    'просыпайся',  // Russian
                    'გაიღვიძე',     // Georgian
                    'hey hex', 'hey cardinal',
                ];
                if (wakeWords.some(w => t.includes(w))) {
                    _exitSleep();
                    return true; // consumed
                }
                return false;
            };
        }

        addLog('SYSTEM', 'Entering sleep mode...');

        // ── Suspend heavy resources ──
        _suspendResources();

        // Show overlay
        const overlay = document.getElementById('sleep-overlay');
        if (overlay) {
            // Set mode styling
            const isCardinal = (typeof currentMode !== 'undefined' && currentMode === 'cardinal');
            overlay.classList.toggle('cardinal-sleep', isCardinal);
            overlay.classList.toggle('hex-sleep', !isCardinal);

            // Set mode name and localized wake button
            const nameEl = document.getElementById('sleep-mode-name');
            if (nameEl) nameEl.textContent = isCardinal ? 'CARDINAL' : 'H.E.X';

            // Localized wake button text
            const wakeBtn = document.getElementById('sleep-wake-btn');
            if (wakeBtn) {
                const lang = config?.language || 'en';
                const wakeBtnTexts = { en: '◉ WAKE UP', ru: '◉ ПРОСЫПАЙСЯ', ka: '◉ გაიღვიძე' };
                wakeBtn.textContent = wakeBtnTexts[lang] || wakeBtnTexts.en;
            }

            overlay.classList.add('active');
        }

        // Start clock
        _initCanvas();
        _drawClock();
        _clockInterval = setInterval(_drawClock, 1000);
    }

    // ── Exit Sleep ──────────────────────────────────────────────────────────────

    function _exitSleep() {
        if (!_sleeping) return;
        _sleeping = false;

        // Stop clock
        if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }

        // Hide overlay
        const overlay = document.getElementById('sleep-overlay');
        if (overlay) overlay.classList.remove('active');

        // Remove voice hook
        if (window.hexVoice) window.hexVoice._sleepWakeHook = null;

        // ── Resume resources ──
        _resumeResources();

        // Reset idle timer for next cycle
        _resetIdleTimer();

        addLog('SYSTEM', 'Woke up from sleep mode.');
        showToast('SYS', 'System resumed.', 'info', 2000);
    }

    // ── Resource Suspension ─────────────────────────────────────────────────────

    function _suspendResources() {
        // 1. Stop orb animation
        if (typeof hexRAF !== 'undefined' && hexRAF) {
            cancelAnimationFrame(hexRAF);
            _suspended.orbRAF = true;
        }

        // 2. Pause system stats polling (main process → renderer)
        if (window.hexAPI?.system?.pauseStats) {
            window.hexAPI.system.pauseStats();
        }

        // 3. Pause neural surface refresh
        if (window._nsRefreshInterval) {
            clearInterval(window._nsRefreshInterval);
            _suspended.neuralInterval = window._nsRefreshInterval;
            window._nsRefreshInterval = null;
        }

        // 4. Pause activity monitor
        if (window.activityMonitor?._timer) {
            clearInterval(window.activityMonitor._timer);
            _suspended.activityTimer = window.activityMonitor._timer;
            window.activityMonitor._timer = null;
        }

        // 5. Hide main UI to reduce rendering
        const mainUI = document.getElementById('app-container') || document.querySelector('.app-grid');
        if (mainUI) mainUI.style.display = 'none';
    }

    function _resumeResources() {
        // 1. Resume orb animation
        if (_suspended.orbRAF && typeof startHexAnimation === 'function') {
            startHexAnimation();
            _suspended.orbRAF = false;
        }

        // 2. Resume system stats
        if (window.hexAPI?.system?.resumeStats) {
            window.hexAPI.system.resumeStats();
        }

        // 3. Resume neural surface
        if (_suspended.neuralInterval && typeof nsRefreshAll === 'function') {
            window._nsRefreshInterval = setInterval(nsRefreshAll, 10000);
            _suspended.neuralInterval = null;
        }

        // 4. Resume activity monitor
        if (_suspended.activityTimer && window.activityMonitor) {
            window.activityMonitor._timer = setInterval(
                () => window.activityMonitor._checkActivity(), 60000
            );
            _suspended.activityTimer = null;
        }

        // 5. Show main UI again
        const mainUI = document.getElementById('app-container') || document.querySelector('.app-grid');
        if (mainUI) mainUI.style.display = '';
    }

    // ── Create Overlay DOM ──────────────────────────────────────────────────────

    function _createOverlay() {
        if (document.getElementById('sleep-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'sleep-overlay';
        overlay.innerHTML = `
      <canvas id="sleep-clock-canvas" width="400" height="400"></canvas>
      <div id="sleep-time-digital"></div>
      <div id="sleep-mode-name">H.E.X</div>
      <div id="sleep-wake-btn">◉ WAKE UP</div>
    `;

        // Wake on click anywhere
        overlay.addEventListener('click', () => _exitSleep());

        document.body.appendChild(overlay);
    }

    // ── Canvas Clock ────────────────────────────────────────────────────────────
    // Sci-fi analog clock with concentric rings, circuit traces, and glowing dots

    function _initCanvas() {
        _canvas = document.getElementById('sleep-clock-canvas');
        if (!_canvas) return;

        // HiDPI support
        const dpr = window.devicePixelRatio || 1;
        const size = 400;
        _canvas.width = size * dpr;
        _canvas.height = size * dpr;
        _canvas.style.width = size + 'px';
        _canvas.style.height = size + 'px';
        _ctx = _canvas.getContext('2d');
        _ctx.scale(dpr, dpr);
    }

    function _drawClock() {
        if (!_ctx) return;
        const ctx = _ctx;
        const W = 400, H = 400;
        const cx = W / 2, cy = H / 2;
        const now = new Date();
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        const isCardinal = (typeof currentMode !== 'undefined' && currentMode === 'cardinal');
        const primary = isCardinal ? '#dc143c' : '#00e5ff';
        const secondary = isCardinal ? '#ff8c00' : '#0f9';
        const dim = isCardinal ? 'rgba(220,20,60,0.15)' : 'rgba(0,229,255,0.15)';
        const dimLine = isCardinal ? 'rgba(220,20,60,0.25)' : 'rgba(0,229,255,0.25)';
        const glow = isCardinal ? 'rgba(220,20,60,0.6)' : 'rgba(0,229,255,0.6)';

        ctx.clearRect(0, 0, W, H);

        // ── Center glow ──
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
        grad.addColorStop(0, dim);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 180, 0, Math.PI * 2);
        ctx.fill();

        // ── Outer ring ──
        ctx.strokeStyle = dimLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 160, 0, Math.PI * 2);
        ctx.stroke();

        // ── Outer concentric decorative ring ──
        ctx.strokeStyle = dim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 170, 0, Math.PI * 2);
        ctx.stroke();

        // ── Circuit traces radiating outward ──
        ctx.strokeStyle = dimLine;
        ctx.lineWidth = 1;
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
            const innerR = 162;
            const outerR = 185 + (i % 3 === 0 ? 10 : 0);
            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Circuit node dots at the end
            if (i % 2 === 0) {
                ctx.fillStyle = dimLine;
                ctx.beginPath();
                ctx.arc(x2, y2, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Branch turns (L-shaped traces)
            if (i % 3 === 0) {
                const branchAngle = angle + 0.3;
                const bx = x2 + Math.cos(branchAngle) * 12;
                const by = y2 + Math.sin(branchAngle) * 12;
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(bx, by);
                ctx.stroke();

                // Terminal dot
                ctx.fillStyle = dim;
                ctx.beginPath();
                ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── Hour markers (12 dots) ──
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const r = 142;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            ctx.fillStyle = i % 3 === 0 ? primary : dimLine;
            ctx.beginPath();
            ctx.arc(x, y, i % 3 === 0 ? 4 : 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Glow on major markers
            if (i % 3 === 0) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = primary;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // ── Minute markers (60 tiny dots on outer ring) ──
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0) continue; // skip hour positions
            const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const r = 155;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            ctx.fillStyle = dim;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Inner decorative ring ──
        ctx.strokeStyle = dim;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 110, 0, Math.PI * 2);
        ctx.stroke();

        // ── Second sweep arc ──
        const secAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 150, -Math.PI / 2, secAngle);
        ctx.stroke();

        // ── Hour hand ──
        const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = primary;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = primary;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(hAngle) * 70, cy + Math.sin(hAngle) * 70);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Minute hand ──
        const mAngle = ((minutes + seconds / 60) / 60) * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = primary;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = primary;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(mAngle) * 105, cy + Math.sin(mAngle) * 105);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Second hand ──
        ctx.strokeStyle = secondary;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 6;
        ctx.shadowColor = secondary;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(secAngle) * 130, cy + Math.sin(secAngle) * 130);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Center hub ──
        const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8);
        hubGrad.addColorStop(0, primary);
        hubGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = primary;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        // ── Update digital time below ──
        const digitalEl = document.getElementById('sleep-time-digital');
        if (digitalEl) {
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            digitalEl.textContent = `${h}:${m}:${s}`;
        }
    }

})();
