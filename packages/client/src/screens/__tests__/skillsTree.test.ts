// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { layoutBranch, NODE_W } from '../skillTreeLayout';

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
