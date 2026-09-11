'use strict';

const DEFAULTS = Object.freeze({ nodeWidth: 190, nodeHeight: 54, columnGap: 270, rowGap: 86, padding: 70 });
const KIND_FALLBACK_RANK = Object.freeze({ Package: 0, Node: 1, Deployment: 2, Topic: 3, Service: 3, Action: 3, Interface: 4 });

function byIdentity(a, b) {
  return String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || ''));
}

function dependencyRanks(nodes, edges) {
  const ids = new Set(nodes.map(n => n.id));
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  const indegree = new Map(nodes.map(n => [n.id, 0]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter(n => indegree.get(n.id) === 0).sort(byIdentity).map(n => n.id);
  const ranks = new Map(nodes.map(n => [n.id, 0]));
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    visited.add(id);
    for (const target of [...outgoing.get(id)].sort()) {
      ranks.set(target, Math.max(ranks.get(target), ranks.get(id) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
    queue.sort();
  }
  // Cycles are kept deterministic in the first column instead of causing an
  // unbounded relaxation loop.
  for (const node of nodes) if (!visited.has(node.id)) ranks.set(node.id, 0);
  return ranks;
}

function architectureRanks(nodes, edges, mode) {
  if (mode === 'deps') return dependencyRanks(nodes, edges);
  const votes = new Map(nodes.map(n => [n.id, []]));
  const vote = (id, rank) => { if (votes.has(id)) votes.get(id).push(rank); };
  for (const edge of edges) {
    switch (edge.rel) {
      case 'deploys_as': vote(edge.source, 0); vote(edge.target, 1); break;
      case 'publishes':
      case 'provides': vote(edge.source, 1); vote(edge.target, 2); break;
      case 'subscribes':
      case 'calls': vote(edge.source, 3); vote(edge.target, 2); break;
      case 'defined_in': vote(edge.source, 1); vote(edge.target, 0); break;
      case 'uses_interface': vote(edge.source, 2); vote(edge.target, 4); break;
      case 'depends_on': vote(edge.source, 0); vote(edge.target, 0); break;
      default: break;
    }
  }
  const ranks = new Map();
  for (const node of nodes) {
    const nodeVotes = votes.get(node.id);
    const fallback = KIND_FALLBACK_RANK[node.kind] ?? 2;
    const mean = nodeVotes.length ? nodeVotes.reduce((a, b) => a + b, 0) / nodeVotes.length : fallback;
    ranks.set(node.id, Math.max(0, Math.round(mean)));
  }
  return ranks;
}

function minimizeCrossings(columns, edges) {
  const rankOf = new Map();
  const orderOf = new Map();
  for (const [rank, nodes] of columns) {
    nodes.forEach((node, i) => { rankOf.set(node.id, rank); orderOf.set(node.id, i); });
  }
  const adjacency = new Map([...rankOf.keys()].map(id => [id, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    }
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const ranks = [...columns.keys()].sort((a, b) => a - b);
    if (pass % 2) ranks.reverse();
    for (const rank of ranks) {
      const nodes = columns.get(rank);
      nodes.sort((a, b) => {
        const bary = id => {
          const neighbors = adjacency.get(id).filter(n => rankOf.get(n) !== rank);
          if (!neighbors.length) return Number.POSITIVE_INFINITY;
          return neighbors.reduce((sum, n) => sum + (orderOf.get(n) || 0), 0) / neighbors.length;
        };
        const aa = bary(a.id), bb = bary(b.id);
        if (aa !== bb) return aa - bb;
        return byIdentity(a, b);
      });
      nodes.forEach((node, i) => orderOf.set(node.id, i));
    }
  }
}

function layoutGraph(nodes, edges, mode = 'comms', options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const sortedNodes = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const ranks = architectureRanks(sortedNodes, edges, mode);
  const columns = new Map();
  for (const node of sortedNodes) {
    const rank = ranks.get(node.id) || 0;
    if (!columns.has(rank)) columns.set(rank, []);
    columns.get(rank).push(node);
  }
  for (const list of columns.values()) list.sort(byIdentity);
  minimizeCrossings(columns, edges);

  const positions = new Map();
  for (const rank of [...columns.keys()].sort((a, b) => a - b)) {
    columns.get(rank).forEach((node, row) => positions.set(node.id, {
      x: cfg.padding + rank * cfg.columnGap,
      y: cfg.padding + row * cfg.rowGap,
      width: cfg.nodeWidth,
      height: cfg.nodeHeight,
      rank,
      row
    }));
  }
  return { positions, config: cfg, ranks };
}

function anchorPair(source, target) {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  const dx = tx - sx;
  if (Math.abs(dx) >= 8) {
    return dx >= 0
      ? { x1: source.x + source.width, y1: sy, x2: target.x, y2: ty }
      : { x1: source.x, y1: sy, x2: target.x + target.width, y2: ty };
  }
  return sy <= ty
    ? { x1: sx, y1: source.y + source.height, x2: tx, y2: target.y }
    : { x1: sx, y1: source.y, x2: tx, y2: target.y + target.height };
}

function expandBounds(bounds, ...points) {
  for (const point of points) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }
  return bounds;
}

function routeEdges(edges, positions) {
  const pairGroups = new Map();
  const directedGroups = new Map();
  for (const edge of edges) {
    const unordered = [edge.source, edge.target].sort().join('\u0000');
    const directed = `${edge.source}\u0000${edge.target}`;
    if (!pairGroups.has(unordered)) pairGroups.set(unordered, []);
    if (!directedGroups.has(directed)) directedGroups.set(directed, []);
    pairGroups.get(unordered).push(edge);
    directedGroups.get(directed).push(edge);
  }
  for (const list of pairGroups.values()) list.sort((a, b) => String(a.rel).localeCompare(String(b.rel)) || String(a.key || '').localeCompare(String(b.key || '')));
  for (const list of directedGroups.values()) list.sort((a, b) => String(a.rel).localeCompare(String(b.rel)) || String(a.key || '').localeCompare(String(b.key || '')));

  return edges.map(edge => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return null;
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    if (edge.source === edge.target) {
      const directed = directedGroups.get(`${edge.source}\u0000${edge.target}`);
      const lane = directed.indexOf(edge);
      const loop = 42 + lane * 18;
      const x1 = source.x + source.width * 0.72;
      const y1 = source.y;
      const x2 = source.x + source.width;
      const y2 = source.y + source.height * 0.32;
      const c1 = { x: x1 + loop, y: y1 - loop };
      const c2 = { x: x2 + loop, y: y2 - loop };
      expandBounds(bounds, { x: x1, y: y1 }, c1, c2, { x: x2, y: y2 });
      return { ...edge, d: `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`, labelX: source.x + source.width + loop, labelY: source.y - loop + 8, bounds };
    }

    const pair = pairGroups.get([edge.source, edge.target].sort().join('\u0000'));
    const directed = directedGroups.get(`${edge.source}\u0000${edge.target}`);
    const reverse = directedGroups.get(`${edge.target}\u0000${edge.source}`) || [];
    const index = directed.indexOf(edge);
    const centered = index - (directed.length - 1) / 2;
    const reverseBias = reverse.length ? (String(edge.source).localeCompare(String(edge.target)) < 0 ? -1 : 1) * 18 : 0;
    const laneOffset = centered * 16 + reverseBias;
    const a = anchorPair(source, target);

    if (source.rank === target.rank) {
      const side = source.row <= target.row ? 1 : -1;
      const outsideX = Math.max(source.x + source.width, target.x + target.width) + 58 + Math.abs(laneOffset);
      const c1 = { x: outsideX, y: a.y1 + side * laneOffset };
      const c2 = { x: outsideX, y: a.y2 + side * laneOffset };
      expandBounds(bounds, { x: a.x1, y: a.y1 }, c1, c2, { x: a.x2, y: a.y2 });
      return { ...edge, d: `M ${a.x1} ${a.y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${a.x2} ${a.y2}`, labelX: outsideX + 4, labelY: (a.y1 + a.y2) / 2, bounds };
    }

    const dx = a.x2 - a.x1;
    const midX = a.x1 + dx / 2;
    const c1 = { x: midX, y: a.y1 + laneOffset };
    const c2 = { x: midX, y: a.y2 + laneOffset };
    expandBounds(bounds, { x: a.x1, y: a.y1 }, c1, c2, { x: a.x2, y: a.y2 });
    return { ...edge, d: `M ${a.x1} ${a.y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${a.x2} ${a.y2}`, labelX: midX, labelY: (a.y1 + a.y2) / 2 + laneOffset - 6, bounds, pairCount: pair.length };
  }).filter(Boolean);
}

function sceneBounds(nodes, positions, routes, padding = 45) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p) continue;
    expandBounds(bounds, { x: p.x, y: p.y }, { x: p.x + p.width, y: p.y + p.height });
  }
  for (const route of routes) {
    expandBounds(bounds,
      { x: route.bounds.minX, y: route.bounds.minY },
      { x: route.bounds.maxX, y: route.bounds.maxY },
      { x: route.labelX - 35, y: route.labelY - 12 }, { x: route.labelX + 35, y: route.labelY + 12 });
  }
  if (!Number.isFinite(bounds.minX)) return { x: 0, y: 0, width: 640, height: 360 };
  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width: Math.max(1, bounds.maxX - bounds.minX + padding * 2),
    height: Math.max(1, bounds.maxY - bounds.minY + padding * 2)
  };
}

function buildScene(nodes, edges, mode = 'comms', options = {}) {
  const layout = layoutGraph(nodes, edges, mode, options);
  const routes = routeEdges(edges, layout.positions);
  return { ...layout, routes, bounds: sceneBounds(nodes, layout.positions, routes) };
}

module.exports = { DEFAULTS, architectureRanks, layoutGraph, routeEdges, sceneBounds, buildScene };
