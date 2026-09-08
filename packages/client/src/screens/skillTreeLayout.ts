/**
 * Geometry of the skill map — a constellation, not a grid.
 *
 * Every school root (JavaScript, Python, QA, …) is the center of its own
 * radial tree: children grow outward on rings, a parent always sits closer
 * to the center than its children, and each child fans inside the angular
 * slice reserved for its whole subtree — so nodes never overlap. The roots
 * themselves are scattered over the canvas with a golden-angle spiral, each
 * sized by how far its tree reaches, which packs differently-sized groves
 * into one organic map with no aligned columns or rows.
 *
 * Edges are curved (cubic Béziers with a deterministic sideways bow) instead
 * of orthogonal elbows, so the map reads as winding skill paths — the thing
 * that makes an RPG tree feel like a map and not a spreadsheet.
 */

export const NODE_W = 92;
export const NODE_H = 70;

/** first ring radius (clearance around the root node) */
const RING0 = 190;
/** distance between depth rings */
const RING_STEP = 175;
/** breathing room between grove bounding circles */
const GROVE_GAP = 80;
/** padding around the whole canvas */
const PAD = 40;
/** golden angle — packs circles like sunflower seeds */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface GalaxyNode<T> {
  skill: T;
  /** center of the node on the map */
  x: number;
  y: number;
  /** id of the root this tree grows from */
  rootId: string;
}

export interface GalaxyEdge {
  childId: string;
  sx: number;
  sy: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  ex: number;
  ey: number;
}

export interface GalaxyGrove {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface Galaxy<T> {
  nodes: GalaxyNode<T>[];
  edges: GalaxyEdge[];
  roots: GalaxyGrove[];
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function layoutGalaxy<T extends { id: string; parent?: string }>(skills: T[]): Galaxy<T> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const ids = new Set(skills.map((s) => s.id));
  const childMap = new Map<string, T[]>();
  for (const s of skills) {
    if (s.parent && ids.has(s.parent)) {
      const arr = childMap.get(s.parent) ?? [];
      arr.push(s);
      childMap.set(s.parent, arr);
    }
  }

  // root id of a skill (walk up its parents to the top of its grove)
  const findRoot = (id: string): string => {
    let cur: string = id;
    while (byId.has(cur)) {
      const skill = byId.get(cur) as T | undefined;
      if (!skill || !skill.parent || !ids.has(skill.parent)) return cur;
      cur = skill.parent;
    }
    return id;
  };

  // every component is rooted at a skill that has no parent inside the list
  const roots = skills.filter((s) => !s.parent || !ids.has(s.parent));

  // ---------- per-grove radial layout ----------
  const angById = new Map<string, number>();
  const depthById = new Map<string, number>();
  const groveRadius = new Map<string, number>();
  const leafOf = new Map<string, number>();

  const countLeaves = (id: string): number => {
    const mem = leafOf.get(id);
    if (mem !== undefined) return mem;
    const kids = childMap.get(id) ?? [];
    const n = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + countLeaves(k.id), 0);
    leafOf.set(id, n);
    return n;
  };

  /** give every node an angle inside [winStart, winStart+winSize], proportional slices */
  const assign = (id: string, winStart: number, winSize: number, depth: number) => {
    angById.set(id, winStart + winSize / 2);
    depthById.set(id, depth);
    const kids = childMap.get(id) ?? [];
    if (kids.length === 0) return;
    const leaves = kids.map((k) => countLeaves(k.id));
    const total = leaves.reduce((a, b) => a + b, 0);
    let cursor = winStart;
    kids.forEach((k, i) => {
      const slice = winSize * (leaves[i] / total);
      assign(k.id, cursor, slice, depth + 1);
      cursor += slice;
    });
  };

  // ---------- global scatter: biggest groves near the middle ----------
  const order = [...roots].sort((a, b) => {
    const ra = groveRadius.get(a.id) ?? 0;
    const rb = groveRadius.get(b.id) ?? 0;
    return rb - ra || (a.id < b.id ? -1 : 1);
  });

  const groves: GalaxyGrove[] = [];
  for (const root of order) {
    const rootId = root.id;
    // build the grove's subtree & place it radially around the origin
    assign(rootId, 0, Math.PI * 2, 0);
    let maxExtent = 0;
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      const depth = depthById.get(id) ?? 0;
      const r = depth === 0 ? 0 : RING0 + (depth - 1) * RING_STEP;
      maxExtent = Math.max(maxExtent, r);
      const kids = childMap.get(id) ?? [];
      for (const k of kids) stack.push(k.id);
    }
    // node sticks out of its ring by half its diagonal
    const radius = maxExtent + Math.hypot(NODE_W, NODE_H) / 2;
    groveRadius.set(rootId, radius);

    // find a spot that clears every already-placed grove
    let placed = false;
    for (let attempt = 0; attempt < 4000 && !placed; attempt++) {
      const a = attempt * GOLDEN;
      const dist = 40 + 26 * Math.sqrt(attempt);
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      let ok = true;
      for (const p of groves) {
        if (Math.hypot(x - p.x, y - p.y) < radius + p.radius + GROVE_GAP) {
          ok = false;
          break;
        }
      }
      if (ok) {
        groves.push({ id: rootId, x, y, radius });
        placed = true;
      }
    }
  }

  // ---------- absolute coordinates + bounds ----------
  const groveOf = new Map(groves.map((g) => [g.id, g]));
  const centerById = new Map<string, { x: number; y: number }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of skills) {
    const ang = angById.get(s.id) ?? 0;
    const depth = depthById.get(s.id) ?? 0;
    const r = depth === 0 ? 0 : RING0 + (depth - 1) * RING_STEP;
    const g = groveOf.get(s.parent && ids.has(s.parent) ? findRoot(s.id) : s.id)!;
    const x = g.x + Math.cos(ang) * r;
    const y = g.y + Math.sin(ang) * r;
    centerById.set(s.id, { x, y });
    minX = Math.min(minX, x - NODE_W / 2);
    minY = Math.min(minY, y - NODE_H / 2);
    maxX = Math.max(maxX, x + NODE_W / 2);
    maxY = Math.max(maxY, y + NODE_H / 2);
  }

  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;
  const dx = PAD - minX;
  const dy = PAD - minY;

  const nodes: GalaxyNode<T>[] = skills.map((s) => {
    const c = centerById.get(s.id)!;
    return {
      skill: s,
      x: c.x + dx,
      y: c.y + dy,
      rootId: s.parent && ids.has(s.parent) ? findRoot(s.id) : s.id,
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.skill.id, n]));

  // ---------- curved edges (cubic Bézier with a sideways bow) ----------
  const edges: GalaxyEdge[] = [];
  let edgeIndex = 0;
  for (const s of skills) {
    if (!s.parent || !ids.has(s.parent)) continue;
    const parent = nodeById.get(s.parent);
    const child = nodeById.get(s.id);
    if (!parent || !child) continue;
    const sx = parent.x;
    const sy = parent.y;
    const ex = child.x;
    const ey = child.y;
    const len = Math.hypot(ex - sx, ey - sy) || 1;
    const ux = (ex - sx) / len;
    const uy = (ey - sy) / len;
    // deterministic sideways bow so paths wind, always the same way per edge
    const sign = edgeIndex % 2 === 0 ? 1 : -1;
    const bend = clamp(len * 0.09, 8, 52) * sign;
    const px = -uy;
    const py = ux;
    edges.push({
      childId: s.id,
      sx,
      sy,
      c1x: sx + ux * len * 0.3 + px * bend,
      c1y: sy + uy * len * 0.3 + py * bend,
      c2x: sx + ux * len * 0.7 - px * bend,
      c2y: sy + uy * len * 0.7 - py * bend,
      ex,
      ey,
    });
    edgeIndex += 1;
  }

  return {
    nodes,
    edges,
    roots: groves.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy })),
    width,
    height,
  };
}
