'use strict';

window.hexOnboarding = {
  _systemInfo: null,

  shouldShow() {
    return !config?.onboarding?.completed;
  },

  async init() {
    if (!this.shouldShow()) return;
    this._systemInfo = await window.hexAPI.getSystemInfo().catch(() => null);
    this.prefill();
    this.open();
  },

  prefill() {
    const profile = config?.onboarding || {};
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };

    setValue('welcome-name', config?.userName || '');
    setValue('welcome-age', profile.age || '');
    setValue('welcome-country', profile.country || '');
    setValue('welcome-region', profile.region || '');
    setValue('welcome-city', profile.city || '');
    setValue('welcome-bio', profile.bio || '');
    setValue('welcome-interests', profile.interests || '');
    setValue('welcome-occupation', profile.occupation || '');
  },

  open() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'flex';
  },

  close() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  collect() {
    const read = (id) => document.getElementById(id)?.value?.trim() || '';
    return {
      name: read('welcome-name'),
      age: read('welcome-age'),
      country: read('welcome-country'),
      region: read('welcome-region'),
      city: read('welcome-city'),
      bio: read('welcome-bio'),
      interests: read('welcome-interests'),
      occupation: read('welcome-occupation')
    };
  },

  async submit() {
    const status = document.getElementById('welcome-status');
    const data = this.collect();

    if (!data.name || !data.age || !data.country || !data.region || !data.city) {
      if (status) status.textContent = 'Fill all required fields first.';
      return;
    }

    if (status) status.textContent = 'Creating profile and binding this device...';

    const nextConfig = {
      ...config,
      userName: data.name,
      onboarding: {
        completed: true,
        age: data.age,
        country: data.country,
        region: data.region,
        city: data.city,
        bio: data.bio,
        interests: data.interests,
        occupation: data.occupation
      }
    };

    config = nextConfig;
    window._hexConfig = nextConfig;
    await window.hexAPI.setConfig(nextConfig);

    if (window.hexCloudSync?.isEnabled()) {
      await window.hexCloudSync.resolveProfile({
        displayName: data.name,
        language: config.language || 'ka',
        assistantMode: currentMode || config.mode || 'hex',
        registration: {
          age: data.age,
          country: data.country,
          region: data.region,
          city: data.city,
          bio: data.bio,
          interests: data.interests,
          occupation: data.occupation
        },
        device: this.buildDeviceSnapshot()
      });
      await window.hexCloudSync.hydrateSessionContext();
    }

    if (status) status.textContent = 'Profile registered.';
    this.close();
  },

  buildDeviceSnapshot() {
    const info = this._systemInfo || {};
    return {
      deviceId: config?.cloud?.deviceId || null,
      hostname: info.hostname || null,
      platform: info.platform || navigator.platform || null,
      localIps: Array.isArray(info.localIps) ? info.localIps : [],
      os: info.os?.distro || info.os?.platform || null
    };
  }
};
