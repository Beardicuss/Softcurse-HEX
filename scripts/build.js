'use strict';
/**
 * Build wrapper for electron-builder.
 *
 * electron-builder 26 emits Node DEP0190 from an internal child_process call on
 * current Node versions. Keep normal warnings/errors visible, but suppress that
 * known upstream deprecation so local builds stay clean.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const builderCli = path.join(projectRoot, 'node_modules', 'electron-builder', 'cli.js');
const existingNodeOptions = process.env.NODE_OPTIONS || '';
const suppressDep0190 = '--disable-warning=DEP0190';
const nodeOptions = existingNodeOptions.includes(suppressDep0190)
  ? existingNodeOptions
  : [existingNodeOptions, suppressDep0190].filter(Boolean).join(' ');

const result = spawnSync(process.execPath, [builderCli], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions
  }
});

if (result.error) {
  console.error('Build failed:', result.error.message || result.error);
  process.exit(1);
}

process.exit(result.status || 0);