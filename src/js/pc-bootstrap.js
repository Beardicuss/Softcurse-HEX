'use strict';

window.hexPcBootstrap = (() => {
  function splitItems(items) {
    const list = Array.isArray(items) ? items : [];
    return {
      folders: list.filter((item) => item?.type === 'dir'),
      files: list.filter((item) => item?.type === 'file')
    };
  }

  function joinPath(basePath, name) {
    return [basePath, name].filter(Boolean).join(/[\\/]$/.test(basePath || '') ? '' : '\\');
  }

  function normalizeFolder(basePath, item) {
    const fullPath = item?.path || joinPath(basePath, item?.name);
    return {
      name: item?.name || fullPath,
      path: fullPath,
      value: fullPath,
      meta: {
        parent: basePath || '',
        source: 'startup-scan',
        sourceAlias: item?.sourceAlias || null,
        targetType: 'folder'
      }
    };
  }

  function normalizeFile(basePath, item) {
    const fullPath = item?.path || joinPath(basePath, item?.name);
    return {
      name: item?.name || fullPath,
      path: fullPath,
      value: fullPath,
      size: item?.size || 0,
      meta: {
        parent: basePath || '',
        source: 'startup-scan',
        sourceAlias: item?.sourceAlias || null,
        targetType: 'file'
      }
    };
  }

  async function seedLocation(location) {
    const alias = typeof location === 'string' ? location : location?.alias;
    const result = await window.hexAPI?.butler?.listDir?.(alias).catch(() => null);
    if (!result?.success || !Array.isArray(result.items)) {
      return { folders: [], files: [] };
    }

    const { folders, files } = splitItems(result.items);
    return {
      folders: folders.slice(0, 8).map((item) => normalizeFolder(result.path, { ...item, sourceAlias: alias })),
      files: files.slice(0, 12).map((item) => normalizeFile(result.path, { ...item, sourceAlias: alias }))
    };
  }

  async function bootstrap() {
    const startupLocations = window.hexPcKnownLocations?.listStartup?.() || [
      { alias: 'desktop' },
      { alias: 'documents' },
      { alias: 'downloads' }
    ];
    const settled = await Promise.allSettled(startupLocations.map(seedLocation));
    const folders = settled
      .filter((entry) => entry.status === 'fulfilled')
      .flatMap((entry) => entry.value.folders || []);
    const files = settled
      .filter((entry) => entry.status === 'fulfilled')
      .flatMap((entry) => entry.value.files || []);

    if (folders.length) {
      window.hexCandidatePublishers?.publishFolders?.(folders);
    }
    if (files.length) {
      window.hexCandidatePublishers?.publishFiles?.(files);
    }

    return {
      locations: startupLocations.map((item) => item.alias),
      folders: folders.length,
      files: files.length
    };
  }

  return {
    bootstrap
  };
})();
