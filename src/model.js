'use strict';

const path = require('node:path');

const CATEGORIES = [
  ['packages', 'Packages', 'package'],
  ['nodes', 'Source Nodes', 'symbol-class'],
  ['deployments', 'Deployments', 'run'],
  ['topics', 'Topics', 'radio-tower'],
  ['services', 'Services', 'server-process'],
  ['actions', 'Actions', 'play-circle'],
  ['interfaces', 'Interfaces', 'symbol-interface'],
  ['diagnostics', 'Diagnostics', 'warning']
];

function asArray(value) { return Array.isArray(value) ? value : []; }

function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const graph = data.graph && typeof data.graph === 'object' ? data.graph : {};
  const result = {
    packages: asArray(data.packages),
    nodes: asArray(data.nodes),
    deployments: asArray(data.deployments),
    topics: asArray(data.topics),
    services: asArray(data.services),
    actions: asArray(data.actions),
    interfaces: asArray(data.interfaces),
    diagnostics: asArray(data.diagnostics),
    summary: data.summary && typeof data.summary === 'object' ? data.summary : {},
    graph: { nodes: asArray(graph.nodes), edges: asArray(graph.edges) }
  };
  result.graphById = new Map(result.graph.nodes.filter(n => n && n.id).map(n => [n.id, n]));
  return result;
}

function displayName(kind, item) {
  if (!item) return 'Unknown';
  if (kind === 'nodes') return item.declared_ros_name || item.name || item.source_symbol || 'Node';
  if (kind === 'deployments') return item.name || item.deployment_name || item.executable || 'Deployment';
  if (kind === 'interfaces') return item.package ? `${item.package}/${item.name}` : (item.name || 'Interface');
  if (kind === 'diagnostics') return item.message || item.code || 'Diagnostic';
  return item.name || item.package || item.code || 'Unknown';
}

function itemDescription(kind, item) {
  if (kind === 'packages') return item.version || '';
  if (kind === 'nodes') return [item.package, item.language].filter(Boolean).join(' · ');
  if (kind === 'deployments') return [item.executable, item.namespace].filter(Boolean).join(' · ');
  if (kind === 'topics') return item.msg_type || 'unknown';
  if (kind === 'services') return item.srv_type || 'unknown';
  if (kind === 'actions') return item.action_type || 'unknown';
  if (kind === 'interfaces') return item.kind || '';
  if (kind === 'diagnostics') return item.code || item.severity || '';
  return '';
}

function categoryRows(model) {
  return CATEGORIES.map(([key, label, icon]) => ({ key, label, icon, count: asArray(model[key]).length }));
}

function sourceLocation(kind, item, model) {
  if (!item) return null;
  if (item.file_path) return { file: item.file_path, line: Math.max(1, Number(item.line || 1)) };
  if (kind === 'diagnostics' && item.file) return { file: item.file, line: Math.max(1, Number(item.line || 1)) };
  if (kind === 'deployments' && item.source_node_id && model?.graphById) {
    const source = model.graphById.get(item.source_node_id);
    if (source?.file_path) return { file: source.file_path, line: Math.max(1, Number(source.line || 1)) };
  }
  return null;
}

function editorDiagnostics(model) {
  const out = [];
  for (const diagnostic of model.diagnostics) {
    if (!diagnostic.file) continue;
    out.push({
      file: diagnostic.file,
      line: Math.max(1, Number(diagnostic.line || 1)),
      severity: String(diagnostic.severity || 'warning').toLowerCase(),
      message: diagnostic.message || diagnostic.code || 'ROS2 Inspector diagnostic',
      code: diagnostic.code || 'ros2inspector'
    });
  }
  for (const node of model.nodes) {
    if (!node.has_dynamic_names || !node.file_path) continue;
    out.push({
      file: node.file_path,
      line: Math.max(1, Number(node.line || 1)),
      severity: 'warning',
      message: `ROS name or endpoint could not be fully resolved statically for ${node.name || 'node'}.`,
      code: 'dynamic_ros_name'
    });
  }
  return out;
}

function graphSlice(model, mode = 'comms', maxNodes = 350) {
  const relations = mode === 'deps'
    ? new Set(['depends_on'])
    : mode === 'comms'
      ? new Set(['publishes', 'subscribes', 'provides', 'calls', 'deploys_as'])
      : null;
  const allowedKinds = mode === 'deps'
    ? new Set(['Package'])
    : mode === 'comms'
      ? new Set(['Node', 'Deployment', 'Topic', 'Service', 'Action'])
      : null;

  let nodes = model.graph.nodes.filter(n => !allowedKinds || allowedKinds.has(n.kind));
  const truncated = nodes.length > maxNodes;
  nodes = nodes.slice(0, Math.max(1, maxNodes));
  const ids = new Set(nodes.map(n => n.id));
  const edges = model.graph.edges.filter(e => ids.has(e.source) && ids.has(e.target) && (!relations || relations.has(e.rel)));
  return { nodes, edges, truncated, totalNodes: model.graph.nodes.length };
}

function summaryText(model) {
  const s = model.summary || {};
  return [
    `Packages: ${s.packages ?? model.packages.length}`,
    `Source nodes: ${s.nodes ?? model.nodes.length}`,
    `Deployments: ${s.deployments ?? model.deployments.length}`,
    `Topics: ${s.topics ?? model.topics.length}`,
    `Services: ${s.services ?? model.services.length}`,
    `Actions: ${s.actions ?? model.actions.length}`,
    `Interfaces: ${s.interfaces ?? model.interfaces.length}`,
    `Diagnostics: ${model.diagnostics.length}`
  ].join('\n');
}

function isRelevantFile(filePath) {
  const basename = path.basename(filePath);
  if (basename === 'package.xml' || basename === 'setup.py' || basename === 'setup.cfg' || basename === 'pyproject.toml') return true;
  return /\.(py|cpp|cc|cxx|hpp|h|msg|srv|action|xml|ya?ml)$/i.test(filePath);
}

module.exports = {
  CATEGORIES, normalize, displayName, itemDescription, categoryRows,
  sourceLocation, editorDiagnostics, graphSlice, summaryText, isRelevantFile
};
