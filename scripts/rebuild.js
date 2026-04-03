'use strict';
/**
 * rebuild.js — rebuilds sherpa-onnx native module against the installed Electron.
 *
 * Why this exists:
 *   @electron/rebuild requires an explicit electronVersion string.
 *   We read it from the electron package itself so it always matches,
 *   and target only sherpa-onnx to keep rebuilds fast.
 *
 * Usage:
 *   npm run rebuild
 *   node scripts/rebuild.js
 */

const path = require('path');
const { rebuild } = require('@electron/rebuild');

// ─── Resolve Electron version ────────────────────────────────────────────────

let electronVersion;

try {
  const electronPkg = require(path.join(
    path.dirname(require.resolve('electron')),
    'package.json'
  ));
  electronVersion = electronPkg.version;
} catch (err) {
  console.error('✗ Could not resolve Electron version.');
  console.error('  Make sure electron is installed: npm install electron');
  process.exit(1);
}

// ─── Run rebuild ─────────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..');

console.log('');
console.log('  Softcurse H.E.X. — Native Module Rebuild');
console.log('  ─────────────────────────────────────────');
console.log(`  Electron : ${electronVersion}`);
console.log(`  Module   : sherpa-onnx`);
console.log(`  Root     : ${projectRoot}`);
console.log('');

rebuild({
  buildPath: projectRoot,
  electronVersion: electronVersion,
  modulesToRebuild: ['sherpa-onnx'],
  force: true,
})
  .then(() => {
    console.log('  ✓ sherpa-onnx rebuilt successfully.');
    console.log('');
    console.log('  Run: npm start');
    console.log('');
  })
  .catch((err) => {
    console.error('  ✗ Rebuild failed.');
    console.error('');
    console.error('  Error:', err.message || err);
    console.error('');
    console.error('  Try manually:');
    console.error(`    npx @electron/rebuild -v ${electronVersion} -m sherpa-onnx`);
    console.error('');
    process.exit(1);
  });