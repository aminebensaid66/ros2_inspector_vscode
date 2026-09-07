'use strict';

const vscode = require('vscode');
const { categoryRows, displayName, itemDescription, sourceLocation } = require('./model');

class ExplorerProvider {
  constructor() {
    this.model = null;
    this.busy = false;
    this.error = null;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }

  update({ model = this.model, busy = false, error = null } = {}) {
    this.model = model;
    this.busy = busy;
    this.error = error;
    this._emitter.fire(undefined);
  }

  getTreeItem(element) { return element.treeItem; }

  getChildren(element) {
    if (!element) {
      if (this.busy) return [this._message('Analyzing ROS 2 workspace…', 'sync~spin')];
      if (this.error) return [this._message(this.error, 'error')];
      if (!this.model) return [this._message('Run “ROS2 Inspector: Refresh Workspace” to analyze this workspace.', 'info')];
      return categoryRows(this.model).map(category => this._category(category));
    }
    if (element.kind !== 'category' || !this.model) return [];
    return (this.model[element.key] || []).map(item => this._leaf(element.key, item));
  }

  _message(label, icon) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    return { kind: 'message', treeItem: item };
  }

  _category(category) {
    const item = new vscode.TreeItem(`${category.label} (${category.count})`, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon(category.icon);
    item.contextValue = 'ros2Inspector.category';
    return { kind: 'category', key: category.key, treeItem: item };
  }

  _leaf(kind, data) {
    const label = displayName(kind, data);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = itemDescription(kind, data);
    item.tooltip = new vscode.MarkdownString(`**${label}**\n\n${item.description || ''}`);
    const location = sourceLocation(kind, data, this.model);
    if (location) {
      item.contextValue = 'ros2Inspector.source';
      item.command = { command: 'ros2Inspector.openSource', title: 'Open Source', arguments: [{ kind, data }] };
    } else {
      item.contextValue = 'ros2Inspector.item';
    }
    return { kind: 'leaf', dataKind: kind, data, treeItem: item };
  }
}

module.exports = { ExplorerProvider };
