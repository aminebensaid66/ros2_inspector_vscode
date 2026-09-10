'use strict';
const Module = require('node:module'); const original = Module._load; Module._load = function(request, parent, isMain) { if (request === 'vscode') return {}; return original.call(this, request, parent, isMain); };
const test = require('node:test'); const assert = require('node:assert/strict');
const { sampleBundle } = require('./fixtures'); const { normalize } = require('../src/model'); const { detailsHtml, detailPayload, safeJson } = require('../src/detailsPanel');
function subject() { const b = sampleBundle(); const m = normalize(b.raw, { nodeConnections: b.nodeConnections, audit: b.audit, policy: b.policy }); return { m, e: m.entityById.get('deployment:camera') }; }
test('details payload includes relationships findings and static fields', () => { const { m, e } = subject(); const p = detailPayload(e, m); assert.equal(p.entity.kind, 'Deployment'); assert.ok(p.relationships.length >= 2); assert.ok(p.fields.Executable); assert.ok(p.fields.Remappings); });
test('details webview uses restrictive CSP and DOM textContent', () => { const { m, e } = subject(); const html = detailsHtml(e, m, 'abc'); assert.match(html, /default-src 'none'/); assert.match(html, /script-src 'nonce-abc'/); assert.match(html, /textContent/); assert.doesNotMatch(html, /(?:src|href)=['"]https?:\/\//i); });
test('details JSON embedding blocks closing-script injection', () => assert.doesNotMatch(safeJson({ message: '</script><script>alert(1)</script>' }), /<script/i));
test('details only creates open-source action when source location exists', () => { const { m, e } = subject(); assert.match(detailsHtml(e, m, 'abc'), /if\(DATA\.location\)action\('Open source'/); });
