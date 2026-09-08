import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoomScene, ScenePlayer } from '../scene';
import { buildOfficeScene } from '../office';
import { SpriteMeta, TILE } from '../geometry';

/**
 * The isometric scene builder is the drawing that lands in the main menu, in
 * the room tab and on the share card — so its invariants get tests of their
 * own:
 *  - the allocator never overlaps floor furniture nor stands the player in it;
 *  - furniture promised by a housing level is actually drawn;
 *  - every sprite referenced by a scene exists in the shipped manifest.
 */

const manifest = JSON.parse(
  fs.readFileSync(new URL('../../../../public/iso/manifest.json', import.meta.url), 'utf8')
) as {
  tile: typeof TILE;
  sprites: Record<string, SpriteMeta>;
};

const SPRITES = manifest.sprites;

function player(over: Partial<ScenePlayer> = {}): ScenePlayer {
  return { housingLevel: 0, items: [], skills: {}, ...over };
}

/** floor items with their footprint, in grid cells */
function floorFootprints(scene: ReturnType<typeof buildRoomScene>) {
  const out: Array<{ sprite: string; gx: number; gy: number; tiles: [number, number] }> = [];
  for (const item of scene.items) {
    if (item.kind !== 'floor') continue;
    const meta = SPRITES[item.sprite];
    const [fw, fd] = item.tiles ?? (meta?.tiles as [number, number] | undefined) ?? [1, 1];
    out.push({ sprite: item.sprite, gx: item.gx, gy: item.gy, tiles: [fw, fd] });
  }
  return out;
}

function assertNoOverlap(scene: ReturnType<typeof buildRoomScene>, seed: string) {
  const grid: string[][] = Array.from({ length: scene.size.d }, () => Array.from({ length: scene.size.w }, () => ''));
  for (const f of floorFootprints(scene)) {
    for (let y = f.gy; y < f.gy + f.tiles[1]; y++) {
      for (let x = f.gx; x < f.gx + f.tiles[0]; x++) {
        expect(grid[y]?.[x] ?? '', `${f.sprite} cell (${x},${y}) inside room (seed ${seed})`).toBe('');
        grid[y][x] = f.sprite;
      }
    }
  }
  // the player never stands inside furniture
  const px = scene.player.gx;
  const py = scene.player.gy;
  for (const f of floorFootprints(scene)) {
    const inside = px >= f.gx && px < f.gx + f.tiles[0] && py >= f.gy && py < f.gy + f.tiles[1];
    expect(inside, `${f.sprite} covers the player (seed ${seed})`).toBe(false);
  }
}

describe('buildRoomScene', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  for (const level of [0, 1, 2, 3, 4]) {
    it(`housing level ${level} never overlaps and always fits its own furniture`, () => {
      for (const seed of seeds) {
        const scene = buildRoomScene(player({ housingLevel: level, genetics: { seed } }), SPRITES, manifest.tile);
        assertNoOverlap(scene, seed);
        expect(scene.size.w).toBeGreaterThanOrEqual(6 + level);
        // every sprite referenced is shipped
        for (const item of scene.items) expect(SPRITES[item.sprite], item.sprite).toBeDefined();
      }
    });
  }

  it('draws the kitchen that the flat advertises (level ≥ 2)', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 2, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('kitchen_counter'), seed).toBe(true);
      expect(got.has('stove'), seed).toBe(true);
      // the dishwasher sprite sat in the library unused until it was wired in
      expect(got.has('dishwasher'), seed).toBe(true);
    }
  });

  it('draws a bench from the second flat on (level ≥ 2)', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 2, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('bench'), seed).toBe(true);
    }
  });

  it('adds a side cabinet once there is a living corner (level ≥ 3)', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 3, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('side_cabinet'), seed).toBe(true);
    }
  });

  it('swaps the kitchen cabinets for the three-tile run in the top flat (level 4)', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 4, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('cabinets_long'), seed).toBe(true);
      expect(got.has('cabinets'), seed).toBe(false);
    }
  });

  it('keeps a low-tier flat poor on purpose', () => {
    const scene = buildRoomScene(player({ housingLevel: 0, genetics: { seed: 'x' } }), SPRITES, manifest.tile);
    const got = new Set(scene.items.map((i) => i.sprite));
    expect(got.has('fridge')).toBe(false);
    expect(got.has('sofa')).toBe(false);
  });

  it('gives the student flat its rolled rug in one of the tinted colourways', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 0, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('rug_rolled') || got.has('rug_moss'), seed).toBe(true);
    }
  });

  it('gives the furnished flat a chair and an armchair in a tinted colourway', () => {
    for (const seed of seeds) {
      const scene = buildRoomScene(player({ housingLevel: 2, genetics: { seed } }), SPRITES, manifest.tile);
      const got = new Set(scene.items.map((i) => i.sprite));
      expect(got.has('armchair') || got.has('armchair_clay'), seed).toBe(true);
      expect(got.has('beanbag'), seed).toBe(true);
    }
  });
});

describe('buildOfficeScene', () => {
  const kinds: Array<['garage' | 'cowork' | 'product' | 'corp', string]> = [
    ['garage', 'startup'],
    ['cowork', 'outsource'],
    ['product', 'product'],
    ['corp', 'enterprise'],
  ];

  it('never overlaps, always has desks and a place for the team', () => {
    for (const [kind, companySize] of kinds) {
      const scene = buildOfficeScene({ companySize, seed: 'office-seed', teamSize: 4 }, SPRITES, manifest.tile);
      const floors = new Set(scene.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
      expect(floors.has('office_sofa'), kind).toBe(true);
      expect(floors.has('desk_office'), kind).toBe(true);
      const desks = scene.items.filter((i) => i.kind === 'floor' && i.sprite === 'desk_office').length;
      // every office places at least a row of two desks; bigger companies more
      expect(desks, kind).toBeGreaterThanOrEqual(2);
      for (const item of scene.items) expect(SPRITES[item.sprite], item.sprite).toBeDefined();
      expect(scene.crew.length, kind).toBeGreaterThan(0);
    }
  });

  it('keeps the garage scrappy and the corporation big', () => {
    const corp = buildOfficeScene({ companySize: 'enterprise', seed: 'x', teamSize: 6 }, SPRITES, manifest.tile);
    const corpFloors = new Set(corp.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
    expect(corpFloors.has('meeting_table')).toBe(true);
    expect(corp.size.w).toBeGreaterThan(9);

    const garage = buildOfficeScene({ companySize: 'startup', seed: 'x', teamSize: 2 }, SPRITES, manifest.tile);
    const garageFloors = new Set(garage.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
    expect(garageFloors.has('boxes')).toBe(true);
    expect(garageFloors.has('pizza_boxes')).toBe(true);
    expect(garageFloors.has('meeting_table')).toBe(false);
  });
});
