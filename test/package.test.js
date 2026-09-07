'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
test('manifest uses workspace extension entrypoint',()=>{assert.equal(pkg.main,'./src/extension.js');assert.ok(pkg.engines.vscode)});
test('manifest declares all user-facing commands',()=>{const ids=new Set(pkg.contributes.commands.map(c=>c.command));for(const id of ['ros2Inspector.refresh','ros2Inspector.openGraph','ros2Inspector.validate','ros2Inspector.openSource'])assert.ok(ids.has(id))});
test('marketplace icon is PNG',()=>{assert.match(pkg.icon,/\.png$/);assert.ok(fs.existsSync(pkg.icon))});
test('extension has zero runtime npm dependencies',()=>assert.equal(pkg.dependencies,undefined));
