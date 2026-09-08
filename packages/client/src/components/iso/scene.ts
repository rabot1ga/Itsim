import { PlacedItem, RoomSize, SpriteMeta, TILE, TileSize, WallSide } from './geometry';
import { Allocator, allocator, occupy, place, standingSpot } from './allocator';
import { FLOOR_STYLES, FloorStyle, WALL_PAINTS, WallPaint, floorsFor, paintsFor } from './styles';
import { rolls } from './palette';

/**
 * Builds the isometric room scene from player state.
 *
 * The room is not a picture — it is a readout. Every sprite in it is something
 * the player actually bought, unlocked or moved into: a bigger flat, a second
 * monitor, a cat, a mining rig. Nothing is placed for decoration alone.
 *
 * Placement is an allocator, not a fixed picture: each piece asks for a few
 * preferred cells and takes the first free one, so a half-furnished room never
 * ends up with furniture inside furniture — or, worse, a plant growing through
 * the player (see allocator.ts: tall sprites reserve the tiles they eclipse).
 */

export interface RoomScene {
  size: RoomSize;
  /** wall + floor colours, keyed off the housing level */
  palette: RoomPalette;
  items: PlacedItem[];
  /** where the player stands */
  player: { gx: number; gy: number };
}

export interface RoomPalette {
  wallLeft: string;
  wallRight: string;
  wallTrim: string;
  floorA: string;
  floorB: string;
  floorLine: string;
  skirting: string;
  floorPattern: FloorStyle['pattern'];
  /** ids of the chosen finishes, so the editor can show what is applied */
  paintId: string;
  floorId: string;
}

function paletteFrom(paint: WallPaint, floor: FloorStyle): RoomPalette {
  return {
    wallLeft: paint.left,
    wallRight: paint.right,
    wallTrim: paint.trim,
    skirting: paint.skirting,
    floorA: floor.a,
    floorB: floor.b,
    floorLine: floor.line,
    floorPattern: floor.pattern,
    paintId: paint.id,
    floorId: floor.id,
  };
}

const SIZES: RoomSize[] = [
  { w: 6, d: 6 },
  { w: 7, d: 7 },
  { w: 8, d: 7 },
  { w: 9, d: 8 },
  { w: 10, d: 9 },
];

export interface ScenePlayer {
  housingLevel?: number;
  items?: string[];
  skills?: Record<string, { level?: number }>;
  achievements?: string[];
  petFedToday?: boolean;
  genetics?: { seed?: string };
  telegramId?: number | string;
  /** what the player changed by hand in the room editor */
  room?: { paint?: string; floor?: string; wallColor?: string; slots?: Record<string, string | null> };
  job?: unknown;
}

/** Everything the room is generated from, in one string. */
export function roomSeed(player: ScenePlayer): string {
  return player.genetics?.seed ?? String(player.telegramId ?? 'player');
}

function wall(a: Allocator, sprite: string, side: WallSide, along: number, top: number): void {
  a.items.push({ kind: 'wall', sprite, side, along, top });
}

export function buildRoomScene(
  player: ScenePlayer,
  sprites: Record<string, SpriteMeta> = {},
  tile: TileSize = TILE
): RoomScene {
  const level = Math.max(0, Math.min(4, player.housingLevel ?? 0));
  const size = SIZES[level];
  const items = new Set(player.items ?? []);
  const has = (id: string) => items.has(id);
  const hasAny = (...ids: string[]) => ids.some(has);
  const totalLevels = Object.values(player.skills ?? {}).reduce((s, v) => s + (v?.level ?? 0), 0);

  const a = allocator(size, sprites, tile);
  const { w, d } = size;

  // Finishes: the player's own choice wins, otherwise the seed picks from the
  // palettes this housing level can afford.
  const seed = roomSeed(player);
  const pick = rolls(`${seed}:room`);
  const paintPool = paintsFor(level);
  const floorPool = floorsFor(level);
  const paint = WALL_PAINTS.find((p) => p.id === player.room?.paint) ?? paintPool[pick(paintPool.length)];
  const floor = FLOOR_STYLES.find((f) => f.id === player.room?.floor) ?? floorPool[pick(floorPool.length)];

  /**
   * Layout style. Two flats with the same furniture should still not be the
   * same picture, so the seed decides whether the bed lives on the left wall
   * with the desk on the right, or the other way round.
   */
  const swapped = pick(2) === 1;
  /** anchor helper: `bedSide` cells hug the wall the bed is on */
  const mirror = ([gx, gy]: [number, number]): [number, number] =>
    swapped ? [Math.max(0, Math.min(size.w - 1, gy)), Math.max(0, Math.min(size.d - 1, gx))] : [gx, gy];
  const at = (...cells: Array<[number, number]>): Array<[number, number]> => cells.map(mirror);

  // ── the workplace: desk against the back-right wall ─────────────────────
  const bigDesk = hasAny('gaming_pc', 'macbook');
  if (bigDesk) {
    place(a, 'desk_dual', swapped ? [2, 3] : [3, 2], at([1, 0], [2, 0], [0, 0]));
  } else {
    place(a, 'desk_wood', swapped ? [1, 2] : [2, 1], at([1, 0], [2, 0], [0, 0]));
  }
  if (hasAny('gaming_pc', 'mining_gpu')) place(a, 'pc_tower', [1, 1], at([w - 2, 0], [4, 0], [w - 1, 1]));
  if (has('macbook')) place(a, 'laptop_table', [1, 1], at([4, 1], [w - 2, 2]));

  const chair = hasAny('gaming_chair', 'herman_miller')
    ? 'chair_gaming'
    : has('office_chair')
      ? 'chair_office'
      : null;
  if (chair) place(a, chair, [1, 1], at([2, 2], [1, 2], [3, 2]));

  // ── living: bed along the back-left wall, then comfort by housing level ──
  place(a, 'bed', swapped ? [3, 2] : [2, 3], at([0, 2], [0, 1], [0, 3]));
  if (level >= 1) place(a, 'nightstand', [1, 1], at([0, 1], [0, 0], [1, 1]));
  if (level >= 1) place(a, 'fridge', [1, 1], at([w - 2, 0], [w - 2, 1], [w - 3, 0]));
  if (level >= 2) place(a, 'tv_stand', [2, 1], [[1, d - 1], [2, d - 1]]);
  if (level >= 2) place(a, 'coffee_table', [1, 1], [[w - 3, d - 2], [3, d - 2]]);
  if (level >= 3) place(a, 'sofa', [2, 1], [[w - 3, d - 1], [w - 2, d - 1]]);
  if (level >= 3) place(a, 'side_cabinet', [1, 1], [[w - 1, d - 1], [w - 1, d - 2], [w - 1, d - 3], [0, d - 1], [0, d - 2], [1, d - 1], [w - 2, d - 4]]);
  if (level >= 2) place(a, ['armchair', 'armchair_clay', 'armchair_teal'][pick(3)], [1, 1], [[w - 2, d - 2], [w - 2, d - 3], [w - 3, d - 2]]);
  if (level >= 3) place(a, 'palm', [1, 1], [[1, d - 2], [1, d - 1], [w - 2, d - 2]]);
  if (level >= 4) place(a, 'arcade', [1, 1], at([w - 2, 3], [w - 2, 4], [w - 3, 3]));
  if (level >= 1) place(a, 'floor_lamp', [1, 1], [[w - 2, d - 2], [1, d - 2], [w - 2, d - 3]]);
  if (level <= 1) place(a, 'boxes', [1, 1], [[3, d - 1], [2, d - 2]]);
  // the rug comes in three colourways (rug_rolled/rug_moss/rug_sand, tinted by
  // isogen) — one drawing, a seed-picked finish, like wall paint and flooring
  if (level === 0) place(a, ['rug_rolled', 'rug_moss', 'rug_sand'][pick(3)], [2, 1], [[2, d - 2], [1, d - 2]]);
  if (level >= 2) place(a, 'beanbag', [1, 1], [[w - 2, 2], [w - 2, 3]]);
  // a bench by the door — the flat has enough rooms for real visitors by now
  if (level >= 2) place(a, 'bench', [1, 1], [[3, d - 1], [4, d - 1], [2, d - 1], [w - 1, d - 1], [0, d - 1], [3, d - 2], [4, d - 2], [w - 2, d - 1]]);

  // ── what the player earned ──────────────────────────────────────────────
  if (totalLevels >= 20) place(a, 'bookshelf', [1, 1], at([w - 2, 0], [w - 3, 0], [w - 2, 1]));
  if (totalLevels >= 40) place(a, 'whiteboard', [2, 1], [[w - 2, 1], [w - 3, 0]]);
  if (has('desk_plant')) place(a, 'plant_monstera', [1, 1], [[w - 2, d - 2], [1, d - 2], [w - 2, d - 3]]);
  if (hasAny('mining_rig', 'mining_asic')) place(a, 'server_rack', [1, 1], at([w - 2, 3], [w - 2, 2], [w - 3, 3]));
  // ── the pet itself, next to its bed ─────────────────────────────────────
  const PET_SPRITES: Record<string, string> = {
    pet_cat: 'pet_cat',
    pet_dog: 'pet_dog',
    pet_bulldog: 'pet_bulldog',
    pet_cactus: 'pet_cactus',
    pet_robo: 'pet_robo',
    pet_spider: 'pet_spider',
    pet_parrot: 'pet_parrot',
    pet_fish: 'pet_fish',
    pet_hamster: 'pet_hamster',
  };
  const petId = [...items].find((id) => PET_SPRITES[id]);
  if (petId) {
    // The animal shows how it is doing: unfed it waits by an empty bowl, fed it
    // eats, naps or plays. Only cats and dogs have those extra poses drawn.
    const base = PET_SPRITES[petId];
    const posed = (suffix: string) => `${base}_${suffix}`;
    const hasPoses = base === 'pet_cat' || base === 'pet_dog' || base === 'pet_bulldog';
    let sprite = base;
    if (player.petFedToday && hasPoses) {
      const mood = pick(3);
      if (base === 'pet_bulldog') sprite = mood === 0 ? posed('sleep') : base;
      else sprite = mood === 0 ? posed('sleep') : mood === 1 ? posed('eat') : posed('play');
    }
    const tiles: [number, number] = sprite.endsWith('_sleep') && base !== 'pet_cat' ? [2, 1] : [1, 1];

    // A pet corner near the front: the bed hugs the open side, the animal
    // stands beside it and a bowl waits in front. Candidate sets are mirrored
    // left/right, because the dorm's rug can fence the whole back row off.
    place(a, 'pet_bed', [1, 1], [
      [2, d - 2], [1, d - 2], [3, d - 2], [4, d - 2],
      [w - 3, d - 2], [w - 2, d - 2], [w - 1, d - 2], [w - 1, d - 3],
      [2, d - 1], [w - 2, d - 1], [1, d - 1], [w - 1, d - 1],
      [3, d - 3], [w - 2, d - 3], [4, d - 3], [w - 3, d - 3],
    ]);
    place(a, sprite, tiles, [
      [3, d - 2], [2, d - 1], [4, d - 2], [1, d - 1],
      [w - 2, d - 2], [w - 1, d - 2], [w - 2, d - 1], [w - 1, d - 1],
      [4, d - 1], [3, d - 1], [w - 3, d - 1], [5, d - 2], [w - 3, d - 2],
    ]);
    // a bowl only where the pose does not already come with one
    if (!sprite.endsWith('_eat')) {
      place(a, player.petFedToday ? 'pet_bowl_full' : 'pet_bowl', [1, 1], [
        [4, d - 1],
        [3, d - 1],
        [2, d - 2],
        [5, d - 1],
        [w - 2, d - 1],
        [w - 1, d - 1],
        [w - 3, d - 1],
        [2, d - 1],
        [w - 2, d - 2],
        [w - 1, d - 2],
      ]);
    }
    if (petId === 'pet_cat') place(a, 'cat_tower', [1, 1], [[0, d - 2], [w - 1, d - 3], [w - 1, d - 2], [4, d - 3]]);
  }
  if (level === 0 && !petId) place(a, 'box_open', [1, 1], [[2, d - 2], [3, d - 2]]);

  // ── the rest of a home: kitchen, storage, the odd hobby ─────────────────
  if (level >= 1) place(a, 'wardrobe', swapped ? [1, 2] : [2, 1], at([w - 3, 0], [w - 4, 0], [w - 3, 1]));
  if (level >= 2) place(a, 'dresser', swapped ? [1, 2] : [2, 1], [[1, d - 2], [w - 3, d - 2]]);
  if (level >= 1) place(a, 'kitchen_counter', swapped ? [1, 2] : [2, 1], at([w - 4, 1], [w - 3, 1], [w - 4, 2]));
  // the appliance trio wants a free wall run; candidates fan out along it so a
  // mirrored (portrait) flat still gets its kitchen, not just the landscape one
  if (level >= 2) place(a, 'stove', [1, 1], at([w - 2, 2], [w - 2, 1], [w - 3, 2], [w - 3, 3], [w - 4, 3]));
  if (level >= 2) place(a, 'dishwasher', [1, 1], at([w - 3, 2], [w - 4, 2], [w - 3, 3], [w - 4, 3], [w - 2, 3], [w - 4, 4]));
  if (level >= 3) place(a, 'dining_table', [2, 2], [[3, d - 3], [4, d - 3], [2, d - 3]]);
  if (level >= 3) place(a, 'mirror', [1, 1], [[1, d - 3], [w - 2, d - 4]]);
  if (level >= 4) place(a, 'kitchen_sink', swapped ? [1, 2] : [2, 1], at([w - 4, 2], [w - 4, 3]));
  if (level <= 1) place(a, 'basket', [1, 1], [[0, d - 1], [1, d - 2]]);

  // hobbies and small victories, seeded so two identical players still differ
  const flavour = pick(4);
  if (level >= 1 && flavour === 0) place(a, 'guitar', [1, 1], [[0, d - 2], [w - 1, d - 2]]);
  if (level >= 1 && flavour === 1) place(a, 'skateboard', [1, 1], [[0, d - 2], [1, d - 1]]);
  if (level >= 2 && flavour === 2) place(a, 'dumbbells', [2, 1], [[w - 3, d - 1], [1, d - 1]]);
  if (has('gym_subscription')) place(a, 'dumbbells', [2, 1], [[w - 3, d - 1], [1, d - 1]]);
  if (level <= 1) place(a, 'pizza_boxes', [1, 1], [[3, d - 1], [4, d - 1]]);

  // ── walls ───────────────────────────────────────────────────────────────
  wall(a, 'window', 'right', Math.max(1, w - 4), 6);
  wall(a, 'poster', 'left', 1, 10);
  if (level >= 1) wall(a, 'corkboard', 'left', Math.max(2, d - 4), 8);
  if (totalLevels >= 20) wall(a, 'shelf_books', 'right', 1, 16);
  if (level >= 3) wall(a, 'shelf_plants', 'left', Math.max(3, d - 3), 14);
  if (hasAny('gaming_pc', 'mining_rig') || level >= 3) wall(a, 'neon_bolt', 'right', w - 2, 12);
  if (level >= 1) wall(a, 'wall_clock', 'right', Math.max(2, w - 3), 8);
  if (totalLevels >= 30) wall(a, 'diploma', 'left', Math.max(1, d - 6), 12);
  if (level >= 2) wall(a, level >= 4 ? 'cabinets_long' : 'cabinets', 'right', Math.max(1, w - 3), 4);
  if (level >= 2 && pick(2) === 0) wall(a, 'string_lights', 'left', 2, 2);
  if (level >= 3 && pick(2) === 0) wall(a, 'hoop', 'right', 2, 4);

  // ── the player stands in the open, never behind the furniture ───────────
  const spot = standingSpot(a, [Math.floor(w / 2), Math.max(1, d - 2)]);
  occupy(a, spot[0], spot[1]);

  return {
    size,
    palette: paletteFrom(paint, floor),
    items: a.items,
    player: { gx: spot[0], gy: spot[1] },
  };
}

