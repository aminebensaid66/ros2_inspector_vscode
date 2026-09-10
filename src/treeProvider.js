'use strict';

const vscode = require('vscode');
const {
  categoryRows, itemDescription, sourceLocationFromEntity, entityFindings,
  stableSort, stableCompare, highestFindingSeverity
} = require('./model');

const ENTITY_ICONS = {
  Package: 'package', Node: 'symbol-class', Deployment: 'run', Topic: 'radio-tower',
  Service: 'server-process', Action: 'play-circle', Interface: 'symbol-interface'
};
const REL_LABELS = {
  deploys_as: 'Deployments', publishes: 'Publishers', subscribes: 'Subscriptions',
  provides: 'Provides', calls: 'Calls', uses_interface: 'Interfaces', depends_on: 'Dependencies'
};
const SEVERITY_ICON = { error: 'error', warning: 'warning', info: 'info' };

function uniqueEntities(values) {
  const map = new Map(); values.filter(Boolean).forEach(entity => map.set(entity.id, entity));
  return [...map.values()].sort((a, b) => stableCompare(`${a.kind}|${a.name}|${a.id}`, `${b.kind}|${b.name}|${b.id}`));
}

function actorsForSource(model, entityId) {
  const deployments = (model.outgoing.get(entityId) || []).filter(rel => rel.rel === 'deploys_as').map(rel => rel.target);
  return [entityId, ...deployments];
}

function targetsForActors(model, actorIds, rel) {
  const values = [];
  for (const actorId of actorIds) {
    for (const relation of model.outgoing.get(actorId) || []) {
      if (relation.rel === rel) values.push(model.entityById.get(relation.target));
    }
  }
  return uniqueEntities(values);
}

function incomingActors(model, entityId, rel) {
  return uniqueEntities((model.incoming.get(entityId) || []).filter(item => item.rel === rel).map(item => model.entityById.get(item.source)));
}

function packageEntities(model, packageName, category) {
  return uniqueEntities((model.entitiesByCategory.get(category) || []).filter(entity => entity.data.package === packageName));
}

function group(key, label, entities, icon = 'list-tree') {
  const items = uniqueEntities(entities);
  return items.length ? { key, label: `${label} (${items.length})`, entities: items, icon } : null;
}

function findingGroup(findings) {
  return findings.length ? { key: 'findings', label: `Findings (${findings.length})`, findings, icon: 'warning' } : null;
}

function entityGroups(model, entity) {
  if (!entity) return [];
  const groups = [];
  const findings = entityFindings(model, entity.id);
  if (entity.kind === 'Package') {
    const metadata = [
      ['version', `Version: ${entity.data.version || 'unknown'}`],
      ['type', `Type: ${entity.data.package_type || 'unknown'}`],
      ['health', `Health: ${entity.data.health_score ?? 'unknown'}`],
      ['license', `License: ${(entity.data.licenses || []).join(', ') || entity.data.license || 'unknown'}`],
      ['maintainers', `Maintainers: ${(entity.data.maintainers || []).join(', ') || 'unknown'}`]
    ].map(([key, label]) => ({ key, label }));
    groups.push({ key: 'metadata', label: 'Metadata', values: metadata, icon: 'info' });
    groups.push(group('dependencies', 'Dependencies', targetsForActors(model, [entity.id], 'depends_on'), 'references'));
    groups.push(group('nodes', 'Source nodes', packageEntities(model, entity.name, 'nodes'), 'symbol-class'));
    const sourceIds = packageEntities(model, entity.name, 'nodes').map(item => item.id);
    const deployments = uniqueEntities(sourceIds.flatMap(id => targetsForActors(model, [id], 'deploys_as')));
    groups.push(group('deployments', 'Deployments', deployments, 'run'));
    groups.push(group('interfaces', 'Interfaces', packageEntities(model, entity.name, 'interfaces'), 'symbol-interface'));
  } else if (entity.kind === 'Node') {
    const actors = actorsForSource(model, entity.id);
    groups.push(group('deployments', 'Deployments', targetsForActors(model, [entity.id], 'deploys_as'), 'run'));
    groups.push(group('publishers', 'Publishers', targetsForActors(model, actors, 'publishes'), 'arrow-right'));
    groups.push(group('subscriptions', 'Subscriptions', targetsForActors(model, actors, 'subscribes'), 'arrow-left'));
    groups.push(group('services-provided', 'Services provided', targetsForActors(model, actors, 'provides').filter(item => item.kind === 'Service'), 'server-process'));
    groups.push(group('service-clients', 'Service clients', targetsForActors(model, actors, 'calls').filter(item => item.kind === 'Service'), 'plug'));
    groups.push(group('action-servers', 'Action servers', targetsForActors(model, actors, 'provides').filter(item => item.kind === 'Action'), 'play-circle'));
    groups.push(group('action-clients', 'Action clients', targetsForActors(model, actors, 'calls').filter(item => item.kind === 'Action'), 'debug-start'));
    groups.push(group('interfaces', 'Interfaces', targetsForActors(model, [entity.id], 'uses_interface'), 'symbol-interface'));
  } else if (entity.kind === 'Deployment') {
    groups.push(group('source', 'Source node', incomingActors(model, entity.id, 'deploys_as'), 'symbol-class'));
    groups.push(group('publishers', 'Published topics', targetsForActors(model, [entity.id], 'publishes').filter(item => item.kind === 'Topic'), 'arrow-right'));
    groups.push(group('subscriptions', 'Subscribed topics', targetsForActors(model, [entity.id], 'subscribes').filter(item => item.kind === 'Topic'), 'arrow-left'));
    groups.push(group('services-provided', 'Services provided', targetsForActors(model, [entity.id], 'provides').filter(item => item.kind === 'Service'), 'server-process'));
    groups.push(group('service-clients', 'Service clients', targetsForActors(model, [entity.id], 'calls').filter(item => item.kind === 'Service'), 'plug'));
    groups.push(group('action-servers', 'Action servers', targetsForActors(model, [entity.id], 'provides').filter(item => item.kind === 'Action'), 'play-circle'));
    groups.push(group('action-clients', 'Action clients', targetsForActors(model, [entity.id], 'calls').filter(item => item.kind === 'Action'), 'debug-start'));
    const remaps = Object.entries(entity.data.remaps || {}).sort((a, b) => stableCompare(a[0], b[0])).map(([from, to]) => ({ key: `${from}->${to}`, label: `${from} → ${to}` }));
    if (remaps.length) groups.push({ key: 'remaps', label: `Remappings (${remaps.length})`, values: remaps, icon: 'replace' });
    const parameters = Array.isArray(entity.data.parameters) ? entity.data.parameters : [];
    if (parameters.length) groups.push({ key: 'parameters', label: `Parameters (${parameters.length})`, values: parameters.map((value, index) => ({ key: String(index), label: typeof value === 'string' ? value : JSON.stringify(value) })), icon: 'settings-gear' });
  } else if (entity.kind === 'Topic') {
    groups.push(group('publishers', 'Publishers', incomingActors(model, entity.id, 'publishes'), 'arrow-right'));
    groups.push(group('subscribers', 'Subscribers', incomingActors(model, entity.id, 'subscribes'), 'arrow-left'));
  } else if (entity.kind === 'Service') {
    groups.push(group('providers', 'Providers', incomingActors(model, entity.id, 'provides'), 'server-process'));
    groups.push(group('clients', 'Clients', incomingActors(model, entity.id, 'calls'), 'plug'));
  } else if (entity.kind === 'Action') {
    groups.push(group('servers', 'Servers', incomingActors(model, entity.id, 'provides'), 'play-circle'));
    groups.push(group('clients', 'Clients', incomingActors(model, entity.id, 'calls'), 'debug-start'));
  } else if (entity.kind === 'Interface') {
    groups.push(group('users', 'Used by', incomingActors(model, entity.id, 'uses_interface'), 'references'));
  }
  groups.push(findingGroup(findings));
  return groups.filter(Boolean);
}

function findingSeverityGroups(findings) {
  return ['error', 'warning', 'info'].map(severity => {
    const items = findings.filter(item => String(item.severity || 'warning').toLowerCase() === severity);
    return items.length ? { severity, label: `${severity[0].toUpperCase()}${severity.slice(1)} (${items.length})`, items } : null;
  }).filter(Boolean);
}

class ExplorerProvider {
  constructor() {
    this.model = null;
    this.busy = false;
    this.error = null;
    this.state = 'unavailable';
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }

  update({ model = this.model, busy = this.busy, error = this.error, state = this.state } = {}) {
    this.model = model; this.busy = busy; this.error = error; this.state = state;
    this._emitter.fire(undefined);
  }
  dispose() { this._emitter.dispose(); }
  getTreeItem(element) { return element.treeItem; }

  getChildren(element) {
    if (!element) {
      if (this.busy) return [this._message('Analyzing ROS 2 workspace…', 'sync~spin', 'analyzing')];
      if (this.error && !this.model) return [this._message(this.error, 'error', 'failed')];
      if (!this.model) return [this._message('Run “ROS2 Inspector: Refresh Workspace” to analyze this workspace.', 'info', 'unavailable')];
      const rows = categoryRows(this.model);
      const categories = rows.map(category => this._category(category));
      if (this.state === 'stale') return [this._message(`Stale results — ${this.error || 'refresh failed'}`, 'warning', 'stale'), ...categories];
      return categories;
    }
    if (!this.model) return [];
    if (element.kind === 'category') {
      if (element.key === 'diagnostics') return stableSort(this.model.diagnostics, item => `${item.severity}|${item.code}|${item.message}`).map(item => this._finding('diagnostic', item));
      if (element.key === 'auditFindings') return findingSeverityGroups(this.model.auditFindings).map(group => this._severityGroup('audit', group));
      if (element.key === 'policyViolations') return findingSeverityGroups(this.model.policyViolations).map(group => this._severityGroup('policy', group));
      return (this.model.entitiesByCategory.get(element.key) || []).map(entity => this._entity(entity));
    }
    if (element.kind === 'entity') return entityGroups(this.model, element.entity).map(groupData => this._relationshipGroup(element.entity, groupData));
    if (element.kind === 'relationshipGroup') {
      if (element.group.entities) return element.group.entities.map(entity => this._entity(entity));
      if (element.group.findings) return element.group.findings.map(finding => this._normalizedFinding(finding));
      if (element.group.values) return element.group.values.map(value => this._value(element, value));
    }
    if (element.kind === 'severityGroup') {
      const byType = new Map();
      for (const item of element.items) {
        const type = item.rule_type || item.code || 'other'; const list = byType.get(type) || []; list.push(item); byType.set(type, list);
      }
      return [...byType.entries()].sort((a, b) => stableCompare(a[0], b[0])).map(([type, items]) => this._findingTypeGroup(element.source, element.severity, type, items));
    }
    if (element.kind === 'findingTypeGroup') return stableSort(element.items, item => item.message).map(item => this._finding(element.source, item));
    return [];
  }

  _message(label, icon, state) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None); item.iconPath = new vscode.ThemeIcon(icon); item.id = `ros2Inspector.message.${state}`;
    return { kind: 'message', treeItem: item };
  }
  _category(category) {
    const item = new vscode.TreeItem(`${category.label} (${category.count})`, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon(category.icon); item.contextValue = 'ros2Inspector.category'; item.id = `ros2Inspector.category.${category.key}`;
    return { kind: 'category', key: category.key, treeItem: item };
  }
  _entity(entity) {
    const groups = entityGroups(this.model, entity);
    const item = new vscode.TreeItem(entity.name, groups.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = `ros2Inspector.entity.${entity.id}`;
    item.description = itemDescription(entity.category, entity.data);
    const severity = highestFindingSeverity(this.model, entity.id);
    item.iconPath = new vscode.ThemeIcon(severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : ENTITY_ICONS[entity.kind] || 'symbol-misc');
    const location = sourceLocationFromEntity(entity, this.model);
    item.contextValue = location ? 'ros2Inspector.entity.source' : 'ros2Inspector.entity';
    item.command = { command: 'ros2Inspector.showDetails', title: 'Show Details', arguments: [{ entityId: entity.id }] };
    item.tooltip = `${entity.kind}: ${entity.name}${item.description ? `\n${item.description}` : ''}`;
    return { kind: 'entity', entity, dataKind: entity.category, data: entity.data, treeItem: item };
  }
  _relationshipGroup(parent, groupData) {
    const item = new vscode.TreeItem(groupData.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = `ros2Inspector.group.${parent.id}.${groupData.key}`; item.iconPath = new vscode.ThemeIcon(groupData.icon || 'list-tree'); item.contextValue = 'ros2Inspector.group';
    return { kind: 'relationshipGroup', parent, group: groupData, treeItem: item };
  }
  _severityGroup(source, groupData) {
    const item = new vscode.TreeItem(groupData.label, vscode.TreeItemCollapsibleState.Collapsed); item.id = `ros2Inspector.${source}.severity.${groupData.severity}`; item.iconPath = new vscode.ThemeIcon(SEVERITY_ICON[groupData.severity]);
    return { kind: 'severityGroup', source, severity: groupData.severity, items: groupData.items, treeItem: item };
  }
  _findingTypeGroup(source, severity, type, items) {
    const item = new vscode.TreeItem(`${type} (${items.length})`, vscode.TreeItemCollapsibleState.Collapsed); item.id = `ros2Inspector.${source}.type.${severity}.${type}`; item.iconPath = new vscode.ThemeIcon('list-tree');
    return { kind: 'findingTypeGroup', source, severity, type, items, treeItem: item };
  }
  _finding(source, data) {
    const item = new vscode.TreeItem(data.message || data.code || data.rule_type || 'Finding', vscode.TreeItemCollapsibleState.None);
    const severity = String(data.severity || 'warning').toLowerCase(); item.iconPath = new vscode.ThemeIcon(SEVERITY_ICON[severity] || 'warning'); item.description = data.rule_type || data.code || '';
    item.id = `ros2Inspector.finding.${source}.${data.rule_type || data.code || 'finding'}.${String(data.message || '').slice(0, 60)}`;
    item.contextValue = 'ros2Inspector.finding'; item.command = { command: 'ros2Inspector.showFinding', title: 'Show Finding', arguments: [{ source, data }] };
    return { kind: 'finding', source, data, treeItem: item };
  }
  _normalizedFinding(data) { return this._finding(data.source || 'diagnostic', data.raw || data); }
  _value(parent, value) {
    const item = new vscode.TreeItem(value.label, vscode.TreeItemCollapsibleState.None); item.id = `ros2Inspector.value.${parent.parent.id}.${parent.group.key}.${value.key}`; item.iconPath = new vscode.ThemeIcon('symbol-string');
    return { kind: 'value', data: value, treeItem: item };
  }
}

module.exports = { ExplorerProvider, entityGroups, actorsForSource, targetsForActors, incomingActors, findingSeverityGroups, REL_LABELS };
