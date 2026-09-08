/**
 * Geometry of the RPG skill trees drawn on the skills screen.
 *
 * skills.json is a real tree (parent + unlockAt per node); this module turns
 * one branch into absolute node coordinates and connector edges. The rules:
 * one column per leaf (a skill without children in this branch), a parent
 * centers over the columns of its descendants, rows are node depths.
 * Everything is derived from content — a new branch lays itself out.
 *
 * `NODE_W`/`NODE_H` live here so the drawer (SkillsView) and the layout stay
 * in lockstep.
 */

export const NODE_W = 92;
export const NODE_H = 70;
const COL_STEP = 96;
const ROW_STEP = 104;
const PAD = 14;

export interface PlacedNode<T> {
  skill: T;
  x: number;
  y: number;
}

export interface TreeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  childId: string;
}

export interface TreeLayout<T> {
  nodes: PlacedNode<T>[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export function layoutBranch<T extends { id: string; parent?: string }>(skills: T[]): TreeLayout<T> {
  const ids = new Set(skills.map((s) => s.id));
  const childOf = new Map<string, T[]>();
  for (const s of skills) {
    if (s.parent && ids.has(s.parent)) {
      const arr = childOf.get(s.parent) ?? [];
      arr.push(s);
      childOf.set(s.parent, arr);
    }
  }
  const roots = skills.filter((s) => !s.parent || !ids.has(s.parent));

  // depth of every node (guards against sharing a node via two paths)
  const depthOf = new Map<string, number>();
  const visit = (s: T, d: number) => {
    if ((depthOf.get(s.id) ?? Infinity) <= d) return;
    depthOf.set(s.id, d);
    for (const c of childOf.get(s.id) ?? []) visit(c, d + 1);
  };
  for (const r of roots) visit(r, 0);

  // leaf-column extents: leaves get consecutive columns in DFS order
  const ext = new Map<string, [number, number]>();
  let leafCount = 0;
  const walk = (s: T): void => {
    const kids = childOf.get(s.id) ?? [];
    if (kids.length === 0) {
      ext.set(s.id, [leafCount, leafCount]);
      leafCount += 1;
      return;
    }
    for (const k of kids) walk(k);
    ext.set(s.id, [ext.get(kids[0].id)![0], ext.get(kids[kids.length - 1].id)![1]]);
  };
  for (const r of roots) walk(r);

  const nodes: PlacedNode<T>[] = skills.map((s) => {
    const [a, b] = ext.get(s.id) ?? [0, 0];
    const centerX = PAD + NODE_W / 2 + ((a + b) / 2) * COL_STEP;
    return { skill: s, x: centerX, y: PAD + (depthOf.get(s.id) ?? 0) * ROW_STEP };
  });
  const nodeOf = new Map(nodes.map((n) => [n.skill.id, n]));

  const edges: TreeEdge[] = [];
  for (const s of skills) {
    const parent = nodeOf.get(s.id);
    if (!parent) continue;
    for (const c of childOf.get(s.id) ?? []) {
      const child = nodeOf.get(c.id);
      if (!child) continue;
      edges.push({ x1: parent.x, y1: parent.y + NODE_H, x2: child.x, y2: child.y, childId: c.id });
    }
  }

  const width = PAD * 2 + NODE_W + Math.max(0, leafCount - 1) * COL_STEP;
  const height = (Math.max(0, ...nodes.map((n) => n.y + NODE_H)) || NODE_H) + PAD;
  return { nodes, edges, width, height };
}
