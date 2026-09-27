'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const CATEGORIES = [
  ['packages', 'Packages', 'package'],
  ['nodes', 'Source Nodes', 'symbol-class'],
  ['deployments', 'Deployments', 'run'],
  ['topics', 'Topics', 'radio-tower'],
  ['services', 'Services', 'server-process'],
  ['actions', 'Actions', 'play-circle'],
  ['interfaces', 'Interfaces', 'symbol-interface'],
  ['diagnostics', 'Diagnostics', 'warning'],
  ['auditFindings', 'Audit Findings', 'search'],
  ['policyViolations', 'Policy Violations', 'law']
];

const CATEGORY_KIND = {
  packages: 'Package', nodes: 'Node', deployments: 'Deployment', topics: 'Topic',
  services: 'Service', actions: 'Action', interfaces: 'Interface'
};
const KIND_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_KIND).map(([k, v]) => [v, k]));
const COMM_RELS = new Set(['publishes', 'subscribes', 'provides', 'calls']);
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function asArray(value) { return Array.isArray(value) ? value : []; }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
function normalizedSeverity(value) {
  const sev = String(value || 'warning').toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, sev) ? sev : 'warning';
}
function validLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 1;
}
function stableCompare(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
}
function stableSort(items, key = item => item?.name || item?.id || '') {
  return [...asArray(items)].sort((a, b) => stableCompare(key(a), key(b)));
}
function hash(value) { return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10); }
function slug(value) { return String(value ?? '').replace(/[^A-Za-z0-9_.:/-]+/g, '_'); }
function relationId(source, rel, target, metadata = {}) {
  const evidence = [metadata.file_path, metadata.file, metadata.line, metadata.evidence, metadata.confidence].filter(Boolean).join(':');
  return `rel:${hash(`${source}|${rel}|${target}|${evidence}`)}`;
}

function cloneItem(value) { return value && typeof value === 'object' ? { ...value } : {}; }

function graphKindName(item) { return text(item?.kind); }
function interfaceFullType(item) {
  if (!item) return '';
  const pkg = text(item.package);
  const name = text(item.name);
  return pkg && name ? `${pkg}/${name}` : name;
}

function canonicalCommunicationId(kind, name) {
  const prefix = kind === 'Topic' ? 'topic' : kind === 'Service' ? 'service' : 'action';
  return `${prefix}:${name || '<unknown>'}`;
}

function isUnresolvedCommunication(item) {
  return item?.name === '<dynamic>' || item?.resolution === 'unresolved' || text(item?.id).startsWith('unresolved:');
}

function normalize(raw, extras = {}) {
  const data = asObject(raw);
  const graph = asObject(data.graph);
  const model = {
    packages: asArray(data.packages).map(cloneItem),
    nodes: asArray(data.nodes).map(cloneItem),
    deployments: asArray(data.deployments).map(cloneItem),
    topics: asArray(data.topics).map(cloneItem),
    services: asArray(data.services).map(cloneItem),
    actions: asArray(data.actions).map(cloneItem),
    interfaces: asArray(data.interfaces).map(cloneItem),
    diagnostics: asArray(data.diagnostics).map(cloneItem),
    auditFindings: asArray(extras.audit?.findings || data.auditFindings).map(cloneItem),
    policyViolations: asArray(extras.policy?.violations || data.policyViolations).map(cloneItem),
    auditSummary: asObject(extras.audit?.summary || data.auditSummary),
    policySummary: asObject(extras.policy?.summary || data.policySummary),
    summary: asObject(data.summary),
    rawGraph: { nodes: asArray(graph.nodes).map(cloneItem), edges: asArray(graph.edges).map(cloneItem) },
    nodeConnections: asArray(extras.nodeConnections || data.nodeConnections).map(cloneItem)
  };

  // Make graph IDs total and deterministic without mutating analyzer data.
  const seenGraphIds = new Set();
  model.graph = { nodes: [], edges: model.rawGraph.edges.map(cloneItem) };
  for (let index = 0; index < model.rawGraph.nodes.length; index += 1) {
    const original = model.rawGraph.nodes[index];
    const requested = text(original.id);
    let id = requested;
    if (!id || seenGraphIds.has(id)) {
      id = `synthetic:${slug(original.kind || 'Entity')}:${slug(original.name || index)}:${index}`;
    }
    seenGraphIds.add(id);
    model.graph.nodes.push({ ...original, id, ...(requested && requested !== id ? { analyzer_id: requested } : {}) });
  }
  model.graphById = new Map(model.graph.nodes.map(node => [node.id, node]));

  model.entityById = new Map();
  model.entitiesByCategory = new Map(Object.keys(CATEGORY_KIND).map(key => [key, []]));
  model.graphIdToEntityId = new Map();
  model.aliases = new Map();

  const addAlias = (alias, id) => {
    const value = text(alias).trim();
    if (!value) return;
    const set = model.aliases.get(value) || new Set();
    set.add(id); model.aliases.set(value, set);
  };
  const addEntity = (category, item, id, kind = CATEGORY_KIND[category]) => {
    let finalId = id;
    let counter = 2;
    while (model.entityById.has(finalId)) finalId = `${id}#${counter++}`;
    const entity = {
      id: finalId,
      category,
      kind,
      name: displayName(category, item),
      data: item
    };
    model.entityById.set(finalId, entity);
    model.entitiesByCategory.get(category)?.push(entity);
    addAlias(finalId, finalId);
    addAlias(entity.name, finalId);
    addAlias(item.name, finalId);
    addAlias(item.declared_ros_name, finalId);
    addAlias(item.source_symbol, finalId);
    addAlias(item.package, finalId);
    if (category === 'interfaces') {
      addAlias(interfaceFullType(item), finalId);
      if (item.kind) addAlias(`${item.package}/${item.kind}/${item.name}`, finalId);
    }
    return entity;
  };

  const graphCandidates = kind => model.graph.nodes.filter(node => graphKindName(node) === kind);
  const claimGraphNode = (entity, candidates) => {
    const candidate = candidates.find(node => !model.graphIdToEntityId.has(node.id));
    if (candidate) model.graphIdToEntityId.set(candidate.id, entity.id);
    return candidate;
  };

  // Packages.
  const packageGraph = graphCandidates('Package');
  model.packages.forEach((item, index) => {
    const candidate = packageGraph.find(node => text(node.name) === text(item.name));
    const id = candidate?.id || `package:${item.name || index}`;
    const entity = addEntity('packages', item, id);
    if (candidate) model.graphIdToEntityId.set(candidate.id, entity.id);
  });

  // Source nodes. Prefer provenance to names because duplicate symbols are valid.
  const nodeGraph = graphCandidates('Node');
  model.nodes.forEach((item, index) => {
    const candidate = nodeGraph.find(node => !model.graphIdToEntityId.has(node.id) &&
      text(node.package) === text(item.package) &&
      (text(node.file_path) && text(item.file_path) ? text(node.file_path) === text(item.file_path) : true) &&
      [item.name, item.source_symbol, item.declared_ros_name].filter(Boolean).includes(node.name));
    const id = candidate?.id || `source:${slug(item.package || 'pkg')}:${slug(item.source_symbol || item.name || index)}:${index}`;
    const entity = addEntity('nodes', item, id);
    if (candidate) model.graphIdToEntityId.set(candidate.id, entity.id);
  });

  // Deployments have explicit IDs in 0.1.3.
  const deploymentGraph = graphCandidates('Deployment');
  model.deployments.forEach((item, index) => {
    const candidate = deploymentGraph.find(node => !model.graphIdToEntityId.has(node.id) &&
      ((item.id && node.id === item.id) || text(node.name) === text(item.name)));
    const id = candidate?.id || text(item.id) || `deployment:${slug(item.name || item.executable || index)}:${index}`;
    const entity = addEntity('deployments', item, id);
    if (candidate) model.graphIdToEntityId.set(candidate.id, entity.id);
  });

  // Resolved names identify shared ROS entities. Unresolved graph IDs identify
  // individual evidence records and must never be merged by their display name.
  for (const [category, kind] of [['topics', 'Topic'], ['services', 'Service'], ['actions', 'Action']]) {
    const source = model[category];
    const graphNodes = graphCandidates(kind);
    const names = new Set(source.filter(item => !isUnresolvedCommunication(item)).map(item => text(item.name)).filter(Boolean));
    graphNodes.filter(item => !isUnresolvedCommunication(item)).forEach(item => names.add(text(item.name)));
    const sourceByName = new Map(source.filter(item => !isUnresolvedCommunication(item)).map(item => [text(item.name), item]));
    const rebuilt = [];
    for (const name of [...names].filter(Boolean).sort(stableCompare)) {
      const matching = graphNodes.filter(node => !isUnresolvedCommunication(node) && text(node.name) === name);
      const merged = { ...(sourceByName.get(name) || {}), ...(matching[0] || {}), name };
      delete merged.id;
      rebuilt.push(merged);
      const entity = addEntity(category, merged, canonicalCommunicationId(kind, name), kind);
      matching.forEach(node => model.graphIdToEntityId.set(node.id, entity.id));
    }
    const unresolvedNodes = graphNodes.filter(isUnresolvedCommunication).sort((a, b) => stableCompare(a.id, b.id));
    for (const node of unresolvedNodes) {
      const item = { ...node };
      delete item.id;
      rebuilt.push(item);
      const entity = addEntity(category, item, node.id, kind);
      model.graphIdToEntityId.set(node.id, entity.id);
    }
    if (!unresolvedNodes.length) {
      source.filter(isUnresolvedCommunication).forEach((item, index) => {
        const copy = { ...item };
        delete copy.id;
        rebuilt.push(copy);
        addEntity(category, copy, `unresolved:${kind.toLowerCase()}:summary:${index}`, kind);
      });
    }
    model[category] = rebuilt;
  }

  // Interfaces.
  const interfaceGraph = graphCandidates('Interface');
  model.interfaces.forEach((item, index) => {
    const candidate = interfaceGraph.find(node => !model.graphIdToEntityId.has(node.id) &&
      text(node.package) === text(item.package) && text(node.name) === text(item.name));
    const id = candidate?.id || `interface:${slug(item.package || 'pkg')}/${slug(item.kind || 'iface')}/${slug(item.name || index)}`;
    const entity = addEntity('interfaces', item, id);
    if (candidate) model.graphIdToEntityId.set(candidate.id, entity.id);
  });

  // Any graph entity not represented in top-level arrays remains inspectable.
  for (const node of model.graph.nodes) {
    if (model.graphIdToEntityId.has(node.id)) continue;
    const category = KIND_CATEGORY[node.kind];
    if (!category) continue;
    const entity = addEntity(category, { ...node }, node.id, node.kind);
    model.graphIdToEntityId.set(node.id, entity.id);
  }

  model.relationships = [];
  model.incoming = new Map();
  model.outgoing = new Map();
  const relationKeys = new Set();
  const addRelationship = (source, target, rel, metadata = {}) => {
    if (!source || !target || !rel || !model.entityById.has(source) || !model.entityById.has(target)) return null;
    const key = `${source}|${rel}|${target}`;
    if (relationKeys.has(key)) {
      const existing = model.relationships.find(item => `${item.source}|${item.rel}|${item.target}` === key);
      if (existing) existing.evidence = mergeEvidence(existing.evidence, metadata);
      return existing || null;
    }
    relationKeys.add(key);
    const relationship = {
      id: relationId(source, rel, target, metadata), source, target, rel,
      evidence: { ...metadata }
    };
    model.relationships.push(relationship);
    const outgoing = model.outgoing.get(source) || []; outgoing.push(relationship); model.outgoing.set(source, outgoing);
    const incoming = model.incoming.get(target) || []; incoming.push(relationship); model.incoming.set(target, incoming);
    return relationship;
  };

  // Real graph relationships. Unknown/non-entity endpoints are retained separately for details/troubleshooting.
  model.orphanEdges = [];
  for (const edge of model.rawGraph.edges) {
    const source = model.graphIdToEntityId.get(text(edge.source));
    const target = model.graphIdToEntityId.get(text(edge.target));
    if (source && target) addRelationship(source, target, text(edge.rel) || 'related', edge);
    else model.orphanEdges.push({ ...edge });
  }

  // Explicit deployment -> source relation from deployment metadata, independent of graph quirks.
  for (const entity of model.entitiesByCategory.get('deployments') || []) {
    const item = entity.data;
    const source = model.graphIdToEntityId.get(text(item.source_node_id)) || resolveSourceNodeForDeployment(model, item);
    if (source) addRelationship(source, entity.id, 'deploys_as', { launch_file: item.launch_file, confidence: item.confidence, resolution: item.resolution });
  }

  // Reconcile the richer real `nodes --show-connections` output with actor-specific graph IDs.
  for (const record of model.nodeConnections) {
    const sourceId = resolveSourceNode(model, record);
    for (const connection of asArray(record.connections)) {
      const kind = String(connection.kind || '').toLowerCase();
      const commCategory = kind === 'topic' ? 'topics' : kind === 'service' ? 'services' : kind === 'action' ? 'actions' : '';
      if (!commCategory || connection.name === '<dynamic>') continue;
      const comm = findEntityByName(model, commCategory, connection.name);
      if (!comm) continue;
      let actorId = sourceId;
      if (connection.deployment) {
        const deployments = findEntitiesByName(model, 'deployments', connection.deployment);
        if (deployments.length === 1) actorId = deployments[0].id;
        else if (deployments.length > 1 && sourceId) {
          actorId = deployments.find(dep => (model.incoming.get(dep.id) || []).some(rel => rel.rel === 'deploys_as' && rel.source === sourceId))?.id || actorId;
        }
      }
      const rel = text(connection.role);
      if (actorId && COMM_RELS.has(rel)) addRelationship(actorId, comm.id, rel, connection);
    }
  }

  // Endpoint evidence is a conservative fallback when --show-connections is absent/incomplete.
  for (const entity of model.entitiesByCategory.get('nodes') || []) {
    const groups = [
      ['publishers', 'topics', 'publishes'], ['subscriptions', 'topics', 'subscribes'],
      ['services', 'services', 'provides'], ['clients', 'services', 'calls'],
      ['action_servers', 'actions', 'provides'], ['action_clients', 'actions', 'calls']
    ];
    for (const [field, category, rel] of groups) {
      for (const endpoint of asArray(entity.data[field])) {
        const target = endpoint.name === '<dynamic>' ? null : findEntityByName(model, category, endpoint.name);
        if (target) addRelationship(entity.id, target.id, rel, endpoint);
        const iface = findInterfaceByType(model, endpoint.msg_type);
        if (iface) addRelationship(entity.id, iface.id, 'uses_interface', endpoint);
      }
    }
  }

  // Manifest dependencies are authoritative static package evidence too.
  for (const pkgEntity of model.entitiesByCategory.get('packages') || []) {
    const dependencies = asObject(pkgEntity.data.dependencies);
    for (const [depType, names] of Object.entries(dependencies)) {
      for (const depName of asArray(names)) {
        const target = findEntityByName(model, 'packages', depName);
        if (target) addRelationship(pkgEntity.id, target.id, 'depends_on', { dependency_type: depType });
      }
    }
  }

  model.relationships.sort((a, b) => stableCompare(`${a.source}|${a.rel}|${a.target}`, `${b.source}|${b.rel}|${b.target}`));
  for (const map of [model.incoming, model.outgoing]) {
    for (const [key, values] of map) map.set(key, stableSort(values, value => `${value.rel}|${value.source}|${value.target}`));
  }

  model.findings = [];
  model.findingsByEntity = new Map();
  const addFinding = (source, finding, index) => {
    const normalized = {
      id: `finding:${source}:${index}:${hash(`${finding.rule_type || finding.code}|${finding.message}|${asArray(finding.affected_entities).join('|')}`)}`,
      source,
      severity: normalizedSeverity(finding.severity),
      type: text(finding.rule_type || finding.code, source),
      message: text(finding.message, 'ROS2 Inspector finding'),
      affected_entities: asArray(finding.affected_entities).map(String),
      policy_file: text(finding.policy_file),
      policy_line: finding.policy_line,
      file: text(finding.file),
      line: finding.line,
      raw: { ...finding }
    };
    const dedupeKey = `${source}|${normalized.severity}|${normalized.type}|${normalized.message}|${normalized.affected_entities.join(',')}|${normalized.file}|${normalized.line || ''}`;
    if (model.findings.some(item => item._dedupeKey === dedupeKey)) return;
    normalized._dedupeKey = dedupeKey;
    model.findings.push(normalized);
    const associated = associateFinding(model, normalized);
    normalized.entityIds = associated;
    for (const entityId of associated) {
      const list = model.findingsByEntity.get(entityId) || [];
      list.push(normalized); model.findingsByEntity.set(entityId, list);
    }
  };
  model.diagnostics.forEach((finding, index) => addFinding('diagnostic', finding, index));
  model.auditFindings.forEach((finding, index) => addFinding('audit', finding, index));
  model.policyViolations.forEach((finding, index) => addFinding('policy', finding, index));
  model.findings.sort(compareFindings);
  for (const [id, values] of model.findingsByEntity) model.findingsByEntity.set(id, [...values].sort(compareFindings));

  model.state = {
    generatedAt: extras.generatedAt || null,
    durationMs: Number(extras.durationMs || 0),
    cliVersion: extras.cliVersion || null,
    workspace: extras.workspace || null
  };
  return model;
}

function mergeEvidence(existing, metadata) {
  const result = { ...(existing || {}) };
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value !== undefined && value !== null && value !== '' && result[key] === undefined) result[key] = value;
  }
  return result;
}

function resolveSourceNode(model, record) {
  const candidates = model.entitiesByCategory.get('nodes') || [];
  const exactFile = candidates.filter(entity => text(entity.data.file_path) && text(entity.data.file_path) === text(record.file_path));
  const names = [record.name, record.source_symbol, record.declared_ros_name].filter(Boolean);
  const pool = exactFile.length ? exactFile : candidates;
  return pool.find(entity => text(entity.data.package) === text(record.package) && names.some(name => [entity.data.name, entity.data.source_symbol, entity.data.declared_ros_name].includes(name)))?.id || null;
}

function resolveSourceNodeForDeployment(model, deployment) {
  const incomingGraph = model.rawGraph.edges.filter(edge => text(edge.target) === text(deployment.id) && text(edge.rel) === 'deploys_as');
  for (const edge of incomingGraph) {
    const source = model.graphIdToEntityId.get(text(edge.source)); if (source) return source;
  }
  return null;
}

function findEntitiesByName(model, category, name) {
  const target = text(name);
  return (model.entitiesByCategory.get(category) || []).filter(entity =>
    [entity.name, entity.data.name, entity.data.declared_ros_name, entity.data.source_symbol, interfaceFullType(entity.data)].filter(Boolean).includes(target));
}
function findEntityByName(model, category, name) { return findEntitiesByName(model, category, name)[0] || null; }
function findInterfaceByType(model, type) {
  const target = text(type);
  if (!target || target === 'unknown') return null;
  return (model.entitiesByCategory.get('interfaces') || []).find(entity => interfaceFullType(entity.data) === target || `${entity.data.package}/${entity.data.kind}/${entity.data.name}` === target) || null;
}

function resolveEntityReferences(model, reference) {
  const ref = text(reference).trim();
  if (!ref) return [];
  if (model.entityById.has(ref)) return [ref];
  const aliases = [...(model.aliases.get(ref) || [])];
  if (!aliases.length) return [];
  const entities = aliases.map(id => model.entityById.get(id)).filter(Boolean);
  // Prefer the semantic entity class implied by an exact analyzer reference.
  const nodeMatches = entities.filter(entity => entity.category === 'nodes' && [entity.data.name, entity.data.source_symbol, entity.data.declared_ros_name].includes(ref));
  if (nodeMatches.length) return nodeMatches.map(entity => entity.id);
  if (ref.startsWith('/')) {
    const communication = entities.filter(entity => ['topics', 'services', 'actions'].includes(entity.category) && entity.data.name === ref);
    if (communication.length) return communication.map(entity => entity.id);
  }
  const packageMatches = entities.filter(entity => entity.category === 'packages' && entity.data.name === ref);
  if (packageMatches.length) return packageMatches.map(entity => entity.id);
  const interfaceMatches = entities.filter(entity => entity.category === 'interfaces' && [interfaceFullType(entity.data), `${entity.data.package}/${entity.data.kind}/${entity.data.name}`].includes(ref));
  if (interfaceMatches.length) return interfaceMatches.map(entity => entity.id);
  return [...new Set(aliases)];
}

function associateFinding(model, finding) {
  const ids = new Set();
  for (const ref of finding.affected_entities) resolveEntityReferences(model, ref).forEach(id => ids.add(id));
  const sourceFile = finding.file;
  if (sourceFile) {
    for (const entity of model.entityById.values()) {
      const location = sourceLocationFromEntity(entity, model);
      if (location?.file === sourceFile) ids.add(entity.id);
      if (entity.category === 'deployments' && text(entity.data.launch_file) === sourceFile) ids.add(entity.id);
    }
  }
  return [...ids].sort(stableCompare);
}

function compareFindings(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
    stableCompare(a.type, b.type) || stableCompare(a.message, b.message);
}

function displayName(kind, item) {
  if (!item) return 'Unknown';
  if (kind === 'nodes') return item.declared_ros_name || item.name || item.source_symbol || 'Node';
  if (kind === 'deployments') return item.name || item.deployment_name || item.executable || 'Deployment';
  if (kind === 'interfaces') return item.package ? `${item.package}/${item.name}` : (item.name || 'Interface');
  if (kind === 'diagnostics' || kind === 'auditFindings' || kind === 'policyViolations') return item.message || item.code || item.rule_type || 'Finding';
  return item.name || item.package || item.code || 'Unknown';
}

function itemDescription(kind, item) {
  if (kind === 'packages') return [item.version, item.package_type].filter(Boolean).join(' · ');
  if (kind === 'nodes') return [item.package, item.language].filter(Boolean).join(' · ');
  if (kind === 'deployments') return [item.executable, item.namespace].filter(Boolean).join(' · ');
  if (kind === 'topics') return item.msg_type || 'unknown';
  if (kind === 'services') return item.srv_type || 'unknown';
  if (kind === 'actions') return item.action_type || 'unknown';
  if (kind === 'interfaces') return item.kind || '';
  if (kind === 'diagnostics') return item.code || item.severity || '';
  if (kind === 'auditFindings' || kind === 'policyViolations') return [item.severity, item.rule_type].filter(Boolean).join(' · ');
  return '';
}

function categoryRows(model) {
  return CATEGORIES.map(([key, label, icon]) => ({ key, label, icon, count: asArray(model?.[key]).length }));
}

function sourceLocationFromEntity(entity, model) {
  if (!entity) return null;
  return sourceLocation(entity.category, entity.data, model);
}

function sourceLocation(kind, item, model) {
  if (!item) return null;
  if (text(item.file_path)) return { file: item.file_path, line: validLine(item.line) };
  if (kind === 'diagnostics' && text(item.file)) return { file: item.file, line: validLine(item.line) };
  if (kind === 'deployments') {
    if (text(item.launch_file)) return { file: item.launch_file, line: validLine(item.line) };
    const entity = item.id ? model?.entityById?.get(item.id) : null;
    const incoming = entity ? model.incoming.get(entity.id) || [] : [];
    const sourceRel = incoming.find(rel => rel.rel === 'deploys_as');
    const sourceEntity = sourceRel ? model.entityById.get(sourceRel.source) : null;
    if (sourceEntity?.data?.file_path) return { file: sourceEntity.data.file_path, line: validLine(sourceEntity.data.line) };
    if (item.source_node_id && model?.graphIdToEntityId) {
      const sourceId = model.graphIdToEntityId.get(item.source_node_id);
      const source = sourceId ? model.entityById.get(sourceId) : null;
      if (source?.data?.file_path) return { file: source.data.file_path, line: validLine(source.data.line) };
    }
  }
  return null;
}

function findingLocation(finding, model) {
  if (!finding) return null;
  if (finding.file) return { file: finding.file, line: validLine(finding.line) };
  if (finding.source === 'policy' && finding.policy_file && finding.policy_line && !['policy', 'audit'].includes(finding.policy_file)) {
    return { file: finding.policy_file, line: validLine(finding.policy_line) };
  }
  if (finding.entityIds?.length === 1) return sourceLocationFromEntity(model.entityById.get(finding.entityIds[0]), model);
  return null;
}

function editorDiagnostics(model) {
  const out = [];
  const dedupe = new Set();
  for (const finding of model.findings || []) {
    const location = findingLocation(finding, model);
    if (!location) continue;
    const key = `${location.file}|${location.line}|${finding.severity}|${finding.type}|${finding.message}`;
    if (dedupe.has(key)) continue; dedupe.add(key);
    out.push({ file: location.file, line: location.line, severity: finding.severity, message: finding.message, code: finding.type, source: finding.source });
  }
  for (const entity of model.entitiesByCategory.get('nodes') || []) {
    const node = entity.data;
    if (!node.has_dynamic_names || !node.file_path) continue;
    const item = { file: node.file_path, line: validLine(node.line), severity: 'warning', message: `ROS name or endpoint could not be fully resolved statically for ${node.name || 'node'}.`, code: 'dynamic_ros_name', source: 'diagnostic' };
    const key = `${item.file}|${item.line}|${item.code}|${item.message}`;
    if (!dedupe.has(key)) { dedupe.add(key); out.push(item); }
  }
  return stableSort(out, item => `${item.file}|${String(item.line).padStart(8, '0')}|${item.code}`);
}

function entityRelationships(model, entityId, direction = 'both') {
  const values = [];
  if (direction === 'both' || direction === 'outgoing') values.push(...(model.outgoing.get(entityId) || []));
  if (direction === 'both' || direction === 'incoming') values.push(...(model.incoming.get(entityId) || []));
  return stableSort(values, rel => `${rel.rel}|${rel.source}|${rel.target}`);
}
function relatedEntities(model, entityId, { rels = null, direction = 'both' } = {}) {
  const allowed = rels ? new Set(rels) : null;
  const ids = new Set();
  for (const rel of entityRelationships(model, entityId, direction)) {
    if (allowed && !allowed.has(rel.rel)) continue;
    ids.add(rel.source === entityId ? rel.target : rel.source);
  }
  return [...ids].map(id => model.entityById.get(id)).filter(Boolean).sort((a, b) => stableCompare(a.name, b.name));
}
function relationshipTargets(model, entityId, rel, direction = 'outgoing') {
  return entityRelationships(model, entityId, direction)
    .filter(item => item.rel === rel)
    .map(item => model.entityById.get(direction === 'incoming' ? item.source : item.target))
    .filter(Boolean);
}
function entityFindings(model, entityId) { return model.findingsByEntity.get(entityId) || []; }

function graphSlice(model, mode = 'comms', maxNodes = 350, options = {}) {
  const numeric = Number(maxNodes);
  const limit = Number.isFinite(numeric) ? Math.min(2000, Math.max(25, Math.floor(numeric))) : 350;
  const relations = mode === 'deps' ? new Set(['depends_on']) : mode === 'comms' ? new Set(['publishes', 'subscribes', 'provides', 'calls', 'deploys_as']) : null;
  const allowedKinds = mode === 'deps' ? new Set(['Package']) : mode === 'comms' ? new Set(['Node', 'Deployment', 'Topic', 'Service', 'Action']) : null;
  const kindFilter = new Set(asArray(options.kinds).filter(Boolean));
  const relationshipFilter = new Set(asArray(options.relationships).filter(Boolean));
  const packageFilter = text(options.package);
  const namespaceFilter = text(options.namespace);
  const search = text(options.search).toLowerCase();
  const hideIsolated = Boolean(options.hideIsolated);
  const focusId = text(options.focusId);
  const hops = options.hops === 2 ? 2 : options.hops === 1 ? 1 : 0;

  let entities = [...model.entityById.values()].filter(entity => !allowedKinds || allowedKinds.has(entity.kind));
  if (kindFilter.size) entities = entities.filter(entity => kindFilter.has(entity.kind));
  if (packageFilter) entities = entities.filter(entity => entity.data.package === packageFilter || (entity.kind === 'Package' && entity.name === packageFilter));
  if (namespaceFilter) entities = entities.filter(entity => String(entity.data.namespace || '').startsWith(namespaceFilter));
  if (search) entities = entities.filter(entity => entitySearchText(entity).includes(search));
  let candidateIds = new Set(entities.map(entity => entity.id));

  let relationships = model.relationships.filter(rel => candidateIds.has(rel.source) && candidateIds.has(rel.target) && (!relations || relations.has(rel.rel)) && (!relationshipFilter.size || relationshipFilter.has(rel.rel)));
  if (hideIsolated) {
    const connected = new Set(relationships.flatMap(rel => [rel.source, rel.target]));
    candidateIds = new Set([...candidateIds].filter(id => connected.has(id)));
    entities = entities.filter(entity => candidateIds.has(entity.id));
  }

  if (focusId && candidateIds.has(focusId) && hops) {
    const focused = neighborhoodIds({ relationships }, focusId, hops);
    focused.add(focusId);
    candidateIds = new Set([...candidateIds].filter(id => focused.has(id)));
    entities = entities.filter(entity => candidateIds.has(entity.id));
    relationships = relationships.filter(rel => candidateIds.has(rel.source) && candidateIds.has(rel.target));
  }

  const totalNodes = entities.length;
  const degree = new Map();
  relationships.forEach(rel => { degree.set(rel.source, (degree.get(rel.source) || 0) + 1); degree.set(rel.target, (degree.get(rel.target) || 0) + 1); });
  entities.sort((a, b) => {
    if (focusId) { if (a.id === focusId) return -1; if (b.id === focusId) return 1; }
    const degreeDelta = (degree.get(b.id) || 0) - (degree.get(a.id) || 0);
    return degreeDelta || stableCompare(`${a.kind}|${a.name}|${a.id}`, `${b.kind}|${b.name}|${b.id}`);
  });
  const selected = entities.slice(0, limit);
  const ids = new Set(selected.map(entity => entity.id));
  const selectedRelationships = relationships.filter(rel => ids.has(rel.source) && ids.has(rel.target));
  return {
    nodes: selected.map(entity => ({ id: entity.id, kind: entity.kind, name: entity.name, ...entity.data, finding_severity: highestFindingSeverity(model, entity.id) })),
    edges: selectedRelationships.map(rel => ({ id: rel.id, source: rel.source, target: rel.target, rel: rel.rel, ...rel.evidence })),
    truncated: totalNodes > selected.length,
    totalNodes,
    displayedNodes: selected.length,
    limit
  };
}

function neighborhoodIds(input, startId, hops = 1) {
  const relationships = asArray(input.relationships || input.edges);
  const seen = new Set([startId]);
  let frontier = new Set([startId]);
  for (let depth = 0; depth < hops; depth += 1) {
    const next = new Set();
    for (const rel of relationships) {
      if (frontier.has(rel.source) && !seen.has(rel.target)) next.add(rel.target);
      if (frontier.has(rel.target) && !seen.has(rel.source)) next.add(rel.source);
    }
    next.forEach(id => seen.add(id)); frontier = next;
  }
  return seen;
}

function entitySearchText(entity) {
  const data = entity.data || {};
  return [entity.id, entity.kind, entity.name, data.package, data.namespace, data.executable,
    data.msg_type, data.srv_type, data.action_type, interfaceFullType(data)].filter(Boolean).join(' ').toLowerCase();
}

function highestFindingSeverity(model, entityId) {
  const findings = entityFindings(model, entityId);
  return findings.reduce((best, finding) => (SEVERITY_ORDER[finding.severity] ?? 9) < (SEVERITY_ORDER[best] ?? 9) ? finding.severity : best, 'none');
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
    `Diagnostics: ${model.diagnostics.length}`,
    `Audit findings: ${model.auditFindings.length}`,
    `Policy violations: ${model.policyViolations.length}`
  ].join('\n');
}

function isRelevantFile(filePath) {
  const basename = path.basename(filePath);
  if (basename === 'package.xml' || basename === 'setup.py' || basename === 'setup.cfg' || basename === 'pyproject.toml') return true;
  return /\.(py|cpp|cc|cxx|hpp|h|msg|srv|action|xml|ya?ml)$/i.test(filePath);
}

function isPathInside(root, file) {
  if (!root || !file) return false;
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findingGroups(findings) {
  const groups = [];
  for (const severity of ['error', 'warning', 'info']) {
    const severityItems = asArray(findings).filter(item => normalizedSeverity(item.severity) === severity);
    if (!severityItems.length) continue;
    const byType = new Map();
    severityItems.forEach(item => { const type = item.rule_type || item.code || 'other'; const list = byType.get(type) || []; list.push(item); byType.set(type, list); });
    groups.push({ severity, types: [...byType.entries()].sort((a, b) => stableCompare(a[0], b[0])).map(([type, items]) => ({ type, items: stableSort(items, item => item.message) })) });
  }
  return groups;
}

module.exports = {
  CATEGORIES, CATEGORY_KIND, COMM_RELS, normalize, displayName, itemDescription, categoryRows,
  sourceLocation, sourceLocationFromEntity, findingLocation, editorDiagnostics, graphSlice,
  summaryText, isRelevantFile, isPathInside, entityRelationships, relatedEntities,
  relationshipTargets, entityFindings, neighborhoodIds, entitySearchText, highestFindingSeverity,
  findingGroups, validLine, stableSort, stableCompare, interfaceFullType, resolveEntityReferences
};
