'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {layoutGraph,routeEdges,buildScene}=require('../src/graphLayout');

function rectsOverlap(a,b){return !(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)}

test('layout is deterministic regardless of input order',()=>{const nodes=[{id:'pub',kind:'Node',name:'Pub'},{id:'topic',kind:'Topic',name:'/t'},{id:'sub',kind:'Node',name:'Sub'}];const edges=[{source:'pub',target:'topic',rel:'publishes'},{source:'sub',target:'topic',rel:'subscribes'}];const a=layoutGraph(nodes,edges,'comms'),b=layoutGraph([...nodes].reverse(),[...edges].reverse(),'comms');assert.deepEqual(Object.fromEntries(a.positions),Object.fromEntries(b.positions))});

test('communications layout follows publisher endpoint subscriber architecture flow',()=>{const nodes=[{id:'pub',kind:'Node'},{id:'topic',kind:'Topic'},{id:'sub',kind:'Node'}];const edges=[{source:'pub',target:'topic',rel:'publishes'},{source:'sub',target:'topic',rel:'subscribes'}];const p=layoutGraph(nodes,edges,'comms').positions;assert.ok(p.get('pub').x<p.get('topic').x);assert.ok(p.get('topic').x<p.get('sub').x)});

test('source nodes and launch deployments remain separate rectangles',()=>{const nodes=[{id:'n',kind:'Node'},{id:'d',kind:'Deployment'}];const p=layoutGraph(nodes,[{source:'n',target:'d',rel:'deploys_as'}],'comms').positions;assert.notDeepEqual(p.get('n'),p.get('d'))});

test('layout rectangles do not overlap',()=>{const nodes=Array.from({length:30},(_,i)=>({id:'n'+i,kind:i%2?'Node':'Topic',name:'N'+i}));const p=[...layoutGraph(nodes,[],'full').positions.values()];for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)assert.equal(rectsOverlap(p[i],p[j]),false)});

test('parallel edges receive distinct routes and labels',()=>{const nodes=[{id:'a',kind:'Node'},{id:'b',kind:'Topic'}];const scene=buildScene(nodes,[{source:'a',target:'b',rel:'publishes',key:'1'},{source:'a',target:'b',rel:'publishes',key:'2'}]);assert.equal(scene.routes.length,2);assert.notEqual(scene.routes[0].d,scene.routes[1].d);assert.notEqual(scene.routes[0].labelY,scene.routes[1].labelY)});

test('reverse edges are routed on separate lanes',()=>{const nodes=[{id:'a',kind:'Node'},{id:'b',kind:'Topic'}];const scene=buildScene(nodes,[{source:'a',target:'b',rel:'publishes'},{source:'b',target:'a',rel:'subscribes'}]);assert.notEqual(scene.routes[0].d,scene.routes[1].d)});

test('self loops use external cubic loop',()=>{const nodes=[{id:'a',kind:'Node'}];const scene=buildScene(nodes,[{source:'a',target:'a',rel:'depends_on'}],'full');assert.match(scene.routes[0].d,/ C /);assert.ok(scene.routes[0].bounds.minY<scene.positions.get('a').y)});

test('same-column edges route outside node rectangles',()=>{const nodes=[{id:'a',kind:'Node',name:'A'},{id:'b',kind:'Node',name:'B'}];const scene=buildScene(nodes,[{source:'a',target:'b',rel:'other'}],'full');const right=Math.max(scene.positions.get('a').x+scene.positions.get('a').width,scene.positions.get('b').x+scene.positions.get('b').width);assert.ok(scene.routes[0].bounds.maxX>right)});

test('scene bounds include self-loop and edge label extents for Fit',()=>{const nodes=[{id:'a',kind:'Node'}];const scene=buildScene(nodes,[{source:'a',target:'a',rel:'depends_on'}],'full');const route=scene.routes[0];assert.ok(scene.bounds.x<=route.bounds.minX);assert.ok(scene.bounds.y<=route.bounds.minY);assert.ok(scene.bounds.x+scene.bounds.width>=route.labelX+35)});

test('dependency cycles terminate deterministically',()=>{const nodes=[{id:'a',kind:'Package'},{id:'b',kind:'Package'}];const layout=layoutGraph(nodes,[{source:'a',target:'b',rel:'depends_on'},{source:'b',target:'a',rel:'depends_on'}],'deps');assert.equal(layout.positions.size,2);assert.equal(layout.positions.get('a').rank,0);assert.equal(layout.positions.get('b').rank,0)});
