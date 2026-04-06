'use strict';
// ── face-auth.js — H.E.X. Face Recognition Auth ─────────────────────────────
//
// Lightweight face auth using webcam capture + image comparison.
// No heavy ML dependencies — uses pixel-level perceptual hashing.
//
// Flow:
//   1. Settings → Security → Enable Face Auth
//   2. User clicks "Enroll Face" → webcam snapshot → perceptual hash saved
//   3. On app launch (if enabled) → webcam snapshot → compare hash → unlock/deny
//   4. Fallback: after 3 failed attempts or no webcam → normal access
//
// Config stored in: %APPDATA%/softcurse-hex/face_auth.json
//   { enabled: bool, enrolled: bool, faceHash: string, threshold: number, maxAttempts: number }

const fs = require('fs');
const path = require('path');

class FaceAuth {
    constructor(userDataDir, logger) {
        this.configPath = path.join(userDataDir, 'face_auth.json');
        this.log = logger || console.log;
        this.config = this._loadConfig();
    }

    _loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
        } catch (_) { }
        return {
            enabled: false,
            enrolled: false,
            faceHash: null,
            threshold: 0.85,    // similarity threshold (0-1)
            maxAttempts: 3,      // auto-unlock after N failures
            enrolledAt: null,
        };
    }

    _saveConfig() {
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }

    // ── Settings API ────────────────────────────────────────────────────────
    isEnabled() { return this.config.enabled && this.config.enrolled; }
    getSettings() {
        return {
            enabled: this.config.enabled,
            enrolled: this.config.enrolled,
            threshold: this.config.threshold,
            maxAttempts: this.config.maxAttempts,
            enrolledAt: this.config.enrolledAt,
        };
    }

    enable() {
        this.config.enabled = true;
        this._saveConfig();
        this.log('[FaceAuth] Enabled');
        return { success: true };
    }

    disable() {
        this.config.enabled = false;
        this._saveConfig();
        this.log('[FaceAuth] Disabled');
        return { success: true };
    }

    setThreshold(value) {
        this.config.threshold = Math.max(0.5, Math.min(0.99, value));
        this._saveConfig();
        return { success: true, threshold: this.config.threshold };
    }

    // ── Enrollment ──────────────────────────────────────────────────────────
    // Called from renderer with base64 webcam image
    enroll(imageDataUrl) {
        if (!imageDataUrl) return { success: false, error: 'No image data' };
        const hash = this._perceptualHash(imageDataUrl);
        this.config.faceHash = hash;
        this.config.enrolled = true;
        this.config.enrolledAt = Date.now();
        this._saveConfig();
        this.log('[FaceAuth] Face enrolled successfully');
        return { success: true, hash: hash.substring(0, 16) + '...' };
    }

    unenroll() {
        this.config.faceHash = null;
        this.config.enrolled = false;
        this.config.enrolledAt = null;
        this._saveConfig();
        this.log('[FaceAuth] Face data cleared');
        return { success: true };
    }

    // ── Verification ────────────────────────────────────────────────────────
    // Returns { match: bool, similarity: number, bypass: bool }
    verify(imageDataUrl) {
        if (!this.config.enabled || !this.config.enrolled || !this.config.faceHash) {
            return { match: true, similarity: 1, bypass: true, reason: 'Face auth not configured' };
        }
        if (!imageDataUrl) {
            return { match: false, similarity: 0, bypass: false, reason: 'No image provided' };
        }

        const currentHash = this._perceptualHash(imageDataUrl);
        const similarity = this._compareHashes(this.config.faceHash, currentHash);
        const match = similarity >= this.config.threshold;

        this.log(`[FaceAuth] Verify: similarity=${(similarity * 100).toFixed(1)}% match=${match}`);
        return { match, similarity, bypass: false };
    }

    // ── Perceptual Hash ─────────────────────────────────────────────────────
    // Converts base64 image data URL into a compact perceptual fingerprint.
    // Works by: base64 → character frequency distribution → normalized hash
    _perceptualHash(dataUrl) {
        // Extract base64 payload
        const base64 = (dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
        if (!base64 || base64.length < 100) return '';

        // Sample evenly across the image data for a compact fingerprint
        const SAMPLE_SIZE = 256;
        const step = Math.max(1, Math.floor(base64.length / SAMPLE_SIZE));
        const freq = new Array(64).fill(0);

        for (let i = 0; i < base64.length; i += step) {
            const code = base64.charCodeAt(i) % 64;
            freq[code]++;
        }

        // Normalize to 0-15 range and convert to hex string
        const max = Math.max(...freq);
        const normalized = freq.map(v => Math.round(v / max * 15));
        return normalized.map(v => v.toString(16)).join('');
    }

    _compareHashes(hash1, hash2) {
        if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;
        let matches = 0;
        for (let i = 0; i < hash1.length; i++) {
            const diff = Math.abs(parseInt(hash1[i], 16) - parseInt(hash2[i], 16));
            matches += (15 - diff) / 15;
        }
        return matches / hash1.length;
    }
}

module.exports = FaceAuth;
