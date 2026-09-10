'use strict';

const vscode = require('vscode');
const { entityRelationships, entityFindings, sourceLocationFromEntity, interfaceFullType } = require('./model');

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function nonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let out = '';
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function detailPayload(entity, model) {
  const data = entity?.data || {};
  const relationships = entityRelationships(model, entity.id).map(rel => ({
    id: rel.id, rel: rel.rel, source: rel.source, target: rel.target,
    sourceName: model.entityById.get(rel.source)?.name || rel.source,
    targetName: model.entityById.get(rel.target)?.name || rel.target,
    evidence: rel.evidence || {}
  }));
  const findings = entityFindings(model, entity.id).map(item => ({
    id: item.id, source: item.source, severity: item.severity, type: item.type, message: item.message
  }));
  const location = sourceLocationFromEntity(entity, model);
  const fields = {
    Kind: entity.kind,
    Name: entity.name,
    ID: entity.id,
    Package: data.package,
    Language: data.language,
    Executable: data.executable,
    Namespace: data.namespace,
    'ROS name': data.declared_ros_name || (entity.kind === 'Deployment' ? data.name : undefined),
    'Message type': data.msg_type,
    'Service type': data.srv_type,
    'Action type': data.action_type,
    'Interface type': entity.kind === 'Interface' ? interfaceFullType(data) : undefined,
    Confidence: data.confidence,
    Evidence: data.evidence,
    Resolution: data.resolution,
    'Source file': location?.file,
    Line: location?.line,
    'Health score': data.health_score,
    Version: data.version,
    'Package type': data.package_type
  };
  if (data.remaps && Object.keys(data.remaps).length) fields.Remappings = Object.entries(data.remaps).map(([a, b]) => `${a} → ${b}`);
  if (Array.isArray(data.parameters) && data.parameters.length) fields.Parameters = data.parameters;
  if (data.dependencies && Object.keys(data.dependencies).length) fields.Dependencies = data.dependencies;
  return { entity: { id: entity.id, kind: entity.kind, name: entity.name }, fields, location, relationships, findings };
}

function detailsHtml(entity, model, nonceValue = nonce()) {
  const payload = detailPayload(entity, model);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonceValue}'; script-src 'nonce-${nonceValue}';"><style nonce="${nonceValue}">
  :root{color-scheme:light dark}body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px 22px;max-width:980px;margin:auto}h1{font-size:22px;margin:0 0 4px}.kind{color:var(--vscode-descriptionForeground);margin-bottom:16px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 20px}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:5px 9px;border-radius:3px;cursor:pointer}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}section{border-top:1px solid var(--vscode-panel-border);padding-top:14px;margin-top:18px}h2{font-size:15px}dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:8px 14px}dt{color:var(--vscode-descriptionForeground)}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.rel,.finding{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--vscode-panel-border) 45%,transparent)}.rel button{padding:2px 6px}.badge{font-size:11px;border:1px solid var(--vscode-panel-border);border-radius:9px;padding:1px 6px}.error{color:var(--vscode-errorForeground)}.warning{color:var(--vscode-editorWarning-foreground)}.info{color:var(--vscode-editorInfo-foreground)}code{font-family:var(--vscode-editor-font-family)}</style></head><body><div id="root"></div><script nonce="${nonceValue}">
  const vscode=acquireVsCodeApi();const DATA=${safeJson(payload)};const root=document.getElementById('root');
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
  root.append(el('h1',DATA.entity.name),el('div',DATA.entity.kind+' · '+DATA.entity.id,'kind'));
  const toolbar=el('div',undefined,'toolbar');
  const action=(label,type,payload={},primary=false)=>{const b=el('button',label,primary?'primary':'');b.addEventListener('click',()=>vscode.postMessage({type,...payload}));toolbar.append(b)};
  if(DATA.location)action('Open source','openSource',{entityId:DATA.entity.id},true);action('Reveal in graph','revealGraph',{entityId:DATA.entity.id});action('Copy name','copy',{value:DATA.entity.name});
  const typeValue=DATA.fields['Message type']||DATA.fields['Service type']||DATA.fields['Action type']||DATA.fields['Interface type'];if(typeValue)action('Copy interface type','copy',{value:typeValue});
  if(DATA.location)action('Copy source location','copy',{value:DATA.location.file+':'+DATA.location.line});root.append(toolbar);
  const fields=el('section');fields.append(el('h2','Static information'));const dl=el('dl');Object.entries(DATA.fields).forEach(([k,v])=>{if(v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length))return;dl.append(el('dt',k),el('dd',typeof v==='object'?JSON.stringify(v,null,2):v))});fields.append(dl);root.append(fields);
  const rels=el('section');rels.append(el('h2','Relationships ('+DATA.relationships.length+')'));DATA.relationships.forEach(r=>{const row=el('div',undefined,'rel');row.append(el('span',r.rel,'badge'));const label=r.source===DATA.entity.id?r.targetName:r.sourceName;const b=el('button',label);b.addEventListener('click',()=>vscode.postMessage({type:'navigate',entityId:r.source===DATA.entity.id?r.target:r.source}));row.append(b);const ev=Object.entries(r.evidence||{}).filter(([k,v])=>v!==undefined&&v!==null&&v!==''&&!['source','target','rel','id','key'].includes(k));if(ev.length)row.append(el('span',ev.map(([k,v])=>k+'='+String(v)).join(' · '),'kind'));rels.append(row)});root.append(rels);
  const findings=el('section');findings.append(el('h2','Findings ('+DATA.findings.length+')'));DATA.findings.forEach(f=>{const row=el('div',undefined,'finding '+f.severity);row.append(el('span',f.severity,'badge'),el('span',f.type+': '+f.message));findings.append(row)});root.append(findings);
  </script></body></html>`;
}

class DetailsPanel {
  constructor(model, callbacks = {}) {
    this.model = model; this.callbacks = callbacks; this.entityId = null;
    this.panel = vscode.window.createWebviewPanel('ros2Inspector.details', 'ROS2 Inspector Details', vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: []
    });
    this._messageDisposable = this.panel.webview.onDidReceiveMessage(message => this._message(message));
    this.panel.onDidDispose(() => { this._messageDisposable?.dispose(); this.callbacks.onDispose?.(); });
  }
  show(entityId) { this.entityId = entityId; this.panel.title = `ROS2 Inspector: ${this.model.entityById.get(entityId)?.name || 'Details'}`; this.render(); this.panel.reveal(vscode.ViewColumn.Beside, true); }
  update(model) { this.model = model; if (this.entityId && !model.entityById.has(this.entityId)) this.entityId = null; if (this.entityId) this.render(); }
  render() { const entity = this.model.entityById.get(this.entityId); if (entity) this.panel.webview.html = detailsHtml(entity, this.model); }
  _message(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'openSource' && message.entityId) this.callbacks.onOpenSource?.(message.entityId);
    else if (message.type === 'revealGraph' && message.entityId) this.callbacks.onRevealGraph?.(message.entityId);
    else if (message.type === 'navigate' && message.entityId && this.model.entityById.has(message.entityId)) this.show(message.entityId);
    else if (message.type === 'copy' && typeof message.value === 'string') this.callbacks.onCopy?.(message.value);
  }
}

module.exports = { DetailsPanel, detailsHtml, detailPayload, safeJson };
