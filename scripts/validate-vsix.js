'use strict';
const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); const file = process.argv[2] || `${pkg.name}-${pkg.version}.vsix`;
if (!fs.existsSync(file)) throw new Error(`VSIX not found: ${file}`);
const result = spawnSync('unzip', ['-l', file], { encoding: 'utf8', shell: false });
if (result.error || result.status !== 0) throw new Error(`Unable to inspect VSIX: ${result.error?.message || result.stderr}`);
const listing = result.stdout;
for (const required of ['extension.vsixmanifest', 'extension/package.json', 'extension/src/extension.js', 'extension/src/backend.js', 'extension/src/model.js', 'extension/src/treeProvider.js', 'extension/src/graphPanel.js', 'extension/src/detailsPanel.js', 'extension/media/icon.png']) {
  if (!listing.includes(required)) throw new Error(`VSIX missing ${required}`);
}
for (const forbidden of ['extension/test/', 'extension/fixtures/', 'extension/scripts/']) if (listing.includes(forbidden)) throw new Error(`VSIX unexpectedly contains ${forbidden}`);
console.log(`${path.basename(file)}: valid structure (${fs.statSync(file).size} bytes)`);
