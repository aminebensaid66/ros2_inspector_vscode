'use strict';

const vscode = require('vscode');
const { graphSlice, sourceLocation } = require('./model');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function nonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

function graphHtml(model, mode, maxNodes, nonceValue = nonce()) {
  const graph = graphSlice(model, mode, maxNodes);
  const banner = graph.truncated
    ? `<div class="banner">Showing ${graph.nodes.length} of ${graph.totalNodes} nodes. Increase <code>ros2Inspector.graph.maxNodes</code> if needed.</div>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonceValue}'; script-src 'nonce-${nonceValue}';">
<style nonce="${nonceValue}">
:root{color-scheme:light dark} body{margin:0;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);overflow:hidden}
.toolbar{height:46px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}
button,select,input{color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px 8px;border-radius:4px} button{cursor:pointer}.spacer{flex:1}.banner{padding:7px 12px;background:var(--vscode-inputValidation-warningBackground);border-bottom:1px solid var(--vscode-inputValidation-warningBorder)}
#viewport{position:absolute;top:47px;bottom:0;left:0;right:0;overflow:auto}.banner+#viewport{top:79px} svg{min-width:100%;min-height:100%}.edge{stroke:var(--vscode-descriptionForeground);stroke-width:1.2;opacity:.55}.edgeLabel{font-size:10px;fill:var(--vscode-descriptionForeground)}
.node rect{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-focusBorder);stroke-width:1}.node text{font-size:12px;fill:var(--vscode-foreground);pointer-events:none}.node{cursor:pointer}.node.dim{opacity:.12}.edge.dim,.edgeLabel.dim{opacity:.05}.selected rect{stroke-width:3}
.kind-Package rect{stroke:#4aa5f0}.kind-Node rect{stroke:#e5a84b}.kind-Deployment rect{stroke:#a979e8}.kind-Topic rect{stroke:#4fc3a1}.kind-Service rect{stroke:#df80a6}.kind-Action rect{stroke:#e67b70}.kind-Interface rect{stroke:#7ba7ff}
#details{position:absolute;right:16px;top:62px;max-width:360px;max-height:55vh;overflow:auto;padding:12px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);box-shadow:0 4px 18px #0004;border-radius:6px;display:none;white-space:pre-wrap}.muted{color:var(--vscode-descriptionForeground)}
</style></head><body>
<div class="toolbar"><strong>ROS2 Inspector</strong><select id="mode"><option value="comms"${mode==='comms'?' selected':''}>Communications</option><option value="deps"${mode==='deps'?' selected':''}>Dependencies</option><option value="full"${mode==='full'?' selected':''}>Full architecture</option></select><input id="search" type="search" placeholder="Filter entities…" aria-label="Filter entities"><button id="fit">Fit</button><span class="spacer"></span><span class="muted">${graph.nodes.length} nodes · ${graph.edges.length} edges</span></div>${banner}<div id="viewport"><svg id="graph" role="img" aria-label="ROS 2 architecture graph"></svg></div><div id="details"></div>
<script nonce="${nonceValue}">const vscode=acquireVsCodeApi(); const DATA=${safeJson(graph)};
const svg=document.getElementById('graph'), details=document.getElementById('details'), search=document.getElementById('search');
const NS='http://www.w3.org/2000/svg', nodeW=170,nodeH=48,colGap=250,rowGap=78,pad=60; const order=['Package','Node','Deployment','Topic','Service','Action','Interface'];
const columns=new Map(order.map((k,i)=>[k,i])); const grouped=new Map(); DATA.nodes.forEach(n=>{const k=n.kind||'Other'; if(!grouped.has(k))grouped.set(k,[]); grouped.get(k).push(n)});
const pos=new Map(); let maxRows=1; [...grouped.entries()].forEach(([kind,nodes])=>{maxRows=Math.max(maxRows,nodes.length); const c=columns.has(kind)?columns.get(kind):order.length; nodes.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id))).forEach((n,r)=>pos.set(n.id,{x:pad+c*colGap,y:pad+r*rowGap}))});
svg.setAttribute('width',pad*2+(order.length+1)*colGap); svg.setAttribute('height',pad*2+maxRows*rowGap);
const edgeLayer=document.createElementNS(NS,'g'), nodeLayer=document.createElementNS(NS,'g'); svg.append(edgeLayer,nodeLayer);
function textEl(tag,attrs,text){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v)); if(text!==undefined)e.textContent=text;return e}
DATA.edges.forEach((e,i)=>{const a=pos.get(e.source),b=pos.get(e.target);if(!a||!b)return; const x1=a.x+nodeW,y1=a.y+nodeH/2,x2=b.x,y2=b.y+nodeH/2; const line=textEl('line',{x1,y1,x2,y2,class:'edge','data-source':e.source,'data-target':e.target});edgeLayer.append(line); const label=textEl('text',{x:(x1+x2)/2,y:(y1+y2)/2-4,class:'edgeLabel','data-source':e.source,'data-target':e.target},e.rel||'');edgeLayer.append(label)});
DATA.nodes.forEach(n=>{const p=pos.get(n.id);const g=textEl('g',{transform:'translate('+p.x+' '+p.y+')',class:'node kind-'+(n.kind||'Other'),'data-id':n.id,'data-label':String(n.name||n.id).toLowerCase()});g.append(textEl('rect',{width:nodeW,height:nodeH,rx:7,ry:7}));g.append(textEl('text',{x:10,y:19},String(n.name||n.id).slice(0,24)));g.append(textEl('text',{x:10,y:36,class:'muted'},String(n.kind||'').slice(0,24)));g.addEventListener('click',()=>selectNode(n,g));nodeLayer.append(g)});
function selectNode(n,g){document.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));g.classList.add('selected'); const keys=['kind','name','package','language','executable','namespace','msg_type','srv_type','action_type','confidence','resolution','file_path','line']; const lines=keys.filter(k=>n[k]!==undefined&&n[k]!==null&&n[k]!=='').map(k=>k+': '+String(n[k])); details.textContent=lines.join('\\n'); const btn=document.createElement('button');btn.textContent='Open source';btn.style.marginTop='10px';btn.onclick=()=>vscode.postMessage({type:'openSource',id:n.id});details.append(document.createElement('br'),btn);details.style.display='block'}
function applyFilter(){const q=search.value.trim().toLowerCase();document.querySelectorAll('.node').forEach(n=>n.classList.toggle('dim',q&&!n.dataset.label.includes(q)));document.querySelectorAll('.edge,.edgeLabel').forEach(e=>{const s=document.querySelector('.node[data-id="'+CSS.escape(e.dataset.source)+'"]'),t=document.querySelector('.node[data-id="'+CSS.escape(e.dataset.target)+'"]');e.classList.toggle('dim',q&&(s?.classList.contains('dim')||t?.classList.contains('dim')))});} search.addEventListener('input',applyFilter);
document.getElementById('mode').addEventListener('change',e=>vscode.postMessage({type:'mode',mode:e.target.value}));document.getElementById('fit').addEventListener('click',()=>{document.getElementById('viewport').scrollTo({left:0,top:0,behavior:'smooth'})});
</script></body></html>`;
}

class GraphPanel {
  constructor(context, model, maxNodes, onOpenSource) {
    this.context = context;
    this.model = model;
    this.maxNodes = maxNodes;
    this.mode = 'comms';
    this.onOpenSource = onOpenSource;
    this.panel = vscode.window.createWebviewPanel('ros2Inspector.graph', 'ROS2 Inspector Architecture', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    this.panel.webview.onDidReceiveMessage(message => this._message(message));
    this.render();
  }
  update(model) { this.model = model; this.render(); }
  render() { this.panel.webview.html = graphHtml(this.model, this.mode, this.maxNodes); }
  _message(message) {
    if (message?.type === 'mode' && ['comms','deps','full'].includes(message.mode)) { this.mode = message.mode; this.render(); return; }
    if (message?.type === 'openSource' && message.id) {
      const node = this.model.graphById.get(message.id);
      if (!node) return;
      let candidate = node;
      if (node.kind === 'Deployment' && node.source_node_id) candidate = this.model.graphById.get(node.source_node_id) || node;
      const location = sourceLocation(node.kind === 'Deployment' ? 'deployments' : 'nodes', candidate, this.model);
      if (location) this.onOpenSource(location);
    }
  }
}

module.exports = { GraphPanel, graphHtml, escapeHtml, safeJson };
