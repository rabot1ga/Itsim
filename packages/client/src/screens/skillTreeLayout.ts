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

/* ── One tree, whole forest ───────────────────────────────────────────────
 * The skills screen shows ALL branches on a single canvas (Path of Exile
 * style) instead of one accordion per branch. The content forest splits into
 * connected components — skills linked by parent edges across schools (e.g.
 * AI/ML hangs under backend Python, blockchain under frontend JavaScript).
 * Each component is drawn by layoutBranch and the components are packed into
 * balanced columns, so the whole map stays compact and fits a "show all"
 * zoom without becoming a mile of scroll.
 */

export interface ForestCluster<T> {
  /** the component as one connected tree (may span several schools) */
  skills: T[];
  layout: TreeLayout<T>;
  /** offset of this component's canvas inside the big one */
  ox: number;
  oy: number;
  width: number;
  height: number;
}

export interface ForestLayout<T> {
  clusters: ForestCluster<T>[];
  width: number;
  height: number;
}

/** connected components of the skill graph (parent edges within the list) */
export function skillComponents<T extends { id: string; parent?: string }>(skills: T[]): T[][] {
  const parentId = new Map<string, string | null>();
  for (const s of skills) {
    parentId.set(s.id, null);
  }
  for (const s of skills) {
    if (s.parent && parentId.has(s.parent)) parentId.set(s.id, s.parent);
  }
  const compOf = new Map<string, T[]>();
  const indexById = new Map(skills.map((s, i) => [s.id, i]));
  const find = (a: number): number => {
    // union-find over the parent map (parent id may not sort before child)
    let i = a;
    let p = parentId.get(skills[i].id);
    while (p && indexById.has(p)) {
      const next = indexById.get(p)!;
      if (next === i) break;
      i = next;
      p = parentId.get(skills[i].id);
    }
    return i;
  };
  for (const s of skills) {
    const rootIdx = find(indexById.get(s.id)!);
    const rootId = skills[rootIdx].id;
    const arr = compOf.get(rootId) ?? [];
    arr.push(s);
    compOf.set(rootId, arr);
  }
  return [...compOf.values()];
}

export function layoutForest<T extends { id: string; parent?: string }>(
  skills: T[],
  columns = 2,
  gapX = 44,
  gapY = 52
): ForestLayout<T> {
  const comps = skillComponents(skills).map((component) => ({
    component,
    layout: layoutBranch(component),
  }));
  // tallest first keeps the column packing balanced
  comps.sort((a, b) => b.layout.height - a.layout.height || b.component.length - a.component.length);

  const colHeights = new Array<number>(Math.min(columns, comps.length)).fill(0);
  const colWidths = new Array<number>(Math.min(columns, comps.length)).fill(0);
  const colIndex = new Map<ForestCluster<T> | { component: T[]; layout: TreeLayout<T> }, number>();
  const clusterOf: { component: T[]; layout: TreeLayout<T>; col: number; x: number; y: number }[] = [];

  for (const c of comps) {
    const col = colHeights.indexOf(Math.min(...colHeights));
    colHeights[col] += c.layout.height + gapY;
    colWidths[col] = Math.max(colWidths[col], c.layout.width);
    clusterOf.push({ component: c.component, layout: c.layout, col, x: 0, y: 0 });
    colIndex.set(c, col);
  }

  // running x per column
  const colX = new Array<number>(colHeights.length).fill(0);
  let xCursor = 0;
  for (let col = 0; col < colHeights.length; col++) {
    colX[col] = xCursor;
    xCursor += colWidths[col] + gapX;
  }
  const colCursorY = new Array<number>(colHeights.length).fill(0);
  const clusters: ForestCluster<T>[] = clusterOf.map((c) => {
    const col = c.col;
    const w = c.layout.width;
    const x = colX[col] + (colWidths[col] - w) / 2; // center the grove in its column
    const y = colCursorY[col];
    colCursorY[col] += c.layout.height + gapY;
    return { skills: c.component, layout: c.layout, ox: x, oy: y, width: w, height: c.layout.height };
  });

  const width = colHeights.length ? colX[colHeights.length - 1] + colWidths[colHeights.length - 1] : 0;
  const height = colHeights.length ? Math.max(...colHeights) - gapY : 0;
  return { clusters, width, height };
}
