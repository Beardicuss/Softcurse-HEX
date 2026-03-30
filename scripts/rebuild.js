'use strict';
/**
 * rebuild.js — rebuilds sherpa-onnx native module against the installed Electron.
 *
 * Why this exists:
 *   @electron/rebuild requires an explicit electronVersion string.
 *   We read it from the electron package itself so it always matches.
 */

const path = require('path');
const { rebuild } = require('@electron/rebuild');

// Read exact Electron version from its own package.json (always accurate)
const electronPkg = require(path.join(
  path.dirname(require.resolve('electron')),
  'package.json'
));
const electronVersion = electronPkg.version;

console.log(`Rebuilding sherpa-onnx for Electron ${electronVersion} ...`);

rebuild({
  buildPath:       path.resolve(__dirname, '..'),
  electronVersion: electronVersion,
  onlyModules:     ['sherpa-onnx'],
  force:           true,
})
  .then(() => {
    console.log('\n✓ sherpa-onnx rebuilt successfully.');
    console.log('  You can now run: npm start');
  })
  .catch((err) => {
    console.error('\n✗ Rebuild failed:', err.message || err);
    console.error('\nTry manually:');
    console.error(`  npx @electron/rebuild -v ${electronVersion} -m sherpa-onnx`);
    process.exit(1);
  });
