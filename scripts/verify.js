'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit',shell:false});if(r.status!==0)process.exit(r.status??1)}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const required=['name','displayName','version','publisher','engines','main','contributes'];
for(const key of required)if(!pkg[key])throw new Error(`package.json missing ${key}`);
if(!fs.existsSync(pkg.main))throw new Error(`main file not found: ${pkg.main}`);
for(const file of ['README.md','LICENSE','CHANGELOG.md','SECURITY.md','media/icon.png','media/activity.svg'])if(!fs.existsSync(file))throw new Error(`required file missing: ${file}`);
for(const dir of ['src','scripts','test'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')))run(process.execPath,['--check',path.join(dir,file)]);
run(process.execPath,['--test','test/backend.test.js','test/model.test.js','test/graphPanel.test.js','test/package.test.js']);
console.log('verify: PASS');
