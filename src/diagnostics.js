'use strict';

const vscode = require('vscode');
const { editorDiagnostics } = require('./model');

function severity(value) {
  if (value === 'error') return vscode.DiagnosticSeverity.Error;
  if (value === 'info') return vscode.DiagnosticSeverity.Information;
  return vscode.DiagnosticSeverity.Warning;
}

function publishDiagnostics(collection, model) {
  collection.clear();
  const grouped = new Map();
  for (const item of editorDiagnostics(model)) {
    const uri = vscode.Uri.file(item.file);
    const key = uri.toString();
    const list = grouped.get(key) || { uri, diagnostics: [] };
    const line = Math.max(0, item.line - 1);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
      item.message,
      severity(item.severity)
    );
    diagnostic.source = 'ROS2 Inspector';
    diagnostic.code = item.code;
    list.diagnostics.push(diagnostic);
    grouped.set(key, list);
  }
  for (const { uri, diagnostics } of grouped.values()) collection.set(uri, diagnostics);
}

module.exports = { publishDiagnostics };
