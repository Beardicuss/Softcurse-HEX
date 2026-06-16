'use strict';

window.hexCloudSync = {
  _profile: null,
  _status: null,
  _lastLivePushAt: 0,
  _hydrated: false,

  async init() {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return;

    const health = await window.hexAPI.cloud.health().catch(() => ({ success: false }));
    if (!health?.success) {
      addLog('CLOUD', `Cloud continuity offline: ${health?.error || 'health check failed'}`, 'warn');
      return;
    }

    await this.resolveProfile();
    await this.hydrateSessionContext();
    addLog('CLOUD', 'Cloud continuity channel online.');
  },

  isEnabled() {
    return !!(window._hexConfig?.cloud?.enabled && window._hexConfig?.cloud?.serverUrl);
  },

  async resolveProfile(overrides = {}) {
    if (!this.isEnabled()) return null;
    const result = await window.hexAPI.cloud.resolveProfile({
      displayName: overrides.displayName || config?.userName || 'Operator',
      language: overrides.language || config?.language || 'ka',
      assistantMode: overrides.assistantMode || currentMode || config?.mode || 'hex',
      personaId: overrides.personaId || window.hexPersonalities?.activeId || null,
      registration: overrides.registration || null,
      device: overrides.device || null
    }).catch((error) => ({ success: false, error: error.message }));

    if (!result?.success || !result.profile) {
      addLog('CLOUD', `Profile resolve failed: ${result?.error || 'unknown error'}`, 'warn');
      return null;
    }

    config.cloud = config.cloud || {};
    config.cloud.profileId = result.profile.id;
    window._hexConfig.cloud = { ...(window._hexConfig.cloud || {}), profileId: result.profile.id };
    this._profile = result.profile;
    return result.profile;
  },

  async hydrateSessionContext() {
    if (!this.isEnabled() || config?.onboarding?.completed === false || this._hydrated) return;
    const profileId = config?.cloud?.profileId;
    if (!profileId) return;

    const continuityRes = await window.hexAPI.cloud.getContinuity({ profileId }).catch((error) => ({
      success: false,
      error: error.message
    }));
    const packet = continuityRes?.success ? continuityRes.continuity : null;
    const remote = packet?.session || null;
    const browser = packet?.browser || null;

    if (!remote) return;

    if (remote.primaryGoal && !window.hexSessionContext.primaryGoal) {
      window.hexSessionContext.primaryGoal = remote.primaryGoal;
    }
    if (remote.lastUserMessage && !window.hexSessionContext.lastUserMessage) {
      window.hexSessionContext.lastUserMessage = remote.lastUserMessage;
    }
    if (remote.lastAssistantMessage && !window.hexSessionContext.lastAssistantMessage) {
      window.hexSessionContext.lastAssistantMessage = remote.lastAssistantMessage;
    }
    if (remote.lastActionSummary && !window.hexSessionContext.lastActionSummary) {
      window.hexSessionContext.lastActionSummary = remote.lastActionSummary;
    }
    if (remote.lastSystemDataSummary && !window.hexSessionContext.lastSystemDataSummary) {
      window.hexSessionContext.lastSystemDataSummary = remote.lastSystemDataSummary;
    }
    if (remote.activeSurface && window.hexSessionContext.activeSurface === 'chat') {
      window.hexSessionContext.activeSurface = remote.activeSurface;
    }
    if (browser?.open) {
      window.hexSessionContext.activeSurface = 'browser';
    }
    if (window.hexMemory && remote.primaryGoal) {
      window.hexMemory.updateWorking({
        currentTask: remote.primaryGoal,
        currentEntities: extractSessionEntities([
          remote.primaryGoal,
          remote.lastUserMessage,
          remote.lastAssistantMessage,
          browser?.title,
          browser?.url
        ].filter(Boolean).join(' '))
      });
    }

    this._hydrated = true;
    addLog('CLOUD', 'Restored live continuity from cloud session.');
  },

  async ensureSession(systemState) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return null;
    if (!config?.cloud?.profileId) {
      await this.resolveProfile();
    }

    const result = await window.hexAPI.cloud.ensureSession({
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
    }).catch((error) => ({ success: false, error: error.message }));

    if (!result?.success) {
      addLog('CLOUD', `Session ensure failed: ${result?.error || 'unknown error'}`, 'warn');
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
    return result;
  },

  async pushLiveSessionSnapshot(systemState, extra = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false) return;

    const now = Date.now();
    if (!extra.force && now - this._lastLivePushAt < 1500) return;

    const profileId = config?.cloud?.profileId;
    if (!profileId) return;

    await window.hexAPI.cloud.setLiveSession({
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
      workingMemory: systemState?.workingMemory || null,
      recentTurns: systemState?.recentTurns || []
    }).catch(() => null);

    this._lastLivePushAt = now;
  },

  async pushTurn(role, content, systemState, metadata = {}) {
    if (!this.isEnabled() || config?.onboarding?.completed === false || !content) return;
    const session = await this.ensureSession(systemState);
    if (!session?.sessionId) return;

    await this.pushLiveSessionSnapshot(systemState);
    const result = await window.hexAPI.cloud.pushMessage({
      profileId: config?.cloud?.profileId,
      sessionId: session.sessionId,
      role,
      surface: systemState?.sessionContext?.activeSurface || 'chat',
      content,
      summary: metadata.summary || null,
      metadata
    }).catch((error) => ({ success: false, error: error.message }));

    if (!result?.success) {
      addLog('CLOUD', `Message sync failed: ${result?.error || 'unknown error'}`, 'warn');
    }
  }
};
