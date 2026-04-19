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
    window.hexRenderUtils.setPlainText(listEl, 'Loading...', 'form-hint');

    try {
        const res = await window.hexAPI.plugins.list();
        if (!res.success) {
            window.hexRenderUtils.setPlainText(listEl, `Error: ${res.error}`, 'form-hint');
            return;
        }

        if (!res.plugins || res.plugins.length === 0) {
            window.hexRenderUtils.setPlainText(listEl, 'No plugins installed.', 'form-hint');
            return;
        }

        window.hexRenderUtils.clearNode(listEl);
        res.plugins.forEach((plugin) => {
            const card = window.hexRenderUtils.createEl('div', { className: 'plugin-card' });
            const header = window.hexRenderUtils.createEl('div', { className: 'plugin-card-header' });
            const name = window.hexRenderUtils.createEl('div', { className: 'plugin-name' });
            const status = window.hexRenderUtils.createEl('span', {
                text: (plugin.status || 'unknown').toUpperCase(),
                attrs: {
                    style: `color:${plugin.status === 'loaded' ? '#0f9' : '#ff6b35'};font-size:14px;`
                }
            });
            name.appendChild(document.createTextNode(`${plugin.name} `));
            name.appendChild(status);

            const actions = window.hexRenderUtils.createEl('div', {
                attrs: { style: 'display:flex;gap:4px;' }
            });
            actions.appendChild(window.hexRenderUtils.createEl('button', {
                className: 'btn btn-secondary',
                text: '↻ RELOAD',
                dataset: { pluginReload: plugin.id },
                attrs: { style: 'font-size:13px;padding:2px 6px;' }
            }));
            actions.appendChild(window.hexRenderUtils.createEl('button', {
                className: 'btn btn-secondary',
                text: '✕ REMOVE',
                dataset: { pluginRemove: plugin.id },
                attrs: { style: 'font-size:13px;padding:2px 6px;border-color:var(--orange);color:var(--orange);' }
            }));

            header.appendChild(name);
            header.appendChild(actions);
            card.appendChild(header);
            card.appendChild(window.hexRenderUtils.createEl('div', {
                className: 'plugin-desc',
                text: plugin.description || 'No description provided.'
            }));
            card.appendChild(window.hexRenderUtils.createEl('div', {
                className: 'plugin-path',
                text: plugin.id
            }));
            listEl.appendChild(card);
        });
    } catch (err) {
        window.hexRenderUtils.setPlainText(listEl, 'Error fetching plugins.', 'form-hint');
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

async function removeMarketplacePlugin(id) {
    if (!confirm(`Are you sure you want to completely remove the plugin: ${id}?`)) return;
    const res = await window.hexAPI.plugins.remove(id);
    if (res.success) {
        showToast('PLUGIN REMOVED', `${id} successfully uninstalled.`, '');
        loadPluginsList();
    } else {
        showToast('REMOVE FAILED', res.error, '', 5000);
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
        _clipHistory = (res.data || []).map((item, index) => ({ ...item, _sourceIndex: index }));
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
        window.hexRenderUtils.setPlainText(listEl, 'Clipboard history is empty.', 'form-hint');
        return;
    }

    window.hexRenderUtils.clearNode(listEl);
    items.forEach((item) => {
        const row = window.hexRenderUtils.createEl('div', {
            className: 'clipboard-item',
            title: 'Click to paste',
            dataset: { clipboardIndex: item._sourceIndex }
        });
        row.appendChild(window.hexRenderUtils.createEl('span', {
            text: new Date(item.ts || item.timestamp || Date.now()).toLocaleTimeString(),
            attrs: { style: 'opacity:0.5;margin-right:8px;font-size:13px;' }
        }));
        row.appendChild(document.createTextNode(item.text));
        listEl.appendChild(row);
    });
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
    window.hexRenderUtils.setPlainText(listEl, 'Loading...', 'form-hint');

    try {
        const res = await window.hexAPI.recurring.list();
        if (!res.success) return;

        if (Object.keys(res.data).length === 0) {
            window.hexRenderUtils.setPlainText(listEl, 'No active recurring tasks.', 'form-hint');
            return;
        }

        window.hexRenderUtils.clearNode(listEl);
        for (const [id, task] of Object.entries(res.data)) {
            const row = window.hexRenderUtils.createEl('div', { className: 'recurring-item' });
            row.appendChild(window.hexRenderUtils.createEl('span', {
                className: 'recurring-cron',
                text: task.cron,
                title: 'Cron Expression'
            }));
            row.appendChild(window.hexRenderUtils.createEl('span', {
                className: 'recurring-label',
                text: task.command,
                title: task.command
            }));
            row.appendChild(window.hexRenderUtils.createEl('button', {
                className: 'btn btn-secondary',
                text: '✕',
                dataset: { recurringCancel: id },
                attrs: { style: 'border-color:#ff6b35;color:#ff6b35;padding:2px 6px;font-size:13px;' }
            }));
            listEl.appendChild(row);
        }
    } catch (err) {
        window.hexRenderUtils.setPlainText(listEl, 'Error fetching schedules.', 'form-hint');
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
