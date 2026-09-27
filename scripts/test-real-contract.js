'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const executable = process.env.ROS2INSPECTOR_BIN || 'ros2inspector';
const workspace = path.resolve(__dirname, '..', 'fixtures', 'demo_ws');
function run(args, accepted = [0]) {
  const result = spawnSync(executable, args, { encoding: 'utf8', shell: false, cwd: workspace, env: process.env });
  if (result.error) throw result.error;
  if (!accepted.includes(result.status)) throw new Error(`${executable} ${args.join(' ')} exited ${result.status}\n${result.stderr}`);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
function json(args, accepted = [0]) { const result = run(args, accepted); try { return { ...result, data: JSON.parse(result.stdout) }; } catch (error) { throw new Error(`Invalid JSON from ${args.join(' ')}: ${error.message}\n${result.stdout}`); } }
function assert(condition, message) { if (!condition) throw new Error(message); }

const version = run(['--version']);
assert(/0\.1\.3/.test(version.stdout + version.stderr), `Expected ros2inspector 0.1.3, got ${version.stdout}${version.stderr}`);
for (const args of [['--help'], ['graph', '--help'], ['nodes', '--help'], ['audit', '--help'], ['validate', '--help']]) run(args);

const graph = json(['--quiet', 'graph', 'full', '--format', 'json', '-C', workspace]).data;
assert(graph && typeof graph === 'object', 'graph JSON must be an object');
for (const key of ['packages', 'nodes', 'deployments', 'topics', 'services', 'actions', 'interfaces', 'diagnostics', 'summary', 'graph']) assert(Object.prototype.hasOwnProperty.call(graph, key), `graph JSON missing ${key}`);
assert(Array.isArray(graph.graph.nodes) && Array.isArray(graph.graph.edges), 'graph.nodes and graph.edges must be arrays');
assert(graph.summary.packages === 4, `expected 4 packages, got ${graph.summary.packages}`);
assert(graph.summary.nodes >= 4, `expected >=4 source nodes, got ${graph.summary.nodes}`);
assert(graph.summary.deployments >= 6, `expected >=6 deployments, got ${graph.summary.deployments}`);
assert(graph.summary.interfaces === 3, `expected 3 interfaces, got ${graph.summary.interfaces}`);
assert(graph.diagnostics.some(d => d.code === 'launch_branch_unresolved'), 'fixture must produce unresolved launch diagnostic');

const nodes = json(['--quiet', 'nodes', '--format', 'json', '--show-connections', '-C', workspace]).data;
assert(Array.isArray(nodes) && nodes.length >= 4, 'nodes JSON must contain source nodes');
assert(nodes.some(n => Array.isArray(n.deployments) && n.deployments.length >= 2), 'fixture must contain a source node with multiple deployments');
assert(nodes.some(n => Array.isArray(n.connections) && n.connections.some(c => c.kind === 'service')), 'nodes JSON must expose service connections');
assert(nodes.some(n => Array.isArray(n.connections) && n.connections.some(c => c.kind === 'action')), 'nodes JSON must expose action connections');

const audit = json(['--quiet', 'audit', workspace, '--format', 'json'], [0, 1]);
assert(Array.isArray(audit.data.findings), 'audit findings must be an array');
assert(audit.data.findings.length >= 1, 'fixture must produce audit findings');
assert(audit.data.findings.every(f => typeof f.severity === 'string' && typeof f.rule_type === 'string' && Array.isArray(f.affected_entities)), 'audit finding schema mismatch');

const passing = json(['--quiet', 'validate', workspace, '--policy', path.join(workspace, 'policy-pass.yaml'), '--format', 'json'], [0]);
assert(Array.isArray(passing.data.violations) && passing.data.violations.length === 0, 'passing policy must have no violations');
const violating = json(['--quiet', 'validate', workspace, '--policy', path.join(workspace, 'policy-violate.yaml'), '--format', 'json'], [1]);
assert(Array.isArray(violating.data.violations) && violating.data.violations.length >= 1, 'violating policy must exit 1 with violations');
assert(violating.data.violations.every(v => typeof v.policy_file === 'string' && Array.isArray(v.affected_entities)), 'policy violation schema mismatch');

const graphIds = new Set(graph.graph.nodes.map(n => n.id));
const orphanEdges = graph.graph.edges.filter(e => !graphIds.has(e.source) || !graphIds.has(e.target));
assert(orphanEdges.length === 0, `graph JSON contains ${orphanEdges.length} edges with missing endpoints`);
console.log(JSON.stringify({
  version: '0.1.3', packages: graph.summary.packages, nodes: graph.summary.nodes,
  deployments: graph.summary.deployments, topics: graph.summary.topics, services: graph.summary.services,
  actions: graph.summary.actions, interfaces: graph.summary.interfaces, diagnostics: graph.diagnostics.length,
  auditFindings: audit.data.findings.length, policyViolations: violating.data.violations.length,
  orphanGraphEdges: orphanEdges.length
}, null, 2));
console.log('contract: PASS');
