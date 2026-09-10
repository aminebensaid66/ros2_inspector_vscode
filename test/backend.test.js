'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { InspectorBackend, InspectorError, parseVersion, versionAtLeast, runProcess } = require('../src/backend');

function runnerFor(routes = {}) {
  const calls = [];
  const runner = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '--version') return routes.version || { code: 0, stdout: 'ros2inspector v0.1.3\n', stderr: '' };
    const op = args.find(value => ['graph', 'nodes', 'audit', 'validate'].includes(value));
    return routes[op] || { code: 0, stdout: '{}', stderr: '' };
  };
  return { runner, calls };
}

test('parses CLI version', () => assert.deepEqual(parseVersion('ros2inspector v0.1.3'), { major: 0, minor: 1, patch: 3, raw: '0.1.3' }));
test('rejects invalid version text', () => assert.equal(parseVersion('hello'), null));
test('compares semantic versions', () => { assert.equal(versionAtLeast('0.1.3', '0.1.3'), true); assert.equal(versionAtLeast('0.1.2', '0.1.3'), false); assert.equal(versionAtLeast('0.2.0', '0.1.99'), true); });
test('checkVersion caches successful version checks', async () => { const { runner, calls } = runnerFor(); const b = new InspectorBackend({ runner }); await b.checkVersion(); await b.checkVersion(); assert.equal(calls.filter(c => c.args[0] === '--version').length, 1); b.invalidateVersionCache(); await b.checkVersion(); assert.equal(calls.filter(c => c.args[0] === '--version').length, 2); });
test('checkVersion enforces minimum', async () => { const { runner } = runnerFor({ version: { code: 0, stdout: 'ros2inspector v0.1.2', stderr: '' } }); const b = new InspectorBackend({ minimumVersion: '0.1.3', runner }); await assert.rejects(() => b.checkVersion(), /0.1.3\+ is required/); });
test('inspect uses quiet full JSON graph and version enforcement', async () => { const { runner, calls } = runnerFor({ graph: { code: 0, stdout: '{"graph":{"nodes":[],"edges":[]}}', stderr: '' } }); const b = new InspectorBackend({ runner }); await b.inspect('/tmp/ws'); const call = calls.find(c => c.args.includes('graph')); assert.deepEqual(call.args.slice(0, 5), ['--quiet', 'graph', 'full', '--format', 'json']); assert.equal(call.args.at(-2), '-C'); });
test('nodesWithConnections uses documented 0.1.3 JSON command', async () => { const { runner, calls } = runnerFor({ nodes: { code: 0, stdout: '[]', stderr: '' } }); const b = new InspectorBackend({ runner }); await b.nodesWithConnections('/tmp/ws'); const call = calls.find(c => c.args.includes('nodes')); assert.ok(call.args.includes('--show-connections')); assert.ok(call.args.includes('json')); });
test('inspectBundle returns architecture and connections from one version gate', async () => { const { runner, calls } = runnerFor({ graph: { code: 0, stdout: '{"graph":{"nodes":[],"edges":[]}}', stderr: '' }, nodes: { code: 0, stdout: '[]', stderr: '' } }); const b = new InspectorBackend({ runner }); const result = await b.inspectBundle('/tmp/ws'); assert.equal(result.version.raw, '0.1.3'); assert.equal(calls.filter(c => c.args[0] === '--version').length, 1); });
test('audit accepts exit code 0 and 1 as findings results', async () => { for (const code of [0, 1]) { const { runner } = runnerFor({ audit: { code, stdout: '{"summary":{},"findings":[{"severity":"warning"}]}', stderr: 'note' } }); const b = new InspectorBackend({ runner }); const r = await b.audit('/tmp/ws'); assert.equal(r.exitCode, code); assert.equal(r.findings.length, 1); assert.equal(r.stderr, 'note'); } });
test('audit rejects invalid JSON', async () => { const { runner } = runnerFor({ audit: { code: 0, stdout: '{oops', stderr: '' } }); const b = new InspectorBackend({ runner }); await assert.rejects(() => b.audit('/tmp/ws'), error => error instanceof InspectorError && error.code === 'invalid_json'); });
test('audit rejects invocation failures', async () => { const { runner } = runnerFor({ audit: { code: 2, stdout: '', stderr: 'bad args' } }); const b = new InspectorBackend({ runner }); await assert.rejects(() => b.audit('/tmp/ws'), /audit failed/); });
test('validation accepts exit 1 and enforces version', async () => { const { runner, calls } = runnerFor({ validate: { code: 1, stdout: '{"summary":{},"violations":[{"severity":"error"}]}', stderr: '' } }); const b = new InspectorBackend({ runner }); const r = await b.validate('/tmp/ws', '/tmp/policy.yaml'); assert.equal(r.exitCode, 1); assert.equal(r.violations.length, 1); assert.equal(calls.filter(c => c.args[0] === '--version').length, 1); });
test('validation rejects invocation failure', async () => { const { runner } = runnerFor({ validate: { code: 3, stdout: '', stderr: 'not found' } }); const b = new InspectorBackend({ runner }); await assert.rejects(() => b.validate('/tmp/ws', 'x'), /validation failed/); });

function fakeChild(onKill) { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { onKill?.(); return true; }; return child; }
test('runProcess enforces output limits', async () => { let child; const spawnImpl = () => (child = fakeChild()); const promise = runProcess('x', [], { spawnImpl, maxOutputBytes: 1024, timeoutMs: 5000 }); setImmediate(() => child.stdout.emit('data', Buffer.alloc(2048))); await assert.rejects(promise, error => error.code === 'output_limit'); });
test('runProcess supports cancellation and kills child', async () => { let child, killed = false; const spawnImpl = () => (child = fakeChild(() => { killed = true; })); const controller = new AbortController(); const promise = runProcess('x', [], { spawnImpl, signal: controller.signal, timeoutMs: 5000 }); setImmediate(() => controller.abort()); await assert.rejects(promise, error => error.code === 'cancelled'); assert.equal(killed, true); });
test('runProcess reports timeout', async () => { const spawnImpl = () => fakeChild(); await assert.rejects(() => runProcess('x', [], { spawnImpl, timeoutMs: 5 }), error => error.code === 'timeout'); });
