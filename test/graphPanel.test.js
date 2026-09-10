'use strict';
const Module = require('node:module'); const original = Module._load; Module._load = function(request, parent, isMain) { if (request === 'vscode') return {}; return original.call(this, request, parent, isMain); };
const fs = require('node:fs'); const path = require('node:path');
const test = require('node:test'); const assert = require('node:assert/strict');
const { sampleBundle } = require('./fixtures'); const { normalize } = require('../src/model');
const { graphHtml, graphPayload, normalizeGraphState, escapeHtml, safeJson } = require('../src/graphPanel');
function model() { const b = sampleBundle(); return normalize(b.raw, { nodeConnections: b.nodeConnections, audit: b.audit, policy: b.policy }); }
test('escapes HTML details safely', () => assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'));
test('JSON embedding escapes script delimiters', () => assert.doesNotMatch(safeJson({ x: '</script><script>alert(1)</script>' }), /<script/i));
test('webview sets restrictive CSP with nonce and no remote resources', () => { const html = graphHtml(model(), { mode: 'full' }, 100, 'abc'); assert.match(html, /default-src 'none'/); assert.match(html, /script-src 'nonce-abc'/); assert.doesNotMatch(html, /(?:src|href)=['"]https?:\/\//i); assert.doesNotMatch(html, /\bfetch\s*\(/); });
test('graph has genuine zoom pan fit and reset controls', () => { const html = graphHtml(model(), 'full', 100, 'abc'); for (const id of ['zoomIn', 'zoomOut', 'fit', 'reset']) assert.match(html, new RegExp(`id="${id}"`)); assert.match(html, /addEventListener\('wheel'/); assert.match(html, /pointerdown/); assert.match(html, /getBBox\(\)/); });
test('graph renders arrowheads, edge labels and legend', () => { const html = graphHtml(model(), 'full', 100, 'abc'); assert.match(html, /marker-end:url\(#arrow\)/); assert.match(html, /id="legend"/); assert.match(html, /edgeLabel/); });
test('graph offers filters and neighborhood focus', () => { const html = graphHtml(model(), 'full', 100, 'abc'); for (const id of ['kind', 'package', 'namespace', 'relationship', 'isolated', 'focus1', 'focus2', 'clearFocus']) assert.match(html, new RegExp(`id="${id}"`)); });
test('keyboard selection and Escape handling are implemented', () => { const html = graphHtml(model(), 'full', 100, 'abc'); assert.match(html, /tabindex:'0'/); assert.match(html, /ev\.key==='Enter'/); assert.match(html, /e\.key==='Escape'/); });
test('edge details only expose Open source when location exists', () => { const html = graphHtml(model(), 'full', 100, 'abc'); assert.match(html, /if\(\(e\.file_path\|\|e\.file\).*addButton\('Open source'/); });
test('graph payload reports filtered total correctly', () => { const p = graphPayload(model(), { mode: 'deps' }, 350); assert.ok(p.slice.totalNodes > 0); assert.ok(p.slice.nodes.every(n => n.kind === 'Package')); });
test('graph state clamps malformed transforms and max semantic state', () => { const s = normalizeGraphState({ mode: 'bogus', transform: { scale: 100, x: 'bad' }, hops: 9, kinds: 'bad' }); assert.equal(s.mode, 'comms'); assert.equal(s.transform.scale, 4); assert.equal(s.transform.x, 36); assert.equal(s.hops, 0); assert.deepEqual(s.kinds, []); });
test('graph preserves search/filter/selection state in embedded payload', () => { const html = graphHtml(model(), { mode: 'comms', search: 'camera', package: 'demo', selectedId: 'deployment:camera', transform: { x: 9, y: 7, scale: 1.5 } }, 100, 'abc'); assert.match(html, /"search":"camera"/); assert.match(html, /"package":"demo"/); assert.match(html, /"selectedId":"deployment:camera"/); assert.match(html, /"scale":1\.5/); });


test('restores graph selection without posting a feedback-loop state update', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'graphPanel.js'), 'utf8');
  assert.match(source, /function selectNode\(n,g,notify=true\)/);
  assert.match(source, /selectNode\(n,g,false\)/);
  assert.match(source, /function selectEdge\(e,line,notify=true\)/);
  assert.match(source, /selectEdge\(e,line,false\)/);
});
