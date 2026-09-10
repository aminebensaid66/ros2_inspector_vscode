'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vscode = require('vscode');
const { InspectorBackend, InspectorError } = require('./backend');
const {
  normalize, sourceLocationFromEntity, sourceLocation, summaryText, isRelevantFile,
  isPathInside, relatedEntities, interfaceFullType
} = require('./model');
const { ExplorerProvider } = require('./treeProvider');
const { publishDiagnostics } = require('./diagnostics');
const { GraphPanel } = require('./graphPanel');
const { DetailsPanel } = require('./detailsPanel');
const { RefreshCoordinator } = require('./refreshController');

function config() { return vscode.workspace.getConfiguration('ros2Inspector'); }
function outputLine(output, text) { output.appendLine(`[${new Date().toISOString()}] ${text}`); }
function expandHome(value) { return String(value || '').replace(/^~(?=$|\/|\\)/, os.homedir()); }
function clampNumber(value, fallback, min, max) {
  const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function starterPolicy() {
  return `# ROS2 Inspector architecture policy (schema version 1)\n# Supported by ros2inspector 0.1.3+. Adjust these rules to your project.\nversion: 1\nrules:\n  - type: maintainer_required\n    severity: warning\n    require_email: true\n\n  - type: version_not_default\n    severity: warning\n\n  - type: no_circular_deps\n    severity: error\n\n  - type: node_isolation\n    severity: warning\n    skip_dynamic_names: true\n\n  - type: topic_connectivity\n    no_publisher: true\n    no_subscriber: true\n    severity_no_publisher: warning\n    severity_no_subscriber: info\n`;
}

function suggestedRosCommand(entity) {
  if (!entity) return '';
  const name = entity.data?.declared_ros_name || entity.data?.name || entity.name;
  if (entity.kind === 'Topic') return `ros2 topic info ${name}`;
  if (entity.kind === 'Service') return `ros2 service type ${name}`;
  if (entity.kind === 'Action') return `ros2 action info ${name}`;
  if (entity.kind === 'Node' || entity.kind === 'Deployment') return `ros2 node info ${name}`;
  if (entity.kind === 'Interface') return `ros2 interface show ${interfaceFullType(entity.data)}`;
  if (entity.kind === 'Package') return `ros2 pkg prefix ${name}`;
  return '';
}

function configuredWorkspacePath(selectedWorkspace) {
  const explicit = config().get('workspacePath', '').trim();
  if (explicit) return path.resolve(expandHome(explicit));
  if (selectedWorkspace) return selectedWorkspace;
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
}

async function ensureTrusted() {
  if (vscode.workspace.isTrusted) return true;
  const choice = await vscode.window.showWarningMessage(
    'ROS2 Inspector runs a local static analyzer process. Trust this workspace before analysis.',
    'Manage Workspace Trust'
  );
  if (choice === 'Manage Workspace Trust') await vscode.commands.executeCommand('workbench.trust.manage');
  return false;
}

async function openLocation(location) {
  if (!location?.file) return;
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

function safeFilename(root, preferred) {
  const parsed = path.parse(preferred || 'ros2inspector_policy.yaml');
  const base = parsed.name || 'ros2inspector_policy'; const ext = parsed.ext || '.yaml';
  let candidate = path.join(root, `${base}${ext}`); let number = 2;
  while (fs.existsSync(candidate)) candidate = path.join(root, `${base}_${number++}${ext}`);
  return candidate;
}

async function activate(context) {
  const output = vscode.window.createOutputChannel('ROS2 Inspector');
  const diagnostics = vscode.languages.createDiagnosticCollection('ros2inspector');
  const explorer = new ExplorerProvider();
  const tree = vscode.window.createTreeView('ros2Inspector.explorer', { treeDataProvider: explorer, showCollapseAll: true });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  const coordinator = new RefreshCoordinator();
  let selectedWorkspace = null;
  let graphPanel = null;
  let detailsPanel = null;
  let refreshTimer = null;
  let backendClient = null;
  let backendKey = '';
  let currentModel = null;
  let lastArchitecture = null;
  let lastNodeConnections = [];
  let lastAudit = null;
  let lastPolicy = null;
  let cliVersion = null;
  let lastSuccessAt = null;
  let lastDurationMs = 0;
  let analysisState = 'unavailable';
  let lastError = null;

  function rootPath() { return configuredWorkspacePath(selectedWorkspace); }
  function getBackend() {
    const executable = config().get('executablePath', 'ros2inspector');
    const minimumVersion = config().get('minimumVersion', '0.1.3');
    const timeoutMs = clampNumber(config().get('analyzer.timeoutMs', 120000), 120000, 1000, 600000);
    const maxOutputMb = clampNumber(config().get('analyzer.maxOutputMB', 20), 20, 1, 200);
    const key = `${executable}|${minimumVersion}|${timeoutMs}|${maxOutputMb}`;
    if (!backendClient || key !== backendKey) {
      backendClient = new InspectorBackend({
        executable, minimumVersion, timeoutMs, maxOutputBytes: Math.floor(maxOutputMb * 1024 * 1024),
        logger: message => outputLine(output, message)
      });
      backendKey = key;
    }
    return backendClient;
  }
  function rebuildModel() {
    if (!lastArchitecture) return null;
    return normalize(lastArchitecture, {
      nodeConnections: lastNodeConnections, audit: lastAudit, policy: lastPolicy,
      cliVersion: cliVersion?.raw || null, durationMs: lastDurationMs,
      generatedAt: lastSuccessAt?.toISOString() || null, workspace: rootPath()
    });
  }
  function statusTooltip() {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**ROS2 Inspector** — ${analysisState}\n\n`);
    markdown.appendMarkdown(`Workspace: \`${rootPath() || 'none'}\`\n\n`);
    markdown.appendMarkdown(`CLI: ${cliVersion?.raw || 'unknown'}\n\n`);
    if (lastSuccessAt) markdown.appendMarkdown(`Last successful refresh: ${lastSuccessAt.toLocaleString()}\n\nDuration: ${lastDurationMs} ms\n\n`);
    if (lastError) markdown.appendMarkdown(`Last error: ${lastError}\n\n`);
    if (currentModel) markdown.appendCodeblock(summaryText(currentModel));
    return markdown;
  }
  function updateStatus() {
    const icon = analysisState === 'analyzing' ? '$(sync~spin)' : analysisState === 'fresh' ? '$(pass-filled)' : analysisState === 'stale' ? '$(warning)' : analysisState === 'failed' ? '$(error)' : '$(type-hierarchy)';
    status.text = `${icon} ROS2 Inspector${cliVersion?.raw ? ` ${cliVersion.raw}` : ''}`;
    status.tooltip = statusTooltip(); status.command = 'ros2Inspector.refresh'; status.show();
  }
  function publishModel() {
    explorer.update({ model: currentModel, busy: analysisState === 'analyzing', error: lastError, state: analysisState });
    publishDiagnostics(diagnostics, currentModel);
    graphPanel?.update(currentModel);
    detailsPanel?.update(currentModel);
    updateStatus();
  }
  function clearFindings(kind) {
    if (kind === 'audit') lastAudit = null; if (kind === 'policy') lastPolicy = null;
    currentModel = rebuildModel(); publishModel();
  }
  function entityFromArgument(argument) {
    if (!currentModel) return null;
    if (argument?.entityId) return currentModel.entityById.get(argument.entityId) || null;
    if (argument?.entity?.id) return currentModel.entityById.get(argument.entity.id) || argument.entity;
    if (argument?.kind === 'entity' && argument.entity) return argument.entity;
    const data = argument?.data || argument;
    if (data?.id && currentModel.entityById.has(data.id)) return currentModel.entityById.get(data.id);
    return null;
  }
  async function openEntitySource(entityId) {
    const entity = currentModel?.entityById.get(entityId); if (!entity) return;
    const location = sourceLocationFromEntity(entity, currentModel); if (location) await openLocation(location);
  }
  function ensureGraph() {
    if (!currentModel) return null;
    const maxNodes = clampNumber(config().get('graph.maxNodes', 350), 350, 25, 2000);
    if (!graphPanel?.panel) {
      graphPanel = new GraphPanel(context, currentModel, maxNodes, {
        onOpenSource: openEntitySource,
        onOpenLocation: openLocation,
        onShowDetails: showDetails,
        onDispose: () => { graphPanel = null; }
      });
    } else graphPanel.setMaxNodes(maxNodes);
    return graphPanel;
  }
  function ensureDetails() {
    if (!currentModel) return null;
    if (!detailsPanel?.panel) {
      detailsPanel = new DetailsPanel(currentModel, {
        onOpenSource: openEntitySource,
        onRevealGraph: revealGraph,
        onCopy: value => vscode.env.clipboard.writeText(value),
        onDispose: () => { detailsPanel = null; }
      });
    }
    return detailsPanel;
  }
  function showDetails(argument) {
    const entity = typeof argument === 'string' ? currentModel?.entityById.get(argument) : entityFromArgument(argument);
    if (entity) ensureDetails()?.show(entity.id);
  }
  function revealGraph(argument) {
    const entity = typeof argument === 'string' ? currentModel?.entityById.get(argument) : entityFromArgument(argument);
    if (!entity) return; ensureGraph()?.revealEntity(entity.id);
  }

  async function refresh({ silent = false } = {}) {
    const root = rootPath();
    if (!root) {
      analysisState = 'unavailable'; lastError = 'Open a ROS 2 workspace folder first.'; currentModel = null; diagnostics.clear(); publishModel();
      if (!silent) vscode.window.showInformationMessage(lastError); return;
    }
    if (!await ensureTrusted()) return;
    const run = coordinator.begin();
    analysisState = 'analyzing'; lastError = null; explorer.update({ model: currentModel, busy: true, error: null, state: analysisState }); updateStatus();
    try {
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ROS2 Inspector: analyzing workspace', cancellable: true }, async (_progress, token) => {
        const cancelDisposable = token.onCancellationRequested(() => run.controller.abort('user'));
        try { return await getBackend().inspectBundle(root, { signal: run.signal }); } finally { cancelDisposable.dispose(); }
      });
      if (!coordinator.isCurrent(run.generation)) return;
      lastArchitecture = result.architecture; lastNodeConnections = result.nodeConnections; cliVersion = result.version; lastDurationMs = result.durationMs;
      lastAudit = null; lastPolicy = null; // Findings must be rerun for the new architecture snapshot.
      lastSuccessAt = new Date(); analysisState = 'fresh'; lastError = null; currentModel = rebuildModel(); publishModel();
      outputLine(output, `Analysis complete in ${lastDurationMs} ms. ${summaryText(currentModel).replaceAll('\n', ', ')}`);
      if (!silent) vscode.window.setStatusBarMessage('ROS2 Inspector analysis complete.', 2500);
    } catch (error) {
      if (!coordinator.isCurrent(run.generation) || (error instanceof InspectorError && error.code === 'cancelled')) {
        if (run.generation === coordinator.generation) {
          analysisState = currentModel ? 'stale' : 'unavailable'; lastError = 'Analysis cancelled.'; publishModel();
        }
        return;
      }
      lastError = error instanceof InspectorError ? error.message : String(error.message || error);
      outputLine(output, `${lastError}\n${error.stderr || ''}`);
      analysisState = currentModel ? 'stale' : 'failed'; publishModel();
      if (!silent) {
        const action = await vscode.window.showErrorMessage(`${lastError} Install/update with: python -m pip install -U ros2inspector`, 'Show Output');
        if (action === 'Show Output') output.show(true);
      }
    }
  }

  async function ensureAnalysis() { if (!currentModel || analysisState !== 'fresh') await refresh({ silent: true }); return currentModel; }

  async function runAudit() {
    const root = rootPath(); if (!root || !await ensureTrusted() || !await ensureAnalysis()) return;
    const controller = new AbortController();
    try {
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ROS2 Inspector: architecture audit', cancellable: true }, async (_p, token) => {
        const disposable = token.onCancellationRequested(() => controller.abort('user'));
        try { return await getBackend().audit(root, { signal: controller.signal }); } finally { disposable.dispose(); }
      });
      lastAudit = result; currentModel = rebuildModel(); publishModel(); outputLine(output, `AUDIT RESULT\n${JSON.stringify(result, null, 2)}`);
      const total = result.summary?.total_findings ?? result.findings?.length ?? 0;
      const message = `ROS2 Inspector audit: ${total} finding(s).`;
      result.exitCode === 1 ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message);
    } catch (error) {
      clearFindings('audit'); outputLine(output, `Audit failed: ${error.message}\n${error.stderr || ''}`);
      if (!(error instanceof InspectorError && error.code === 'cancelled')) vscode.window.showErrorMessage(error.message);
    }
  }

  async function validatePolicy() {
    const root = rootPath(); if (!root || !await ensureTrusted() || !await ensureAnalysis()) return;
    const configured = config().get('policyFile', 'ros2inspector_policy.yaml');
    const policy = path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(root, configured);
    if (!fs.existsSync(policy)) { vscode.window.showWarningMessage(`ROS2 Inspector policy file not found: ${policy}`); return; }
    const controller = new AbortController();
    try {
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ROS2 Inspector: validating policy', cancellable: true }, async (_p, token) => {
        const disposable = token.onCancellationRequested(() => controller.abort('user'));
        try { return await getBackend().validate(root, policy, 'error', { signal: controller.signal }); } finally { disposable.dispose(); }
      });
      lastPolicy = result; currentModel = rebuildModel(); publishModel(); outputLine(output, `POLICY RESULT\n${JSON.stringify(result, null, 2)}`);
      const summary = result.summary?.violations || {}; const count = result.violations?.length || 0;
      const message = `ROS2 Inspector policy: ${summary.errors || 0} error(s), ${summary.warnings || 0} warning(s), ${summary.info || 0} info (${count} total).`;
      result.exitCode === 1 ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message);
    } catch (error) {
      clearFindings('policy'); outputLine(output, `Policy validation failed: ${error.message}\n${error.stderr || ''}`);
      if (!(error instanceof InspectorError && error.code === 'cancelled')) vscode.window.showErrorMessage(error.message);
    }
  }

  context.subscriptions.push(output, diagnostics, tree, status, explorer, { dispose: () => coordinator.dispose() });
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.refresh', () => refresh()));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.runAudit', runAudit));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.validate', validatePolicy));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.showFindings', () => vscode.commands.executeCommand('ros2Inspector.explorer.focus')));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.showOutput', () => output.show(true)));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.selectWorkspace', async () => {
    const chosen = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Use as ROS2 Inspector workspace' });
    if (!chosen?.[0]) return; selectedWorkspace = chosen[0].fsPath; await refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.openSource', async argument => {
    const entity = entityFromArgument(argument);
    if (entity) await openEntitySource(entity.id);
    else {
      const kind = argument?.kind || argument?.dataKind; const data = argument?.data || argument;
      const location = sourceLocation(kind, data, currentModel); if (location) await openLocation(location);
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.showDetails', showDetails));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.revealInGraph', revealGraph));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.openGraph', async () => { if (!await ensureAnalysis()) return; ensureGraph()?.panel.reveal(vscode.ViewColumn.One); }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copySummary', async () => { if (!await ensureAnalysis()) return; await vscode.env.clipboard.writeText(summaryText(currentModel)); vscode.window.setStatusBarMessage('ROS2 Inspector summary copied.', 2000); }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copyRosName', async argument => { const entity = entityFromArgument(argument); if (entity) await vscode.env.clipboard.writeText(String(entity.data.declared_ros_name || entity.data.name || entity.name)); }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copyInterfaceType', async argument => { const entity = entityFromArgument(argument); if (!entity) return; const value = entity.data.msg_type || entity.data.srv_type || entity.data.action_type || (entity.kind === 'Interface' ? interfaceFullType(entity.data) : ''); if (value) await vscode.env.clipboard.writeText(String(value)); }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copySourcePath', async argument => { const entity = entityFromArgument(argument); const location = entity && sourceLocationFromEntity(entity, currentModel); if (location) await vscode.env.clipboard.writeText(location.file); }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.copyRosCommand', async argument => { const entity = entityFromArgument(argument); const command = suggestedRosCommand(entity); if (command) { await vscode.env.clipboard.writeText(command); vscode.window.setStatusBarMessage('Suggested ROS command copied as text; it was not executed.', 2500); } }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.focusRelated', async argument => {
    const entity = entityFromArgument(argument); if (!entity) return;
    const related = relatedEntities(currentModel, entity.id); if (!related.length) { vscode.window.showInformationMessage('No related entities found in the static architecture.'); return; }
    const choice = await vscode.window.showQuickPick(related.map(item => ({ label: item.name, description: item.kind, entity: item })), { placeHolder: `Related to ${entity.name}` });
    if (choice?.entity) showDetails(choice.entity.id);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.showFinding', argument => {
    output.show(true); outputLine(output, `FINDING\n${JSON.stringify(argument?.data || argument, null, 2)}`);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ros2Inspector.createStarterPolicy', async () => {
    const root = rootPath(); if (!root || !await ensureTrusted()) return;
    const configured = path.basename(config().get('policyFile', 'ros2inspector_policy.yaml')) || 'ros2inspector_policy.yaml';
    const target = safeFilename(root, configured); await fs.promises.writeFile(target, starterPolicy(), { encoding: 'utf8', flag: 'wx' });
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target)); await vscode.window.showTextDocument(document); vscode.window.showInformationMessage(`Created ROS2 Inspector starter policy: ${path.basename(target)}`);
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    const root = rootPath(); if (!root || !config().get('refreshOnSave', true) || !isRelevantFile(document.fileName) || !isPathInside(root, document.fileName)) return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh({ silent: true }), 700);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
    const root = rootPath(); if (selectedWorkspace && event.removed?.some(folder => folder.uri.fsPath === selectedWorkspace)) selectedWorkspace = null;
    if (root || vscode.workspace.workspaceFolders?.length) refresh({ silent: true }); else { currentModel = null; analysisState = 'unavailable'; lastError = 'Open a ROS 2 workspace folder first.'; publishModel(); }
  }));
  if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => refresh({ silent: true })));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('ros2Inspector.graph.maxNodes')) { graphPanel?.setMaxNodes(clampNumber(config().get('graph.maxNodes', 350), 350, 25, 2000)); return; }
    const analysisKeys = ['ros2Inspector.executablePath', 'ros2Inspector.workspacePath', 'ros2Inspector.minimumVersion', 'ros2Inspector.analyzer.timeoutMs', 'ros2Inspector.analyzer.maxOutputMB'];
    if (analysisKeys.some(key => event.affectsConfiguration(key))) { backendClient?.invalidateVersionCache(); backendClient = null; backendKey = ''; coordinator.cancel('configuration'); refresh({ silent: true }); }
  }));

  updateStatus();
  if (vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) refresh({ silent: true });
}

function deactivate() { /* VS Code disposes subscriptions registered by activate. */ }

module.exports = {
  activate, deactivate, starterPolicy, suggestedRosCommand, safeFilename, clampNumber
};
