'use strict';

window.hexCloudSync = {
  _profile: null,
  _status: null,
  _lastLivePushAt: 0,
  _hydrated: false,
  _timeoutMs: 2500,
  _contextPacketCache: null,
  _lastGoodContextPacket: null,
  _contextPacketRefresh: null,
  _degraded: false,
  _lastCloudNoticeAt: {},

  _withTimeout(promise, label = 'cloud request', timeoutMs = this._timeoutMs) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        setTimeout(() => resolve({ success: false, error: `${label} timed out` }), timeoutMs);
      })
    ]);
  },

  runDetached(label, task) {
    Promise.resolve()
      .then(() => (typeof task === 'function' ? task() : task))
      .catch((error) => {
        this._markDegraded(error?.message || error || 'unknown error', { label: label + ' failed' });
      });
  },

  _isAuthError(error) {
    return /unauthorized|access token|HEX_API_TOKEN|401/i.test(String(error || ''));
  },

  _isSoftFailure(error) {
    return /timed out|timeout|failed to fetch|network|load failed|temporarily/i.test(String(error || ''));
  },

  _noticeCloud(label, error, level = 'warn', cooldownMs = 60000) {
    const message = String(error || 'unknown error');
    const key = label + '::' + (this._isAuthError(message) ? 'auth' : (this._isSoftFailure(message) ? 'soft' : 'hard'));
    if (!this._isAuthError(message)) {
      const last = this._lastCloudNoticeAt[key] || 0;
      if (Date.now() - last < cooldownMs) return false;
      this._lastCloudNoticeAt[key] = Date.now();
    }
    addLog('CLOUD', `${label}: ${message}`, level);
    return true;
  },

  _markDegraded(reason, options = {}) {
    this._degraded = true;
    const soft = this._isSoftFailure(reason);
    const suffix = options.usingLastGood ? ' Using last-good context.' : '';
    this._noticeCloud(options.label || 'Cloud degraded', String(reason || 'temporary cloud issue') + suffix, 'warn', soft ? 90000 : 30000);
  },

  _markHealthy(label = 'Cloud continuity channel online.') {
    const wasDegraded = this._degraded;
    this._degraded = false;
    if (wasDegraded) addLog('CLOUD', 'Cloud continuity restored.');
    else if (label) addLog('CLOUD', label);
  },
  async init() {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return;

    const health = await this._withTimeout(
      window.hexAPI.cloud.health().catch((error) => ({ success: false, error: error.message })),
      'health check'
    );
    if (!health?.success) {
      this._markDegraded(health?.error || 'health check failed', { label: 'Cloud continuity offline' });
      return;
    }

    await this.resolveProfile();
    await this.hydrateSessionContext();
    this._markHealthy('Cloud continuity channel online.');
  },

  isEnabled() {
    return !!(window._hexConfig?.cloud?.enabled && window._hexConfig?.cloud?.serverUrl);
  },

  _invalidateContextCache() {
    this._contextPacketCache = null;
  },

  _makeContextScopeKey(localState = {}) {
    const profileId = config?.cloud?.profileId || '';
    const sessionId = config?.cloud?.sessionId || '';
    const deviceId = config?.cloud?.deviceId || '';
    const surface = localState?.sessionContext?.activeSurface || 'chat';
    const goal = localState?.sessionContext?.primaryGoal || '';
    return [profileId, sessionId, deviceId, surface, goal].join('::');
  },

  _makeContextCacheKey(query, localState = {}) {
    const profileId = config?.cloud?.profileId || '';
    const sessionId = config?.cloud?.sessionId || '';
    const deviceId = config?.cloud?.deviceId || '';
    const surface = localState?.sessionContext?.activeSurface || 'chat';
    const goal = localState?.sessionContext?.primaryGoal || '';
    return [profileId, sessionId, deviceId, surface, goal, String(query || '').trim().toLowerCase()].join('::');
  },

  _canReuseContextPacket(query, localState = {}) {
    if (!window.hexPerformancePolicy?.isLite?.()) return false;
    if (window.hexPerformancePolicy?.needsDesktopContext?.(query)) return false;
    const actionPlan = localState?.brainPreflightPlan;
    if (actionPlan?.providerNeeded) return false;
    const domain = String(actionPlan?.domain || '').toLowerCase();
    return !(domain.includes('desktop') || domain.includes('browser'));
  },

  _cacheContextPacket(cacheKey, localState, packet) {
    this._contextPacketCache = {
      key: cacheKey,
      scopeKey: this._makeContextScopeKey(localState || {}),
      packet,
      at: Date.now()
    };
    this._lastGoodContextPacket = {
      scopeKey: this._makeContextScopeKey(localState || {}),
      packet,
      at: Date.now()
    };
  },

  _getReusableContextPacket(query, localState = {}) {
    if (!this._canReuseContextPacket(query, localState)) return null;
    const cache = this._contextPacketCache;
    if (!cache?.packet) return null;
    if (cache.scopeKey !== this._makeContextScopeKey(localState || {})) return null;
    return (Date.now() - cache.at) < 120000 ? cache.packet : null;
  },

  _refreshContextPacketDetached(payload, cacheKey, localState) {
    if (this._contextPacketRefresh) return;
    this._contextPacketRefresh = this._withTimeout(
      window.hexAPI.cloud.getContextPacket(payload).catch((error) => ({ success: false, error: error.message })),
      'background context packet',
      3000
    ).then((result) => {
      if (result?.success && result.packet) {
        window.hexCloudContextRehydrator?.applyPacket?.(result.packet);
        this._cacheContextPacket(cacheKey, localState || {}, result.packet);
      }
    }).finally(() => { this._contextPacketRefresh = null; });
  },
  async resolveProfile(overrides = {}) {
    if (!this.isEnabled()) return null;
    const result = await this._withTimeout(
      window.hexAPI.cloud.resolveProfile({
        displayName: overrides.displayName || config?.userName || 'Operator',
        language: overrides.language || config?.language || 'ka',
        assistantMode: overrides.assistantMode || currentMode || config?.mode || 'hex',
        personaId: overrides.personaId || window.hexPersonalities?.activeId || null,
        registration: overrides.registration || null,
        device: overrides.device || null
      }).catch((error) => ({ success: false, error: error.message })),
      'profile resolve'
    );

    if (!result?.success || !result.profile) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Profile resolve failed' });
      return null;
    }

    config.cloud = config.cloud || {};
    config.cloud.profileId = result.profile.id;
    window._hexConfig.cloud = { ...(window._hexConfig.cloud || {}), profileId: result.profile.id };
    this._profile = result.profile;
    this._invalidateContextCache();
    return result.profile;
  },

  async hydrateSessionContext() {
    if (!this.isEnabled() || config?.onboarding?.completed === false || this._hydrated) return;
    const profileId = config?.cloud?.profileId;
    if (!profileId) return;

    const continuityRes = await this._withTimeout(
      window.hexAPI.cloud.getContinuity({ profileId }).catch((error) => ({ success: false, error: error.message })),
      'continuity hydrate'
    );
    const packet = continuityRes?.success ? continuityRes.continuity : null;
    const remote = packet?.session || null;
    const browser = packet?.browser || null;

    if (!remote) return;

    window.hexContextState?.hydrateRemote?.(remote, browser);
    window.hexCloudContextRehydrator?.applyPacket?.(packet);
    if (window.hexMemory && remote.primaryGoal) {
      window.hexMemory.updateWorking({
        currentTask: remote.primaryGoal,
        currentEntities: window.hexContextState?.extractSessionEntities?.([
          remote.primaryGoal,
          remote.lastUserMessage,
          remote.lastAssistantMessage,
          browser?.title,
          browser?.url
        ].filter(Boolean).join(' ')) || []
      });
    }

    this._hydrated = true;
    addLog('CLOUD', 'Restored live continuity from cloud session.');
  },

  async getContextPacket(query, localState = null) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return null;
    if (!config?.cloud?.profileId) {
      await this.resolveProfile();
    }
    if (!config?.cloud?.profileId) return null;

    const cacheKey = this._makeContextCacheKey(query, localState || {});
    const now = Date.now();
    if (this._contextPacketCache && this._contextPacketCache.key === cacheKey && (now - this._contextPacketCache.at) < 10000) {
      return this._contextPacketCache.packet;
    }

    const payload = {
      profileId: config?.cloud?.profileId,
      sessionId: config?.cloud?.sessionId || null,
      deviceId: config?.cloud?.deviceId || null,
      query: query || '',
      surface: localState?.sessionContext?.activeSurface || 'chat'
    };

    const reusable = this._getReusableContextPacket(query, localState || {});
    if (reusable) {
      this._refreshContextPacketDetached(payload, cacheKey, localState || {});
      return reusable;
    }

    const timeoutMs = window.hexPerformancePolicy?.isLite?.() ? 1400 : this._timeoutMs;
    const result = await this._withTimeout(
      window.hexAPI.cloud.getContextPacket(payload).catch((error) => ({ success: false, error: error.message })),
      'context packet',
      timeoutMs
    );

    if (!result?.success || !result.packet) {
      const error = result?.error || 'unknown error';
      const lastGood = this._lastGoodContextPacket;
      if (lastGood?.packet && lastGood.scopeKey === this._makeContextScopeKey(localState || {}) && this._isSoftFailure(error)) {
        this._markDegraded(error, { label: 'Context packet degraded', usingLastGood: true });
        return lastGood.packet;
      }
      this._markDegraded(error, { label: 'Context packet failed' });
      return null;
    }

    window.hexCloudContextRehydrator?.applyPacket?.(result.packet);
    this._cacheContextPacket(cacheKey, localState || {}, result.packet);
    this._markHealthy('');
    return result.packet;
  },


  async rememberFact(content, options = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return false;
    const fact = String(content || '').trim();
    if (!fact) return false;
    if (!config?.cloud?.profileId) {
      await this.resolveProfile();
    }
    if (!config?.cloud?.profileId) return false;

    const result = await this._withTimeout(
      window.hexAPI.cloud.rememberFact({
        profileId: config?.cloud?.profileId,
        sessionId: config?.cloud?.sessionId || null,
        kind: options.kind || 'explicit',
        content: fact,
        confidence: options.confidence || 0.97,
        tags: Array.isArray(options.tags) ? options.tags : ['explicit', 'desktop', 'remember']
      }).catch((error) => ({ success: false, error: error.message })),
      'memory write'
    );

    if (!result?.success) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Memory write failed' });
      return false;
    }

    this._invalidateContextCache();
    addLog('CLOUD', 'Memory synced to server: ' + fact.slice(0, 80));
    return result.memory || true;
  },


  async syncDeviceInventory(inventory) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return false;
    if (!config?.cloud?.profileId) {
      await this.resolveProfile();
    }
    if (!config?.cloud?.profileId) return false;

    const result = await this._withTimeout(
      window.hexAPI.cloud.syncDeviceInventory({
        profileId: config?.cloud?.profileId,
        sessionId: config?.cloud?.sessionId || null,
        deviceId: config?.cloud?.deviceId || null,
        inventory: inventory || {}
      }).catch((error) => ({ success: false, error: error.message })),
      'device inventory sync',
      4000
    );

    if (!result?.success) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Device inventory sync failed' });
      return false;
    }

    this._invalidateContextCache();
    return true;
  },
  async ensureSession(systemState) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return null;
    if (!config?.cloud?.profileId) {
      await this.resolveProfile();
    }
    if (!config?.cloud?.profileId) return null;

    const result = await this._withTimeout(
      window.hexAPI.cloud.ensureSession({
        profileId: config?.cloud?.profileId,
        title: 'HEX Live Session',
        currentGoal: systemState?.sessionContext?.primaryGoal || window.hexSessionContext.primaryGoal || null,
        currentSurface: systemState?.sessionContext?.activeSurface || 'chat',
        browserUrl: systemState?.browserSession?.url || null,
        browserTitle: systemState?.browserSession?.title || null,
        lastUserMessage: systemState?.sessionContext?.lastUserMessage || null,
        lastAssistantMessage: systemState?.sessionContext?.lastAssistantMessage || null,
        deviceHostname: this._systemInfo?.hostname || null,
        devicePlatform: this._systemInfo?.platform || navigator.platform || null,
        deviceOs: this._systemInfo?.os?.distro || this._systemInfo?.os?.platform || null,
        localIps: Array.isArray(this._systemInfo?.localIps) ? this._systemInfo.localIps : []
      }).catch((error) => ({ success: false, error: error.message })),
      'session ensure'
    );

    if (!result?.success) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Session ensure failed' });
      return null;
    }

    config.cloud = config.cloud || {};
    config.cloud.sessionId = result.sessionId;
    config.cloud.deviceId = result.deviceId;
    window._hexConfig.cloud = {
      ...(window._hexConfig.cloud || {}),
      sessionId: result.sessionId,
      deviceId: result.deviceId
    };
    this._invalidateContextCache();
    return result;
  },

  async pushLiveSessionSnapshot(systemState, extra = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return false;

    const now = Date.now();
    if (!extra.force && now - this._lastLivePushAt < 1500) return false;

    const profileId = config?.cloud?.profileId;
    if (!profileId) return false;

    const result = await this._withTimeout(
      window.hexAPI.cloud.setLiveSession({
        profileId,
        sessionId: config?.cloud?.sessionId || null,
        deviceId: config?.cloud?.deviceId || null,
        primaryGoal: systemState?.sessionContext?.primaryGoal || window.hexSessionContext.primaryGoal || '',
        lastUserMessage: systemState?.sessionContext?.lastUserMessage || window.hexSessionContext.lastUserMessage || '',
        lastAssistantMessage: systemState?.sessionContext?.lastAssistantMessage || window.hexSessionContext.lastAssistantMessage || '',
        lastActionSummary: systemState?.sessionContext?.lastActionSummary || window.hexSessionContext.lastActionSummary || '',
        lastSystemDataSummary: systemState?.sessionContext?.lastSystemDataSummary || window.hexSessionContext.lastSystemDataSummary || '',
        activeSurface: systemState?.sessionContext?.activeSurface || window.hexSessionContext.activeSurface || 'chat',
        browserOpen: !!systemState?.browserSession?.open,
        browserUrl: systemState?.browserSession?.url || null,
        browserTitle: systemState?.browserSession?.title || null,
        desktopContext: systemState?.desktopContext || null,
        workingMemory: systemState?.workingMemory || null,
        recentTurns: systemState?.recentTurns || []
      }).then(() => ({ success: true })).catch((error) => ({ success: false, error: error.message })),
      'live session push'
    );

    if (!result?.success) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Live session sync failed' });
      return false;
    }

    this._lastLivePushAt = now;
    this._invalidateContextCache();
    return true;
  },

  async recordActivity(activity = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return false;
    const profileId = config?.cloud?.profileId;
    if (!profileId || !activity.summary) return false;
    const result = await this._withTimeout(
      window.hexAPI.cloud.recordActivity({
        profileId,
        sessionId: config?.cloud?.sessionId || null,
        deviceId: config?.cloud?.deviceId || null,
        kind: activity.kind || 'action',
        status: activity.status || 'unknown',
        surface: activity.surface || window.hexSessionContext?.activeSurface || 'chat',
        actionType: activity.actionType || null,
        summary: String(activity.summary).slice(0, 500),
        details: activity.details || null,
        createdAt: activity.createdAt || new Date().toISOString()
      }).catch((error) => ({ success: false, error: error.message })),
      'activity sync'
    );
    if (result?.success) this._invalidateContextCache();
    return result?.success === true;
  },
  async pushTurn(role, content, systemState, metadata = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false || !content) return false;
    let sessionId = config?.cloud?.sessionId || null;
    if (!sessionId) {
      const session = await this.ensureSession(systemState);
      sessionId = session?.sessionId || null;
    }
    if (!sessionId) return false;

    this.runDetached('live session refresh', () => this.pushLiveSessionSnapshot(systemState));
    const result = await this._withTimeout(
      window.hexAPI.cloud.pushMessage({
        profileId: config?.cloud?.profileId,
        sessionId,
        role,
        surface: systemState?.sessionContext?.activeSurface || 'chat',
        content,
        summary: metadata.summary || null,
        metadata
      }).catch((error) => ({ success: false, error: error.message })),
      'message sync'
    );

    if (!result?.success) {
      this._markDegraded(result?.error || 'unknown error', { label: 'Message sync failed' });
      return false;
    }

    this._invalidateContextCache();
    return true;
  }
};
