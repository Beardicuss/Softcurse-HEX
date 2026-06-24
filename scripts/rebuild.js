'use strict';
/**
 * rebuild.js - refreshes native dependencies for the installed Electron runtime.
 *
 * electron-builder already owns @electron/rebuild internally. Calling its
 * install-app-deps command keeps native modules aligned without carrying a
 * duplicate top-level @electron/rebuild dependency.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('');
console.log('  Softcurse H.E.X. - Native Module Refresh');
console.log('  -----------------------------------------');
console.log(`  Root     : ${projectRoot}`);
console.log('  Command  : electron-builder install-app-deps');
console.log('');

const result = spawnSync(npmCmd, ['exec', 'electron-builder', 'install-app-deps'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  console.error('  Rebuild failed:', result.error.message || result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`  Rebuild failed with exit code ${result.status}.`);
  process.exit(result.status || 1);
}

console.log('');
console.log('  Native modules refreshed successfully.');
console.log('');