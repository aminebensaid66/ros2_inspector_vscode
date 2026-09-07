'use strict';
const Module=require('node:module');const original=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return{};return original.call(this,request,parent,isMain)};const test=require('node:test');const assert=require('node:assert/strict');const {graphHtml,escapeHtml,safeJson}=require('../src/graphPanel');const {normalize}=require('../src/model');
test('escapes HTML details safely',()=>assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;'));
test('JSON embedding escapes script delimiters',()=>assert.doesNotMatch(safeJson({x:'</script><script>alert(1)</script>'}),/<script/i));
test('webview sets restrictive CSP',()=>{const m=normalize({graph:{nodes:[],edges:[]}});assert.match(graphHtml(m,'full',100,'abc'),/default-src 'none'/);assert.match(graphHtml(m,'full',100,'abc'),/script-src 'nonce-abc'/)});
test('webview contains no remote resources',()=>{const m=normalize({graph:{nodes:[],edges:[]}});const html=graphHtml(m,'full',100,'abc');assert.doesNotMatch(html,/(?:src|href)=['\"]https?:\/\//i);assert.doesNotMatch(html,/\bfetch\s*\(/)});
