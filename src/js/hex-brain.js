'use strict';
// ── hex-brain.js — Adaptive Intelligence System v1.0 ─────────────────────────
// Phase 15: Self-reflection, session summarization, and evolving user profile.
//
// Architecture:
//   1. SESSION SUMMARIZER — After each chat session, compresses conversation into
//      2-3 bullet points stored permanently in hex-profile.json
//   2. SELF-REFLECTION — Daily routine that analyzes all session summaries and
//      action outcomes to extract patterns and learnings
//   3. USER PROFILE — Growing knowledge base injected into every system prompt
//
// Data stored in: %APPDATA%/softcurse-hex/hex-profile.json

class HexBrain {
    constructor() {
        this.profile = {
            version: 1,
            createdAt: null,
            lastReflection: null,
            dayNumber: 0,

            // ── User Model ──
            user: {
                expertise: 'unknown',        // novice | intermediate | expert
                preferredLanguage: 'en',
                communicationStyle: 'unknown', // terse | balanced | verbose
                activeHours: [],              // e.g. ["09:00-12:00", "20:00-23:00"]
                corrections: [],              // things user corrected HEX about
            },

            // ── Learned Preferences ──
            preferences: {
                favoriteApps: [],     // e.g. ["vscode", "brave", "spotify"]
                favoriteActions: [],  // most-used action tags
                dislikedBehaviors: [],// things user told HEX to stop doing
            },

            // ── Action Intelligence ──
            actionStats: {
                // "open_app:spotify": { attempts: 5, successes: 4, lastFail: "not found" }
            },

            // ── Session Summaries ──
            sessionHistory: [],  // last 30 session summaries
            // { date, summary, mood, topActions, messageCount }

            // ── Reflections ──
            insights: [],  // daily reflections (max 50)
            // { date, insight, confidence }
        };

        this._dirty = false;
        this.onLog = null;
    }

    _log(msg) {
        if (this.onLog) this.onLog(msg);
    }

    // ── LOAD / SAVE ────────────────────────────────────────────────────────────

    async load() {
        try {
            const saved = await window.hexAPI.brain.load();
            if (saved) {
                this.profile = { ...this.profile, ...saved };
                this._log(`Brain loaded: Day ${this.profile.dayNumber}, ${this.profile.insights.length} insights, ${this.profile.sessionHistory.length} sessions`);
            } else {
                this.profile.createdAt = new Date().toISOString();
                this._dirty = true;
                this._log('Brain initialized — Day 0. Learning begins now.');
            }
        } catch (e) {
            this._log('Brain load error: ' + e.message);
        }
    }

    async save() {
        if (!this._dirty) return;
        try {
            await window.hexAPI.brain.save(this.profile);
            this._dirty = false;
        } catch (e) {
            this._log('Brain save error: ' + e.message);
        }
    }

    // ── SESSION SUMMARIZER ─────────────────────────────────────────────────────
    // Called when user closes HEX or after N minutes of inactivity

    async summarizeSession(chatHistory) {
        if (!chatHistory || chatHistory.length < 2) return;

        const messageCount = chatHistory.length;
        const userMessages = chatHistory.filter(m => m.role === 'user').map(m => m.content);
        const aiMessages = chatHistory.filter(m => m.role === 'assistant').map(m => m.content);

        // Extract action tags used
        const actionPattern = /\[ACTION:([^\]]+)\]/g;
        const actions = [];
        for (const msg of aiMessages) {
            let match;
            while ((match = actionPattern.exec(msg)) !== null) {
                actions.push(match[1].split(':')[0]);
            }
        }
        const topActions = [...new Set(actions)].slice(0, 5);

        // Detect user mood from messages
        const allUserText = userMessages.join(' ').toLowerCase();
        let mood = 'neutral';
        if (/thank|great|perfect|awesome|nice/.test(allUserText)) mood = 'positive';
        else if (/wrong|bad|fix|broken|error|cant|can't|doesn't|doesn't/.test(allUserText)) mood = 'frustrated';
        else if (/how|what|why|explain|tell me/.test(allUserText)) mood = 'curious';

        // Build a compressed summary
        const topics = this._extractTopics(userMessages);
        const summary = topics.length > 0
            ? `User discussed: ${topics.join(', ')}. Mood: ${mood}. ${messageCount} messages exchanged.`
            : `${messageCount} messages exchanged. Mood: ${mood}.`;

        // Add to session history (keep last 30)
        this.profile.sessionHistory.push({
            date: new Date().toISOString(),
            summary,
            mood,
            topActions,
            messageCount,
        });
        if (this.profile.sessionHistory.length > 30) {
            this.profile.sessionHistory = this.profile.sessionHistory.slice(-30);
        }

        // Update user expertise based on message complexity
        this._updateExpertise(userMessages);

        // Track action preferences
        for (const act of actions) {
            if (!this.profile.preferences.favoriteActions.includes(act)) {
                this.profile.preferences.favoriteActions.push(act);
            }
        }
        // Keep top 15 most-used
        this.profile.preferences.favoriteActions = this.profile.preferences.favoriteActions.slice(-15);

        this._dirty = true;
        await this.save();
        this._log(`Session summarized: ${summary}`);
    }

    _extractTopics(userMessages) {
        const topics = [];
        const allText = userMessages.join(' ').toLowerCase();
        const TOPIC_PATTERNS = [
            { pattern: /open|launch|start/i, topic: 'app launching' },
            { pattern: /file|folder|directory|desktop/i, topic: 'file management' },
            { pattern: /install|update|upgrade/i, topic: 'software management' },
            { pattern: /cpu|ram|memory|disk|temperature/i, topic: 'system monitoring' },
            { pattern: /code|script|program|function|debug/i, topic: 'programming' },
            { pattern: /music|song|spotify|play/i, topic: 'media' },
            { pattern: /weather|time|date|clock/i, topic: 'utilities' },
            { pattern: /setting|config|preference/i, topic: 'configuration' },
            { pattern: /ai|model|provider|key/i, topic: 'AI configuration' },
            { pattern: /network|wifi|internet|speed/i, topic: 'networking' },
            { pattern: /game|steam|epic/i, topic: 'gaming' },
            { pattern: /search|browse|scrape|web/i, topic: 'web browsing' },
        ];
        for (const { pattern, topic } of TOPIC_PATTERNS) {
            if (pattern.test(allText) && !topics.includes(topic)) topics.push(topic);
        }
        return topics.slice(0, 4);
    }

    _updateExpertise(userMessages) {
        const allText = userMessages.join(' ').toLowerCase();
        const expertSignals = (allText.match(/pid|registry|powershell|bash|admin|sudo|grep|regex|ipc|api/gi) || []).length;
        const noviceSignals = (allText.match(/what is|how do i|i don't know|help me|can you/gi) || []).length;

        if (expertSignals > 3) this.profile.user.expertise = 'expert';
        else if (noviceSignals > 3) this.profile.user.expertise = 'novice';
        else if (expertSignals > 0) this.profile.user.expertise = 'intermediate';
    }

    // ── ACTION OUTCOME TRACKER ─────────────────────────────────────────────────
    // Called after each action outcome

    recordOutcome(actionTag, success, detail = '') {
        if (!this.profile.actionStats[actionTag]) {
            this.profile.actionStats[actionTag] = { attempts: 0, successes: 0, failures: [], lastFail: '' };
        }
        const stat = this.profile.actionStats[actionTag];
        stat.attempts++;
        if (success) {
            stat.successes++;
        } else {
            stat.lastFail = detail;
            stat.failures.push({ date: new Date().toISOString(), detail });
            // Keep only last 5 failures per action
            if (stat.failures.length > 5) stat.failures = stat.failures.slice(-5);
        }

        this._dirty = true;
    }

    // ── DAILY SELF‑REFLECTION ──────────────────────────────────────────────────
    // Called once per day (on first startup of the day)

    async reflect() {
        const today = new Date().toISOString().split('T')[0];
        if (this.profile.lastReflection === today) return; // Already reflected today

        this.profile.dayNumber++;
        this.profile.lastReflection = today;

        const recentSessions = this.profile.sessionHistory.slice(-7); // Last 7 sessions
        if (recentSessions.length === 0) {
            this._dirty = true;
            await this.save();
            return;
        }

        // Analyze patterns
        const insights = [];

        // 1. Mood trend
        const moods = recentSessions.map(s => s.mood);
        const frustrationCount = moods.filter(m => m === 'frustrated').length;
        if (frustrationCount >= 3) {
            insights.push({
                date: today,
                insight: 'User has been frequently frustrated recently. Prioritize accuracy and speed over explanations.',
                confidence: 0.8,
            });
        }

        // 2. Active hours detection
        const hours = recentSessions.map(s => new Date(s.date).getHours());
        const hourCounts = {};
        for (const h of hours) {
            const block = h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
            hourCounts[block] = (hourCounts[block] || 0) + 1;
        }
        const peakBlock = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
        if (peakBlock) {
            this.profile.user.activeHours = [peakBlock[0]];
        }

        // 3. Common topics
        const allSummaries = recentSessions.map(s => s.summary).join(' ');
        const topicCounts = {};
        this._extractTopics([allSummaries]).forEach(t => {
            topicCounts[t] = (topicCounts[t] || 0) + 1;
        });

        // 4. Action failure patterns
        const failedActions = Object.entries(this.profile.actionStats)
            .filter(([_, s]) => s.attempts > 2 && (s.successes / s.attempts) < 0.5)
            .map(([tag, s]) => `${tag} fails ${Math.round((1 - s.successes / s.attempts) * 100)}% of the time`);

        if (failedActions.length > 0) {
            insights.push({
                date: today,
                insight: `Frequently failing actions: ${failedActions.join('; ')}. Consider alternative approaches.`,
                confidence: 0.9,
            });
        }

        // 5. Communication style detection
        const avgMsgCount = recentSessions.reduce((s, x) => s + x.messageCount, 0) / recentSessions.length;
        if (avgMsgCount < 4) this.profile.user.communicationStyle = 'terse';
        else if (avgMsgCount > 15) this.profile.user.communicationStyle = 'verbose';
        else this.profile.user.communicationStyle = 'balanced';

        // Store insights (max 50)
        this.profile.insights.push(...insights);
        if (this.profile.insights.length > 50) {
            this.profile.insights = this.profile.insights.slice(-50);
        }

        this._dirty = true;
        await this.save();

        if (insights.length > 0) {
            this._log(`Day ${this.profile.dayNumber} reflection: ${insights.length} new insight(s)`);
        } else {
            this._log(`Day ${this.profile.dayNumber} reflection complete. No new patterns detected.`);
        }
    }

    // ── PROFILE CONTEXT FOR SYSTEM PROMPT ──────────────────────────────────────
    // Returns a compact block injected into every AI prompt

    getProfileContext() {
        const p = this.profile;
        const lines = [];

        lines.push(`HEX Day: ${p.dayNumber} | Created: ${p.createdAt ? p.createdAt.split('T')[0] : 'today'}`);

        // User model
        if (p.user.expertise !== 'unknown') {
            lines.push(`User expertise: ${p.user.expertise.toUpperCase()}`);
        }
        if (p.user.communicationStyle !== 'unknown') {
            lines.push(`Communication style: ${p.user.communicationStyle} — match accordingly`);
        }
        if (p.user.activeHours.length > 0) {
            lines.push(`User typically active: ${p.user.activeHours.join(', ')}`);
        }

        // Preferences
        if (p.preferences.favoriteApps.length > 0) {
            lines.push(`Favorite apps: ${p.preferences.favoriteApps.join(', ')}`);
        }
        if (p.preferences.dislikedBehaviors.length > 0) {
            lines.push(`User dislikes: ${p.preferences.dislikedBehaviors.join('; ')}`);
        }

        // Recent insights
        const recentInsights = p.insights.slice(-5);
        if (recentInsights.length > 0) {
            lines.push('');
            lines.push('Recent self-observations:');
            for (const ins of recentInsights) {
                lines.push(`  • ${ins.insight}`);
            }
        }

        // Action intelligence (top failures)
        const warnings = Object.entries(p.actionStats)
            .filter(([_, s]) => s.attempts > 2 && s.lastFail)
            .sort((a, b) => b[1].attempts - a[1].attempts)
            .slice(0, 3)
            .map(([tag, s]) => `${tag}: last failure was "${s.lastFail}"`);

        if (warnings.length > 0) {
            lines.push('');
            lines.push('Action warnings (from past experience):');
            for (const w of warnings) lines.push(`  ⚠ ${w}`);
        }

        // Recent session context
        const lastSession = p.sessionHistory[p.sessionHistory.length - 1];
        if (lastSession) {
            lines.push('');
            lines.push(`Last session: ${lastSession.summary}`);
        }

        return lines.length > 1 ? lines.join('\n') : '';
    }

    // ── TRACK USER CORRECTION ──────────────────────────────────────────────────

    recordCorrection(wrongThing, correction) {
        this.profile.user.corrections.push({
            date: new Date().toISOString(),
            wrong: wrongThing,
            correct: correction,
        });
        // Keep last 20
        if (this.profile.user.corrections.length > 20) {
            this.profile.user.corrections = this.profile.user.corrections.slice(-20);
        }
        this._dirty = true;
    }

    // ── TRACK FAVORITE APP ─────────────────────────────────────────────────────

    trackApp(appName) {
        const name = appName.toLowerCase().trim();
        if (!this.profile.preferences.favoriteApps.includes(name)) {
            this.profile.preferences.favoriteApps.push(name);
            // Keep top 15
            if (this.profile.preferences.favoriteApps.length > 15) {
                this.profile.preferences.favoriteApps = this.profile.preferences.favoriteApps.slice(-15);
            }
            this._dirty = true;
        }
    }
}

// Singleton
window.hexBrain = new HexBrain();
