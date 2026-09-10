'use strict';
const Module = require('node:module'); const original = Module._load;
class EventEmitter { constructor(){ this.event=()=>{}; } fire(){} dispose(){} }
class TreeItem { constructor(label, collapsibleState){ this.label=label; this.collapsibleState=collapsibleState; } }
class ThemeIcon { constructor(id){ this.id=id; } }
class MarkdownString { constructor(value=''){ this.value=value; } }
const vscode = { EventEmitter, TreeItem, ThemeIcon, MarkdownString, TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2} };
Module._load = function(request,parent,isMain){ if(request==='vscode') return vscode; return original.call(this,request,parent,isMain); };
const fs = require('node:fs'); const path = require('node:path');
const test=require('node:test');const assert=require('node:assert/strict');const {sampleBundle}=require('./fixtures');const {normalize}=require('../src/model');const {ExplorerProvider,entityGroups,findingSeverityGroups}=require('../src/treeProvider');
function model(){const b=sampleBundle();return normalize(b.raw,{nodeConnections:b.nodeConnections,audit:b.audit,policy:b.policy});}
test('source node groups aggregate deployment communications',()=>{const m=model();const source=[...m.entityById.values()].find(e=>e.kind==='Node'&&e.data.name==='CameraNode');const groups=entityGroups(m,source);assert.ok(groups.some(g=>g.key==='deployments'));assert.ok(groups.some(g=>g.key==='publishers'&&g.entities.some(e=>e.name==='/robot/image_raw')));assert.ok(groups.some(g=>g.key==='services-provided'));assert.ok(groups.some(g=>g.key==='action-servers'));});
test('topic groups expose publishers and findings',()=>{const m=model();const topic=[...m.entityById.values()].find(e=>e.kind==='Topic');const groups=entityGroups(m,topic);assert.ok(groups.some(g=>g.key==='publishers'));assert.ok(groups.some(g=>g.key==='findings'));});
test('deployment groups expose source and remappings',()=>{const m=model();const groups=entityGroups(m,m.entityById.get('deployment:camera'));assert.ok(groups.some(g=>g.key==='source'));assert.ok(groups.some(g=>g.key==='remaps'));});
test('empty groups are hidden',()=>{const m=model();const other=[...m.entityById.values()].find(e=>e.kind==='Node'&&e.data.name==='OtherNode');assert.equal(entityGroups(m,other).some(g=>g.key==='publishers'),false);});
test('finding severity groups are deterministic and omit empty severity',()=>{const b=sampleBundle();const groups=findingSeverityGroups(b.audit.findings);assert.deepEqual(groups.map(g=>g.severity),['warning','info']);});
test('provider keeps empty top-level categories visible',()=>{const m=model();const p=new ExplorerProvider();p.update({model:m,state:'fresh'});const roots=p.getChildren();assert.ok(roots.some(r=>r.key==='actions'));assert.ok(roots.some(r=>r.key==='diagnostics'));});
test('tree item IDs are stable and entity command opens details',()=>{const m=model();const p=new ExplorerProvider();p.update({model:m,state:'fresh'});const nodes=p.getChildren().find(r=>r.key==='nodes');const first=p.getChildren(nodes)[0];assert.match(first.treeItem.id,/^ros2Inspector\.entity\./);assert.equal(first.treeItem.command.command,'ros2Inspector.showDetails');});
test('stale state is visibly labeled instead of silently fresh',()=>{const m=model();const p=new ExplorerProvider();p.update({model:m,state:'stale',error:'boom'});const roots=p.getChildren();assert.match(roots[0].treeItem.label,/Stale results/);});


test('entity tooltips are plain strings, not analyzer-controlled Markdown', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'treeProvider.js'), 'utf8');
  assert.doesNotMatch(source, /new vscode\.MarkdownString/);
  assert.match(source, /item\.tooltip = `\$\{entity\.kind\}: \$\{entity\.name\}/);
});
