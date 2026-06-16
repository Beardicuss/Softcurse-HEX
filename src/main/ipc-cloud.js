'use strict';
// ── main/ipc-cloud.js ─────────────────────────────────────────────────────────
// Optional cloud continuity bridge for the HEX server scaffold.

const crypto = require('crypto');

module.exports = function registerCloudIPC({
  ipcMain,
  getConfig,
  setConfig,
  saveConfig,
  sendLog,
}) {
  function getCloudConfig() {
    return getConfig()?.cloud || {};
  }

  function isEnabled() {
    const cloud = getCloudConfig();
    return !!(cloud.enabled && cloud.serverUrl);
  }

  function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getHeaders() {
    const cloud = getCloudConfig();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (cloud.accessToken) headers.Authorization = `Bearer ${cloud.accessToken}`;
    return headers;
  }

  function ensureDeviceId() {
    const cfg = getConfig();
    cfg.cloud = cfg.cloud || {};
    if (!cfg.cloud.deviceId) {
      cfg.cloud.deviceId = 'dev_' + crypto.randomUUID();
      setConfig(cfg);
      saveConfig(cfg);
    }
    return cfg.cloud.deviceId;
  }

  async function request(pathname, options = {}) {
    if (!isEnabled()) {
      throw new Error('Cloud continuity is disabled or server URL is missing.');
    }
    const baseUrl = normalizeBaseUrl(getCloudConfig().serverUrl);
    const response = await fetch(baseUrl + pathname, {
      method: options.method || 'GET',
      headers: {
        ...getHeaders(),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {}

    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `${response.status} ${response.statusText}`);
    }
    return payload;
  }

  ipcMain.handle('cloud:status', async () => {
    const cloud = getCloudConfig();
    return {
      enabled: !!cloud.enabled,
      serverUrl: cloud.serverUrl || '',
      profileId: cloud.profileId || '',
      sessionId: cloud.sessionId || '',
      deviceId: cloud.deviceId || '',
      ready: !!(cloud.enabled && cloud.serverUrl && cloud.profileId)
    };
  });

  ipcMain.handle('cloud:health', async () => {
    try {
      const result = await request('/api/health');
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:bootstrap', async () => {
    try {
      const result = await request('/api/bootstrap');
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:resolve-profile', async (_, payload = {}) => {
    const cfg = getConfig();
    cfg.cloud = cfg.cloud || {};
    ensureDeviceId();

    if (!isEnabled()) {
      return { success: false, error: 'Cloud continuity disabled.' };
    }

    if (cfg.cloud.profileId) {
      try {
        const existing = await request(`/api/profiles/${encodeURIComponent(cfg.cloud.profileId)}`);
        return { success: true, profile: existing.profile };
      } catch (error) {
        sendLog('CLOUD', `Profile lookup failed, recreating: ${error.message}`, 'warn');
      }
    }

    try {
      const created = await request('/api/profiles', {
        method: 'POST',
        body: {
          displayName: payload.displayName || cfg.userName || 'Operator',
          language: payload.language || cfg.language || 'ka',
          assistantMode: payload.assistantMode || cfg.mode || 'hex',
          personaId: payload.personaId || null,
          registration: payload.registration || null,
          device: payload.device || null
        }
      });
      cfg.cloud.profileId = created.profile?.id || '';
      setConfig(cfg);
      saveConfig(cfg);
      sendLog('CLOUD', `Resolved cloud profile: ${cfg.cloud.profileId}`, 'info');
      return { success: true, profile: created.profile };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:get-live-session', async (_, { profileId } = {}) => {
    try {
      const activeProfileId = profileId || getCloudConfig().profileId;
      if (!activeProfileId) return { success: false, error: 'No cloud profileId configured.' };
      const result = await request(`/api/live-session/${encodeURIComponent(activeProfileId)}`);
      return { success: true, session: result.session || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:get-continuity', async (_, { profileId } = {}) => {
    try {
      const activeProfileId = profileId || getCloudConfig().profileId;
      if (!activeProfileId) return { success: false, error: 'No cloud profileId configured.' };
      const result = await request(`/api/profiles/${encodeURIComponent(activeProfileId)}/continuity`);
      return { success: true, continuity: result.continuity || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:set-live-session', async (_, payload = {}) => {
    try {
      const activeProfileId = payload.profileId || getCloudConfig().profileId;
      if (!activeProfileId) return { success: false, error: 'No cloud profileId configured.' };
      const result = await request(`/api/live-session/${encodeURIComponent(activeProfileId)}`, {
        method: 'POST',
        body: payload
      });
      return { success: true, session: result.session || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:ensure-session', async (_, payload = {}) => {
    const cfg = getConfig();
    cfg.cloud = cfg.cloud || {};
    ensureDeviceId();

    try {
      const activeProfileId = payload.profileId || cfg.cloud.profileId;
      if (!activeProfileId) return { success: false, error: 'No cloud profileId configured.' };

      if (!cfg.cloud.sessionId) {
        const created = await request('/api/sessions', {
          method: 'POST',
          body: {
            profileId: activeProfileId,
            deviceId: cfg.cloud.deviceId,
            title: payload.title || 'Active Session',
            currentGoal: payload.currentGoal || null,
            currentSurface: payload.currentSurface || 'chat',
            browserUrl: payload.browserUrl || null,
            browserTitle: payload.browserTitle || null,
            lastUserMessage: payload.lastUserMessage || null,
            lastAssistantMessage: payload.lastAssistantMessage || null
          }
        });
        cfg.cloud.sessionId = created.session?.id || '';
        setConfig(cfg);
        saveConfig(cfg);
      }

      return {
        success: true,
        sessionId: cfg.cloud.sessionId,
        profileId: activeProfileId,
        deviceId: cfg.cloud.deviceId
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud:push-message', async (_, payload = {}) => {
    try {
      const cloud = getCloudConfig();
      const profileId = payload.profileId || cloud.profileId;
      const sessionId = payload.sessionId || cloud.sessionId;
      if (!profileId || !sessionId) {
        return { success: false, error: 'Missing cloud profile/session identifiers.' };
      }

      const result = await request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        body: {
          profileId,
          role: payload.role || 'user',
          surface: payload.surface || 'chat',
          content: payload.content || '',
          summary: payload.summary || null,
          metadata: payload.metadata || null
        }
      });
      return { success: true, message: result.message || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
};
