import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutBranch, layoutForest, skillComponents, NODE_W, NODE_H } from '../skillTreeLayout';

/**
 * The skill screen draws an actual tree (RPG style) from content: nodes hang
 * from their parents on connectors. These invariants keep the geometry honest
 * so the drawn tree never becomes a heap of overlapping chips:
 *  - parents sit centered above their children, never on the same row;
 *  - every edge connects a real parent to a real child with finite coords;
 *  - the canvas fits all nodes (nothing is laid out off the sheet).
 */

interface FakeSkill {
  id: string;
  name: string;
  parent?: string;
}

function branchTree(...chain: FakeSkill[]) {
  return chain.map((s) => ({
    id: s.id,
    name: s.name,
    branch: 'b',
    icon: 'x',
    maxLevel: 100,
    flavor: '',
    ...(s.parent ? { parent: s.parent } : {}),
  })) as any;
}

const A = { id: 'a', name: 'A' };
const B1 = { id: 'b1', name: 'B1', parent: 'a' };
const B2 = { id: 'b2', name: 'B2', parent: 'a' };
const C = { id: 'c', name: 'C', parent: 'b1' };

describe('layoutBranch', () => {
  it('fits a linear chain on one column, parents above children', () => {
    const layout = layoutBranch(branchTree(A, B1, C));
    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
    const [a, b, c] = layout.nodes;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    // same column: a center over its only descendant column
    expect(a.x).toBeCloseTo(b.x);
    expect(b.x).toBeCloseTo(c.x);
  });

  it('centers a parent over the fan of its children and keeps all coords finite', () => {
    const layout = layoutBranch(branchTree(A, B1, B2, C));
    expect(layout.edges).toHaveLength(3);
    const a = layout.nodes.find((n) => n.skill.id === 'a')!;
    const b1 = layout.nodes.find((n) => n.skill.id === 'b1')!;
    const b2 = layout.nodes.find((n) => n.skill.id === 'b2')!;
    expect(a.x).toBeGreaterThan(b1.x);
    expect(a.x).toBeLessThan(b2.x);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
    // canvas covers every node's right edge
    for (const n of layout.nodes) {
      expect(n.x + NODE_W / 2).toBeLessThanOrEqual(layout.width + 0.001);
      expect(n.x - NODE_W / 2).toBeGreaterThanOrEqual(-0.001);
    }
    // every edge references a drawn child
    for (const e of layout.edges) {
      expect(layout.nodes.some((n) => n.skill.id === e.childId)).toBe(true);
      expect(Number.isFinite(e.x1) && Number.isFinite(e.y1) && Number.isFinite(e.x2) && Number.isFinite(e.y2)).toBe(
        true
      );
    }
  });
});

/**
 * The whole-skills-screen view is ONE tree, Path of Exile style: no branch
 * subsections. layoutForest splits the content graph into connected groves
 * (schools that require each other stay linked) and packs them into balanced
 * columns on a single canvas. Invariants:
 *  - every skill appears exactly once on the map;
 *  - components never overlap (each column is a vertical strip, components
 *    are stacked inside it);
 *  - the canvas is finite and covers every node.
 */

const REAL_SKILLS = JSON.parse(
  fs.readFileSync(new URL('../../../../content/skills.json', import.meta.url), 'utf8')
) as Array<{ id: string; name: string; branch: string; parent?: string }>;

describe('layoutForest', () => {
  it('partitions all real skills into components linked by parents', () => {
    const comps = skillComponents(REAL_SKILLS);
    expect(comps.flat().length).toBe(REAL_SKILLS.length);
    expect(comps.length).toBeGreaterThan(1);
    // every cross-school dependency keeps its two ends in one component
    const ml = comps.find((c) => c.some((s) => s.id === 'machine_learning'))!;
    expect(ml.some((s) => s.id === 'python')).toBe(true);
  });

  it('lays every real skill out exactly once with no overlapping groves', () => {
    const forest = layoutForest(REAL_SKILLS, 2);
    const placed = forest.clusters.flatMap((c) => c.layout.nodes.map((n) => n.skill.id));
    expect(new Set(placed).size).toBe(REAL_SKILLS.length);
    for (const a of forest.clusters) {
      for (const b of forest.clusters) {
        if (a === b) continue;
        const noOverlap =
          a.ox + a.width <= b.ox + 0.001 ||
          b.ox + b.width <= a.ox + 0.001 ||
          a.oy + a.height <= b.oy + 0.001 ||
          b.oy + b.height <= a.oy + 0.001;
        expect(noOverlap).toBe(true);
      }
    }
    for (const c of forest.clusters) {
      for (const n of c.layout.nodes) {
        expect(n.x + c.ox + NODE_W / 2).toBeLessThanOrEqual(forest.width + 0.001);
        expect(n.y + c.oy + NODE_H / 2).toBeLessThanOrEqual(forest.height + 0.001);
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      }
    }
  });
  it('centers a parent over its children inside one grove', () => {
    const forest = layoutForest(REAL_SKILLS, 2);
    const js = forest.clusters.find((c) => c.skills.some((s) => s.id === 'javascript'))!;
    const jsNode = js.layout.nodes.find((n) => n.skill.id === 'javascript')!;
    const reactNode = js.layout.nodes.find((n) => n.skill.id === 'react')!;
    const defiNode = js.layout.nodes.find((n) => n.skill.id === 'defi')!;
    // JavaScript is the root that react..defi hang from — higher on the map
    expect(js.oy + jsNode.y).toBeLessThan(js.oy + reactNode.y);
    // and its column sits inside the fan spanned by its leaf descendants
    expect(jsNode.x).toBeGreaterThan(reactNode.x);
    expect(jsNode.x).toBeLessThan(defiNode.x);
  });
});
