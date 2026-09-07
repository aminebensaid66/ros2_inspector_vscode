'use strict';
const fs = require('node:fs');
for (const name of fs.readdirSync('.')) if (name.endsWith('.vsix')) fs.rmSync(name, { force: true });
