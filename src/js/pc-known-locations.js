'use strict';

window.hexPcKnownLocations = (() => {
  const LOCATIONS = [
    { alias: 'desktop', kind: 'folder', label: 'Desktop', priority: 10, startup: true },
    { alias: 'documents', kind: 'folder', label: 'Documents', priority: 9, startup: true },
    { alias: 'downloads', kind: 'folder', label: 'Downloads', priority: 9, startup: true },
    { alias: 'pictures', kind: 'folder', label: 'Pictures', priority: 7, startup: true },
    { alias: 'music', kind: 'folder', label: 'Music', priority: 6, startup: false },
    { alias: 'videos', kind: 'folder', label: 'Videos', priority: 6, startup: false },
    { alias: 'home', kind: 'folder', label: 'Home', priority: 5, startup: false }
  ];

  function listAll() {
    return LOCATIONS.map((item) => ({ ...item }));
  }

  function listStartup() {
    return LOCATIONS
      .filter((item) => item.startup)
      .map((item) => ({ ...item }));
  }

  function labels(limit = 8) {
    return LOCATIONS
      .slice(0, limit)
      .map((item) => `${item.label} (${item.alias})`);
  }

  return {
    listAll,
    listStartup,
    labels
  };
})();
