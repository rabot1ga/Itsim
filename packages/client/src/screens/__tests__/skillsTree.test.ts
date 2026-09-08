import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutGalaxy, NODE_W, NODE_H } from '../skillTreeLayout';

/**
 * The skills screen is ONE organic map (a constellation, not a grid): every
 * school root is the center of its radial tree and the groves are scattered
 * with a golden-angle spiral. These invariants keep the geometry honest:
 *  - every real skill lands exactly once, inside the canvas;
 *  - nodes of the same grove never overlap (ring spacing + angular slices);
 *  - grove bounding circles never overlap;
 *  - a parent always sits closer to its root than its children;
 *  - every edge is a finite cubic Bézier between a real parent and child.
 */

const REAL_SKILLS = JSON.parse(
  fs.readFileSync(new URL('../../../../content/skills.json', import.meta.url), 'utf8')
) as Array<{ id: string; name: string; branch: string; parent?: string }>;

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

describe('layoutGalaxy (real content)', () => {
  it('places every skill exactly once, inside the canvas', () => {
    const g = layoutGalaxy(REAL_SKILLS);
    expect(g.nodes).toHaveLength(REAL_SKILLS.length);
    expect(new Set(g.nodes.map((n) => n.skill.id)).size).toBe(REAL_SKILLS.length);
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(NODE_W / 2 - 0.001);
      expect(n.y).toBeGreaterThanOrEqual(NODE_H / 2 - 0.001);
      expect(n.x + NODE_W / 2).toBeLessThanOrEqual(g.width + 0.001);
      expect(n.y + NODE_H / 2).toBeLessThanOrEqual(g.height + 0.001);
    }
  });

  it('keeps nodes of one grove apart and groves apart from each other', () => {
    const g = layoutGalaxy(REAL_SKILLS);
    // same-grove nodes never come closer than the ring step (~175) minus slack
    const byRoot = new Map<string, { x: number; y: number }[]>();
    for (const n of g.nodes) {
      const arr = byRoot.get(n.rootId) ?? [];
      arr.push({ x: n.x, y: n.y });
      byRoot.set(n.rootId, arr);
    }
    for (const arr of byRoot.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          expect(dist(arr[i].x, arr[i].y, arr[j].x, arr[j].y)).toBeGreaterThanOrEqual(120);
        }
      }
    }
    // grove bounding circles never overlap (greedy placement guarantees it)
    for (let i = 0; i < g.roots.length; i++) {
      for (let j = i + 1; j < g.roots.length; j++) {
        const a = g.roots[i];
        const b = g.roots[j];
        expect(dist(a.x, a.y, b.x, b.y)).toBeGreaterThanOrEqual(a.radius + b.radius - 1);
      }
    }
  });

  it('grows children away from their root and curves every edge finitely', () => {
    const g = layoutGalaxy(REAL_SKILLS);
    const rootOf = new Map(g.roots.map((r) => [r.id, r]));
    const nodeOf = new Map(g.nodes.map((n) => [n.skill.id, n]));
    const byId = new Map(REAL_SKILLS.map((s) => [s.id, s]));
    const parented = REAL_SKILLS.filter((s) => s.parent && byId.has(s.parent!));
    expect(g.edges).toHaveLength(parented.length);

    for (const e of g.edges) {
      const child = byId.get(e.childId)!;
      const childNode = nodeOf.get(e.childId)!;
      const parentNode = nodeOf.get(child.parent!)!;
      const root = rootOf.get(childNode.rootId)!;
      const dChild = dist(root.x, root.y, childNode.x, childNode.y);
      const dParent = dist(root.x, root.y, parentNode.x, parentNode.y);
      expect(dParent).toBeLessThan(dChild - 1); // rings grow outward
      for (const v of [e.sx, e.sy, e.c1x, e.c1y, e.c2x, e.c2y, e.ex, e.ey]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      // endpoints sit inside the canvas
      expect(e.ex).toBeGreaterThan(0);
      expect(e.ey).toBeGreaterThan(0);
      expect(e.ex).toBeLessThan(g.width);
      expect(e.ey).toBeLessThan(g.height);
    }
  });
});
