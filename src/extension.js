'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const { InspectorBackend, InspectorError } = require('./backend');
const { normalize, sourceLocation, summaryText, isRelevantFile } = require('./model');
const { ExplorerProvider } = require('./treeProvider');
const { publishDiagnostics } = require('./diagnostics');
const { GraphPanel } = require('./graphPanel');

let currentModel = null;
let currentWorkspace = null;
let graphPanel = null;
let refreshTimer = null;

function config() { return vscode.workspace.getConfiguration('ros2Inspector'); }
function outputLine(output, text) { output.appendLine(`[${new Date().toISOString()}] ${text}`); }

function workspacePath() {
  const explicit = config().get('workspacePath', '').trim();
  if (explicit) return path.resolve(explicit.replace(/^~(?=$|\/|\\)/, require('node:os').homedir()));
  if (currentWorkspace) return currentWorkspace;
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
}

function backend(output) {
  return new InspectorBackend({
    executable: config().get('executablePath', 'ros2inspector'),
    minimumVersion: config().get('minimumVersion', '0.1.3'),
    logger: message => outputLine(output, message)
  });
}

async function ensureTrusted() {
  if (vscode.workspace.isTrusted) return true;
  const choice = await vscode.window.showWarningMessage('ROS2 Inspector executes a local analyzer process. Trust this workspace before analysis.', 'Manage Workspace Trust');
  if (choice === 'Manage Workspace Trust') await vscode.commands.executeCommand('workbench.trust.manage');
  return false;
}

async function openLocation(location) {
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.file));
    const editor = await vscode.window.showTextDocument(document, { preview: true });
    const line = Math.max(0, Number(location.line || 1) - 1);
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to open source: ${error.message}`);
  }
}

async function activate(context) {
  const output = vscode.window.createOutputChannel('ROS2 Inspector');
  const diagnostics = vscode.languages.createDiagnosticCollection('ros2inspector');
  const explorer = new ExplorerProvider();
  const tree = vscode.window.createTreeView('ros2Inspector.explorer', { treeDataProvider: explorer, showCollapseAll: true });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.command = 'ros2Inspector.refresh';
  status.text = '$(type-hierarchy) ROS2 Inspector';
  status.tooltip = 'Refresh ROS 2 architecture';
  status.show();
  context.subscriptions.push(output, diagnostics, tree, status);

  async function refresh({ silent = false } = {}) {
    const root = workspacePath();
    if (!root) {
      explorer.update({ model: null, error: 'Open a ROS 2 workspace folder first.' });
      if (!silent) vscode.window.showInformationMessage('Open a ROS 2 workspace folder before running ROS2 Inspector.');
      return;
    }
    if (!await ensureTrusted()) return;
    explorer.update({ busy: true, error: null });
    status.text = '$(sync~spin) ROS2 Inspector';
    status.tooltip = `Analyzing ${root}`;
    try {
      const client = backend(output);
      const version = await client.checkVersion();
      const raw = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'ROS2 Inspector: analyzing workspace' }, () => client.inspect(root));
      currentModel = normalize(raw);
      explorer.update({ model: currentModel, busy: false, error: null });
      publishDiagnostics(diagnostics, currentModel);
      graphPanel?.update(currentModel);
      status.text = `$(pass-filled) ROS2 Inspector ${version.raw}`;
      status.tooltip = summaryText(currentModel);
      outputLine(output, `Analysis complete. ${summaryText(currentModel).replaceAll('\n', ', ')}`);
      if (!silent) vscode.window.setStatusBarMessage('ROS2 Inspector analysis complete.', 2500);
    } catch (error) {
      diagnostics.clear();
      const message = error instanceof InspectorError ? error.message : String(error.message || error);
      outputLine(output, `${message}\n${error.stderr || ''}`);
      explorer.update({ busy: false, error: message });
      status.text = '$(error) ROS2 Inspector';
      status.tooltip = message;
      if (!silent) {
        const action = await vscode.window.showErrorMessage(`${message} Install/update with: python -m pip install -U ros2inspector`, 'Show Output');
        if (action === 'Show Output') output.show(true);
      }
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.refresh', () => refresh()));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.showOutput', () => output.show(true)));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.selectWorkspace', async () => {
    const chosen = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Use as ROS2 Inspector workspace' });
    if (!chosen?.[0]) return;
    currentWorkspace = chosen[0].fsPath;
    await refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.openSource', async element => {
    const kind = element?.kind || element?.dataKind;
    const data = element?.data || element;
    const location = sourceLocation(kind, data, currentModel);
    if (location) await openLocation(location);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.openGraph', async () => {
    if (!currentModel) await refresh({ silent: true });
    if (!currentModel) return;
    const maxNodes = Number(config().get('graph.maxNodes', 350));
    if (graphPanel?.panel) { graphPanel.panel.reveal(vscode.ViewColumn.One); graphPanel.update(currentModel); }
    else {
      graphPanel = new GraphPanel(context, currentModel, maxNodes, openLocation);
      graphPanel.panel.onDidDispose(() => { graphPanel = null; });
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copySummary', async () => {
    if (!currentModel) await refresh({ silent: true });
    if (currentModel) { await vscode.env.clipboard.writeText(summaryText(currentModel)); vscode.window.setStatusBarMessage('ROS2 Inspector summary copied.', 2000); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.validate', async () => {
    const root = workspacePath(); if (!root || !await ensureTrusted()) return;
    const configured = config().get('policyFile', 'ros2inspector_policy.yaml');
    const policy = path.isAbsolute(configured) ? configured : path.join(root, configured);
    if (!fs.existsSync(policy)) { vscode.window.showWarningMessage(`ROS2 Inspector policy file not found: ${policy}`); return; }
    try {
      const result = await backend(output).validate(root, policy, 'error');
      const violations = result.violations || [];
      if (!violations.length) vscode.window.showInformationMessage('ROS2 Inspector: policy validation passed with no violations.');
      else {
        const summary = result.summary?.violations || {};
        const message = `ROS2 Inspector: ${summary.errors || 0} error(s), ${summary.warnings || 0} warning(s), ${summary.info || 0} info.`;
        result.exitCode === 1 ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message);
      }
      outputLine(output, JSON.stringify(result, null, 2));
    } catch (error) { outputLine(output, `${error.message}\n${error.stderr || ''}`); vscode.window.showErrorMessage(error.message); }
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    if (!config().get('refreshOnSave', true) || !isRelevantFile(document.fileName)) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh({ silent: true }), 700);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('ros2Inspector')) refresh({ silent: true });
  }));

  if (vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) refresh({ silent: true });
}

function deactivate() { if (refreshTimer) clearTimeout(refreshTimer); }
module.exports = { activate, deactivate };
