'use strict';

const vscode = require('vscode');
const { graphSlice, sourceLocationFromEntity, stableCompare } = require('./model');
const { buildScene } = require('./graphLayout');

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function nonce() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let value = ''; for (let i = 0; i < 32; i += 1) value += chars[Math.floor(Math.random() * chars.length)]; return value; }

const DEFAULT_STATE = {
  mode: 'comms', search: '', kinds: [], package: '', namespace: '', relationships: [],
  hideIsolated: false, edgeLabels: true, focusId: '', hops: 0, selectedId: '', selectedEdgeId: '',
  transform: { x: 36, y: 36, scale: 1 }
};
function normalizeGraphState(state = {}) {
  const mode = ['comms', 'deps', 'full'].includes(state.mode) ? state.mode : 'comms';
  const transform = state.transform && typeof state.transform === 'object' ? state.transform : {};
  return {
    ...DEFAULT_STATE, ...state, mode,
    kinds: Array.isArray(state.kinds) ? state.kinds.filter(Boolean) : [],
    relationships: Array.isArray(state.relationships) ? state.relationships.filter(Boolean) : [],
    hideIsolated: Boolean(state.hideIsolated), edgeLabels: state.edgeLabels !== false,
    hops: state.hops === 2 ? 2 : state.hops === 1 ? 1 : 0,
    transform: {
      x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 36,
      y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 36,
      scale: Number.isFinite(Number(transform.scale)) ? Math.min(4, Math.max(0.1, Number(transform.scale))) : 1
    }
  };
}

function graphPayload(model, state, maxNodes) {
  const normalized = normalizeGraphState(state);
  const slice = graphSlice(model, normalized.mode, maxNodes, normalized);
  slice.nodes = slice.nodes.map(node => {
    const entity = model.entityById.get(node.id);
    const location = sourceLocationFromEntity(entity, model);
    return { ...node, has_source: Boolean(location), source_location: location || null };
  });
  const scene = buildScene(slice.nodes, slice.edges, normalized.mode);
  return {
    slice, state: normalized,
    scene: {
      positions: Object.fromEntries(scene.positions),
      routes: scene.routes,
      bounds: scene.bounds
    },
    packages: [...new Set([...model.entityById.values()].map(entity => entity.data.package).filter(Boolean))].sort(stableCompare),
    namespaces: [...new Set([...model.entityById.values()].map(entity => entity.data.namespace).filter(Boolean))].sort(stableCompare),
    kinds: [...new Set([...model.entityById.values()].map(entity => entity.kind).filter(Boolean))].sort(stableCompare),
    relationships: [...new Set(model.relationships.map(item => item.rel))].sort(stableCompare)
  };
}

function graphHtml(model, stateOrMode = DEFAULT_STATE, maxNodes = 350, nonceValue = nonce()) {
  const state = typeof stateOrMode === 'string' ? { ...DEFAULT_STATE, mode: stateOrMode } : normalizeGraphState(stateOrMode);
  const payload = graphPayload(model, state, maxNodes);
  const truncated = payload.slice.truncated ? `Showing ${payload.slice.displayedNodes} of ${payload.slice.totalNodes} filtered entities (limit ${payload.slice.limit}).` : `${payload.slice.totalNodes} filtered entities.`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonceValue}'; script-src 'nonce-${nonceValue}';"><style nonce="${nonceValue}">
  :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:12px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);height:100vh;display:grid;grid-template-rows:auto 1fr}.bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px 9px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}button,select,input{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:3px;padding:4px 7px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:hover{background:var(--vscode-button-secondaryHoverBackground)}#search{width:200px}.workspace{position:relative;overflow:hidden}.canvas{width:100%;height:100%;touch-action:none;cursor:grab}.canvas.panning{cursor:grabbing}.node rect{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-panel-border);stroke-width:1.4}.node text{fill:var(--vscode-foreground);pointer-events:none}.node .sub{fill:var(--vscode-descriptionForeground);font-size:10px}.node{cursor:pointer;outline:none}.node:focus rect,.node.selected rect{stroke:var(--vscode-focusBorder);stroke-width:3}.node.error rect{stroke:var(--vscode-errorForeground)}.node.warning rect{stroke:var(--vscode-editorWarning-foreground)}.edge{stroke:var(--vscode-descriptionForeground);stroke-width:1.4;fill:none;marker-end:url(#arrow)}.edge.subscribes,.edge.depends_on{stroke-dasharray:7 4}.edge.calls,.edge.deploys_as{stroke-dasharray:3 4}.edge.uses_interface{stroke-dasharray:10 3 2 3}.edgeHit{stroke:transparent;stroke-width:12;fill:none;cursor:pointer}.edge.selected{stroke:var(--vscode-focusBorder);stroke-width:3}.edgeLabel{fill:var(--vscode-descriptionForeground);font-size:10px;paint-order:stroke;stroke:var(--vscode-editor-background);stroke-width:4px;stroke-linejoin:round;pointer-events:none}.panel{position:absolute;right:10px;top:10px;width:min(370px,42vw);max-height:calc(100% - 20px);overflow:auto;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);box-shadow:0 4px 16px #0004;padding:12px;display:none}.panel h3{margin:0 0 8px;font-size:14px}.panel pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;color:var(--vscode-descriptionForeground)}.legend{position:absolute;left:10px;bottom:10px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);padding:6px 8px;display:flex;gap:9px;flex-wrap:wrap;max-width:70%}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid var(--vscode-descriptionForeground);margin-right:4px}.status{margin-left:auto;color:var(--vscode-descriptionForeground)}.filters{display:flex;gap:5px}.check{display:flex;align-items:center;gap:3px}.hidden{display:none}</style></head><body>
  <div class="bar"><select id="mode"><option value="comms">Communications</option><option value="deps">Dependencies</option><option value="full">Full architecture</option></select><input id="search" type="search" placeholder="Search name, ID, package, namespace, type…"><select id="kind"><option value="">All kinds</option></select><select id="package"><option value="">All packages</option></select><select id="namespace"><option value="">All namespaces</option></select><select id="relationship"><option value="">All relationships</option></select><label class="check"><input id="isolated" type="checkbox"> hide isolated</label><label class="check"><input id="labels" type="checkbox"> edge labels</label><button id="zoomIn" title="Zoom in">＋</button><button id="zoomOut" title="Zoom out">－</button><button id="fit">Fit</button><button id="reset">Reset</button><button id="focus1">1-hop</button><button id="focus2">2-hop</button><button id="clearFocus">Clear focus</button><span class="status">${escapeHtml(truncated)}</span></div>
  <div class="workspace"><svg id="canvas" class="canvas" role="application" aria-label="ROS2 Inspector architecture graph"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="context-stroke"/></marker></defs><g id="viewport"><g id="edges"></g><g id="nodes"></g></g></svg><aside id="details" class="panel" aria-live="polite"></aside><div id="legend" class="legend"></div></div>
  <script nonce="${nonceValue}">const vscode=acquireVsCodeApi();const DATA=${safeJson(payload)};let state=DATA.state;const svg=document.getElementById('canvas'),viewport=document.getElementById('viewport'),nodesLayer=document.getElementById('nodes'),edgesLayer=document.getElementById('edges'),details=document.getElementById('details');
  const NS='http://www.w3.org/2000/svg';const mk=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=String(text);return n};
  const postState=()=>vscode.postMessage({type:'state',state});const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));function applyTransform(){viewport.setAttribute('transform','translate('+state.transform.x+' '+state.transform.y+') scale('+state.transform.scale+')')};applyTransform();
  function fillSelect(id,values,current){const s=document.getElementById(id);values.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.append(o)});s.value=current||''}document.getElementById('mode').value=state.mode;document.getElementById('search').value=state.search;document.getElementById('isolated').checked=state.hideIsolated;document.getElementById('labels').checked=state.edgeLabels;fillSelect('kind',DATA.kinds,state.kinds[0]);fillSelect('package',DATA.packages,state.package);fillSelect('namespace',DATA.namespaces,state.namespace);fillSelect('relationship',DATA.relationships,state.relationships[0]);
  const pos=new Map(Object.entries(DATA.scene.positions));
  DATA.scene.routes.forEach(e=>{const line=mk('path',{d:e.d,class:'edge '+String(e.rel||'other').replace(/[^a-z0-9_-]/gi,'-'),'data-id':e.id});const hit=mk('path',{d:e.d,class:'edgeHit','data-id':e.id,tabindex:'0'});hit.addEventListener('click',ev=>{ev.stopPropagation();selectEdge(e,line)});hit.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectEdge(e,line)}});edgesLayer.append(line,hit);if(state.edgeLabels){const label=mk('text',{x:e.labelX,y:e.labelY,class:'edgeLabel','text-anchor':'middle'},e.rel||'');edgesLayer.append(label)}});
  DATA.slice.nodes.forEach(n=>{const p=pos.get(n.id);if(!p)return;const sev=n.finding_severity==='error'?' error':n.finding_severity==='warning'?' warning':'';const g=mk('g',{transform:'translate('+p.x+' '+p.y+')',class:'node'+sev,'data-id':n.id,tabindex:'0',role:'button','aria-label':(n.kind||'Entity')+' '+(n.name||n.id)});g.append(mk('title',{},String(n.name||n.id)+' — '+String(n.kind||'Entity')));g.append(mk('rect',{width:p.width,height:p.height,rx:7,ry:7}));g.append(mk('text',{x:10,y:20},String(n.name||n.id).slice(0,28)));g.append(mk('text',{x:10,y:39,class:'sub'},String(n.kind||'').slice(0,24)));g.addEventListener('click',ev=>{ev.stopPropagation();selectNode(n,g)});g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectNode(n,g)}});nodesLayer.append(g)});
  function clearSelection(){document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));details.style.display='none';state.selectedId='';state.selectedEdgeId=''}
  function addButton(label,handler){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',handler);details.append(b)}function addPre(object){const pre=document.createElement('pre');pre.textContent=Object.entries(object).filter(([k,v])=>v!==undefined&&v!==null&&v!==''&&!['id'].includes(k)).map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):String(v))).join('\\n');details.append(pre)}
  function selectNode(n,g,notify=true){clearSelection();g.classList.add('selected');state.selectedId=n.id;details.textContent='';const h=document.createElement('h3');h.textContent=(n.kind||'Entity')+': '+(n.name||n.id);details.append(h);addPre(n);if(n.has_source)addButton('Open source',()=>vscode.postMessage({type:'openSource',id:n.id}));addButton('Show details',()=>vscode.postMessage({type:'showDetails',id:n.id}));addButton('Focus 1-hop',()=>{state.focusId=n.id;state.hops=1;postState()});addButton('Focus 2-hop',()=>{state.focusId=n.id;state.hops=2;postState()});details.style.display='block';if(notify)postState()}
  function selectEdge(e,line,notify=true){clearSelection();line.classList.add('selected');state.selectedEdgeId=e.id;details.textContent='';const h=document.createElement('h3');h.textContent='Relationship: '+e.rel;details.append(h);addPre(e);if((e.file_path||e.file)&&Number(e.line||1)>=1)addButton('Open source',()=>vscode.postMessage({type:'openEdgeSource',file:e.file_path||e.file,line:Number(e.line||1)}));details.style.display='block';if(notify)postState()}
  const rerender=(key,value)=>{state[key]=value;state.selectedId='';state.selectedEdgeId='';postState()};let searchTimer;document.getElementById('search').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>rerender('search',e.target.value),180)});document.getElementById('mode').addEventListener('change',e=>rerender('mode',e.target.value));document.getElementById('kind').addEventListener('change',e=>rerender('kinds',e.target.value?[e.target.value]:[]));document.getElementById('package').addEventListener('change',e=>rerender('package',e.target.value));document.getElementById('namespace').addEventListener('change',e=>rerender('namespace',e.target.value));document.getElementById('relationship').addEventListener('change',e=>rerender('relationships',e.target.value?[e.target.value]:[]));document.getElementById('isolated').addEventListener('change',e=>rerender('hideIsolated',e.target.checked));document.getElementById('labels').addEventListener('change',e=>rerender('edgeLabels',e.target.checked));
  function zoomAt(factor,cx=svg.clientWidth/2,cy=svg.clientHeight/2){const old=state.transform.scale,next=clamp(old*factor,.1,4),ratio=next/old;state.transform.x=cx-(cx-state.transform.x)*ratio;state.transform.y=cy-(cy-state.transform.y)*ratio;state.transform.scale=next;applyTransform();postState()}document.getElementById('zoomIn').onclick=()=>zoomAt(1.2);document.getElementById('zoomOut').onclick=()=>zoomAt(1/1.2);svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoomAt(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top)},{passive:false});
  let drag=null;svg.addEventListener('pointerdown',e=>{if(e.target.closest('.node')||e.target.closest('.edgeHit'))return;drag={x:e.clientX,y:e.clientY,tx:state.transform.x,ty:state.transform.y};svg.setPointerCapture(e.pointerId);svg.classList.add('panning')});svg.addEventListener('pointermove',e=>{if(!drag)return;state.transform.x=drag.tx+e.clientX-drag.x;state.transform.y=drag.ty+e.clientY-drag.y;applyTransform()});svg.addEventListener('pointerup',()=>{if(!drag)return;drag=null;svg.classList.remove('panning');postState()});
  function fit(){if(!DATA.slice.nodes.length)return;const box=DATA.scene.bounds,w=svg.clientWidth,h=svg.clientHeight,scale=clamp(Math.min((w-30)/Math.max(1,box.width),(h-30)/Math.max(1,box.height)),.1,2);state.transform={scale,x:(w-box.width*scale)/2-box.x*scale,y:(h-box.height*scale)/2-box.y*scale};applyTransform();postState()}document.getElementById('fit').onclick=fit;document.getElementById('reset').onclick=()=>{state.transform={x:36,y:36,scale:1};applyTransform();postState()};document.getElementById('focus1').onclick=()=>{if(state.selectedId){state.focusId=state.selectedId;state.hops=1;postState()}};document.getElementById('focus2').onclick=()=>{if(state.selectedId){state.focusId=state.selectedId;state.hops=2;postState()}};document.getElementById('clearFocus').onclick=()=>{state.focusId='';state.hops=0;postState()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.focusId){state.focusId='';state.hops=0;postState()}else{clearSelection();postState()}}});svg.addEventListener('click',()=>{clearSelection();postState()});
  const legend=document.getElementById('legend');DATA.kinds.forEach(k=>{const span=document.createElement('span');const dot=document.createElement('i');dot.className='dot';span.append(dot,document.createTextNode(k));legend.append(span)});if(DATA.slice.truncated){const span=document.createElement('span');span.textContent='⚠ truncated';legend.append(span)}
  if(state.selectedId){const g=document.querySelector('.node[data-id="'+CSS.escape(state.selectedId)+'"]');const n=DATA.slice.nodes.find(n=>n.id===state.selectedId);if(g&&n)selectNode(n,g,false)}if(state.selectedEdgeId){const e=DATA.slice.edges.find(e=>e.id===state.selectedEdgeId),line=e&&document.querySelector('.edge[data-id="'+CSS.escape(e.id)+'"]');if(e&&line)selectEdge(e,line,false)}
  </script></body></html>`;
}

class GraphPanel {
  constructor(context, model, maxNodes, callbacks = {}) {
    this.context = context; this.model = model; this.maxNodes = maxNodes; this.callbacks = callbacks; this.state = normalizeGraphState();
    this.panel = vscode.window.createWebviewPanel('ros2Inspector.graph', 'ROS2 Inspector Architecture', vscode.ViewColumn.One, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: []
    });
    this._messageDisposable = this.panel.webview.onDidReceiveMessage(message => this._message(message));
    this.panel.onDidDispose(() => { this._messageDisposable?.dispose(); this.callbacks.onDispose?.(); });
    this.render();
  }
  update(model) { this.model = model; if (this.state.focusId && !model.entityById.has(this.state.focusId)) { this.state.focusId = ''; this.state.hops = 0; } if (this.state.selectedId && !model.entityById.has(this.state.selectedId)) this.state.selectedId = ''; this.render(); }
  setMaxNodes(value) { this.maxNodes = value; this.render(); }
  revealEntity(entityId) { if (!this.model.entityById.has(entityId)) return; this.state.focusId = entityId; this.state.hops = 1; this.state.selectedId = entityId; this.render(); this.panel.reveal(vscode.ViewColumn.One); }
  render() { this.panel.webview.html = graphHtml(this.model, this.state, this.maxNodes); }
  _message(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'state' && message.state) { this.state = normalizeGraphState(message.state); this.render(); return; }
    if (message.type === 'openSource' && message.id) this.callbacks.onOpenSource?.(message.id);
    else if (message.type === 'openEdgeSource' && message.file) this.callbacks.onOpenLocation?.({ file: message.file, line: message.line });
    else if (message.type === 'showDetails' && message.id) this.callbacks.onShowDetails?.(message.id);
  }
}

module.exports = { GraphPanel, graphHtml, graphPayload, normalizeGraphState, escapeHtml, safeJson, DEFAULT_STATE };
