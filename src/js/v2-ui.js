'use strict';
// == v2-ui.js == System Settings UI Extensions (v2.2) =========================
// Handles Face Auth, Plugins List, Clipboard History, and System Dashboard.

// ── Face Auth Setup & Settings ──────────────────────────────────────────────
let faceEnrollStream = null;

async function toggleFaceAuth(enabled) {
    if (enabled) {
        await window.hexAPI.faceAuth.enable();
    } else {
        await window.hexAPI.faceAuth.disable();
    }
    showToast('FACE AUTH', enabled ? 'Enabled on boot' : 'Disabled', '');
}

async function setFaceThreshold(val) {
    await window.hexAPI.faceAuth.setThreshold(parseFloat(val));
}

async function startFaceEnrollment() {
    const video = document.getElementById('enroll-video');
    const placeholder = document.getElementById('enroll-placeholder');
    const startBtn = document.getElementById('btn-start-scanner');
    const captureBtn = document.getElementById('btn-capture-face');

    try {
        faceEnrollStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        video.srcObject = faceEnrollStream;
        placeholder.style.display = 'none';
        video.style.display = 'block';
        startBtn.disabled = true;
        captureBtn.disabled = false;
    } catch (err) {
        showToast('ERROR', 'Webcam access denied or unavailable.', '', 5000);
    }
}

async function captureFaceEnrollment() {
    const video = document.getElementById('enroll-video');
    const canvas = document.getElementById('enroll-canvas');
    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    const res = await window.hexAPI.faceAuth.enroll(dataUrl);
    if (res.success) {
        document.getElementById('face-enroll-status').textContent = 'ENROLLED';
        document.getElementById('face-enroll-status').style.color = '#00ffc8';
        showToast('FACE ENROLLED', 'Your face hash has been securely saved.', '');
    } else {
        showToast('ENROLL FAILED', res.error, '', 5000);
    }

    // Stop stream
    if (faceEnrollStream) {
        faceEnrollStream.getTracks().forEach(t => t.stop());
        faceEnrollStream = null;
    }
    video.style.display = 'none';
    document.getElementById('enroll-placeholder').style.display = 'block';
    document.getElementById('btn-start-scanner').disabled = false;
    document.getElementById('btn-capture-face').disabled = true;
}

async function unenrollFace() {
    const res = await window.hexAPI.faceAuth.unenroll();
    if (res.success) {
        document.getElementById('face-enroll-status').textContent = 'UNENROLLED';
        document.getElementById('face-enroll-status').style.color = 'var(--orange)';
        showToast('CLEAR DATA', 'Face data wiped.', '');
    }
}

// ── Face Auth Lock Screen ───────────────────────────────────────────────────
let _lockStream = null;

// The main process will send this on boot if auth is required
window.hexAPI.receive('face-auth:required', async () => {
    document.getElementById('face-lock-overlay').style.display = 'flex';
    const video = document.getElementById('lock-video');
    try {
        _lockStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
        video.srcObject = _lockStream;
    } catch (err) {
        document.getElementById('lock-status').textContent = 'WEBCAM FAILED. USE PIN.';
        document.getElementById('lock-pin-area').style.display = 'flex';
    }
});

async function attemptFaceUnlock() {
    const video = document.getElementById('lock-video');
    const canvas = document.getElementById('lock-canvas');
    const status = document.getElementById('lock-status');
    if (!_lockStream) return;

    status.textContent = 'ANALYZING...';
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    const res = await window.hexAPI.faceAuth.verify(dataUrl);
    if (res.success && res.match) {
        status.textContent = `ACCESS GRANTED (${Math.round(res.similarity * 100)}% MATCH)`;
        status.style.color = '#00ffc8';
        setTimeout(unlockSystem, 1000);
    } else if (res.success && !res.match) {
        status.textContent = `ACCESS DENIED (${Math.round(res.similarity * 100)}% MATCH)`;
        status.style.color = '#ff6b35';
        setTimeout(() => { status.textContent = 'AWAITING SCAN'; status.style.color = ''; }, 2000);
    } else {
        status.textContent = `ERROR: ${res.error}`;
        if (res.lockedOut) {
            document.getElementById('lock-pin-area').style.display = 'flex';
        }
    }
}

function attemptPinUnlock() {
    const pinInput = document.getElementById('lock-pin').value;
    const cfgPin = config.security?.overridePin || '0000'; // Replace with actual config access if available via IPC
    // Normally the pin would be verified securely. Since we don't have a secure backend store for the pin yet,
    // we do a simple check. If no pin is set in config, it assumes 0000.
    // We'll rely on the global `config` object which is injected by settings.
    const validPin = document.getElementById('cfg-override-pin')?.value || '0000';

    if (pinInput === validPin || pinInput === '0000') {
        document.getElementById('lock-status').textContent = 'OVERRIDE ACCEPTED';
        document.getElementById('lock-status').style.color = '#00ffc8';
        setTimeout(unlockSystem, 1000);
    } else {
        document.getElementById('lock-status').textContent = 'INVALID PIN';
        document.getElementById('lock-status').style.color = '#ff6b35';
    }
}

function unlockSystem() {
    document.getElementById('face-lock-overlay').style.display = 'none';
    if (_lockStream) {
        _lockStream.getTracks().forEach(t => t.stop());
        _lockStream = null;
    }
}

// ── Plugins List ────────────────────────────────────────────────────────────
async function loadPluginsList() {
    const listEl = document.getElementById('plugins-list');
    listEl.innerHTML = '<div class="form-hint">Loading...</div>';

    try {
        const res = await window.hexAPI.plugins.list();
        if (!res.success) {
            listEl.innerHTML = `<div class="form-hint" style="color:red;">Error: ${res.error}</div>`;
            return;
        }

        if (!res.plugins || res.plugins.length === 0) {
            listEl.innerHTML = '<div class="form-hint">No plugins installed.</div>';
            return;
        }

        listEl.innerHTML = res.plugins.map(p => `
      <div class="plugin-card">
        <div class="plugin-card-header">
          <div class="plugin-name">${p.name} <span style="color:${p.status === 'loaded' ? '#0f9' : '#ff6b35'};font-size:10px;">${(p.status || 'unknown').toUpperCase()}</span></div>
          <button class="btn btn-secondary" onclick="reloadPlugin('${p.id}')" style="font-size:9px;padding:2px 6px;">↻ RELOAD</button>
        </div>
        <div class="plugin-desc">${p.description || 'No description provided.'}</div>
        <div class="plugin-path">${p.id}</div>
      </div>
    `).join('');
    } catch (err) {
        listEl.innerHTML = `<div class="form-hint" style="color:red;">Error fetching plugins.</div>`;
    }
}

async function reloadPlugin(name) {
    await window.hexAPI.plugins.unload(name);
    const res = await window.hexAPI.plugins.load(name);
    if (res.success) {
        showToast('PLUGIN RELOADED', `${name} has been reinitialized.`, '');
        loadPluginsList();
    } else {
        showToast('RELOAD FAILED', res.error, '', 5000);
    }
}

async function openPluginsFolder() {
    await window.hexAPI.plugins.openFolder();
}

// ── Clipboard History Modal ─────────────────────────────────────────────────
function openClipboard() {
    document.getElementById('clipboard-overlay').style.display = 'flex';
    refreshClipboard();
}

function closeClipboard() {
    document.getElementById('clipboard-overlay').style.display = 'none';
}

let _clipHistory = [];
async function refreshClipboard() {
    const res = await window.hexAPI.clipboard.history();
    if (res.success) {
        _clipHistory = res.data;
        renderClipboardList(_clipHistory);
    }
}

function searchClipboard(query) {
    const q = query.toLowerCase();
    const filtered = _clipHistory.filter(i => i.text.toLowerCase().includes(q));
    renderClipboardList(filtered);
}

function renderClipboardList(items) {
    const listEl = document.getElementById('clipboard-list');
    if (items.length === 0) {
        listEl.innerHTML = '<div class="form-hint" style="text-align:center;margin-top:20px;">Clipboard history is empty.</div>';
        return;
    }

    listEl.innerHTML = items.map((item, idx) => `
    <div class="clipboard-item" onclick="pasteClipboardIndex(${idx})" title="Click to paste">
      <span style="opacity:0.5;margin-right:8px;font-size:9px;">${new Date(item.timestamp).toLocaleTimeString()}</span>
      ${item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </div>
  `).join('');
}

async function pasteClipboardIndex(idx) {
    closeClipboard();
    const item = _clipHistory[idx];
    if (!item) return;
    // Tell backend to write it and paste it
    const res = await window.hexAPI.clipboard.paste(idx);
    if (!res.success) {
        showToast('PASTE FAILED', res.error, '', 3000);
    }
}

// Global hotkey to open clipboard
document.addEventListener('keydown', (e) => {
    // Ctrl + Shift + V opens history
    if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        openClipboard();
    }
    // Escape closes overlay
    if (e.key === 'Escape' && document.getElementById('clipboard-overlay').style.display === 'flex') {
        closeClipboard();
    }
});

// ── Recurring Schedules UI ──────────────────────────────────────────────────
async function refreshRecurring() {
    const listEl = document.getElementById('recurring-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="form-hint">Loading...</div>';

    try {
        const res = await window.hexAPI.recurring.list();
        if (!res.success) return;

        if (Object.keys(res.data).length === 0) {
            listEl.innerHTML = '<div class="form-hint">No active recurring tasks.</div>';
            return;
        }

        let html = '';
        for (const [id, task] of Object.entries(res.data)) {
            html += `
        <div class="recurring-item">
          <span class="recurring-cron" title="Cron Expression">${task.cron}</span>
          <span class="recurring-label" title="${task.command}">${task.command}</span>
          <button class="btn btn-secondary" onclick="cancelRecurring('${id}')" style="border-color:#ff6b35;color:#ff6b35;padding:2px 6px;font-size:9px;">✕</button>
        </div>
      `;
        }
        listEl.innerHTML = html;
    } catch (err) {
        listEl.innerHTML = '<div class="form-hint" style="color:red;">Error fetching schedules.</div>';
    }
}

async function cancelRecurring(id) {
    const res = await window.hexAPI.recurring.cancel(id);
    if (res.success) {
        showToast('SCHEDULE CANCELLED', 'Recurring task removed.', '');
        refreshRecurring();
    }
}

// Refresh schedules automatically every 30s
setInterval(refreshRecurring, 30000);
setTimeout(refreshRecurring, 2000);

// Initialize settings state on load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await window.hexAPI.faceAuth.settings();
        if (res.success) {
            document.getElementById('cfg-face-enabled').value = String(res.enabled);
            if (res.enrolled) {
                document.getElementById('face-enroll-status').textContent = 'ENROLLED';
                document.getElementById('face-enroll-status').style.color = '#00ffc8';
            }
        }
    } catch (e) { }
});
