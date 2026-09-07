import { PlacedItem, RoomSize, WallSide } from './geometry';
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
 * ends up with furniture inside furniture.
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

interface Allocator {
  size: RoomSize;
  taken: boolean[];
  items: PlacedItem[];
}

function free(a: Allocator, gx: number, gy: number, w: number, d: number): boolean {
  if (gx < 0 || gy < 0 || gx + w > a.size.w || gy + d > a.size.d) return false;
  for (let x = gx; x < gx + w; x++) {
    for (let y = gy; y < gy + d; y++) {
      if (a.taken[y * a.size.w + x]) return false;
    }
  }
  return true;
}

function occupy(a: Allocator, gx: number, gy: number, w: number, d: number): void {
  for (let x = gx; x < gx + w; x++) {
    for (let y = gy; y < gy + d; y++) {
      a.taken[y * a.size.w + x] = true;
    }
  }
}

/** Put a sprite on the first free cell out of the preferred ones. */
function place(
  a: Allocator,
  sprite: string,
  tiles: [number, number],
  candidates: Array<[number, number]>,
  extra: Partial<PlacedItem> = {}
): boolean {
  for (const [gx, gy] of candidates) {
    if (!free(a, gx, gy, tiles[0], tiles[1])) continue;
    occupy(a, gx, gy, tiles[0], tiles[1]);
    a.items.push({ kind: 'floor', sprite, gx, gy, tiles, ...extra } as PlacedItem);
    return true;
  }
  return false;
}

function wall(a: Allocator, sprite: string, side: WallSide, along: number, top: number): void {
  a.items.push({ kind: 'wall', sprite, side, along, top });
}

export function buildRoomScene(player: ScenePlayer): RoomScene {
  const level = Math.max(0, Math.min(4, player.housingLevel ?? 0));
  const size = SIZES[level];
  const items = new Set(player.items ?? []);
  const has = (id: string) => items.has(id);
  const hasAny = (...ids: string[]) => ids.some(has);
  const totalLevels = Object.values(player.skills ?? {}).reduce((s, v) => s + (v?.level ?? 0), 0);

  const a: Allocator = { size, taken: new Array(size.w * size.d).fill(false), items: [] };
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
  if (level >= 2) place(a, 'armchair', [1, 1], [[w - 2, d - 2], [w - 2, d - 3], [w - 3, d - 2]]);
  if (level >= 3) place(a, 'palm', [1, 1], [[1, d - 2], [1, d - 1], [w - 2, d - 2]]);
  if (level >= 4) place(a, 'arcade', [1, 1], at([w - 2, 3], [w - 2, 4], [w - 3, 3]));
  if (level >= 1) place(a, 'floor_lamp', [1, 1], [[w - 2, d - 2], [1, d - 2], [w - 2, d - 3]]);
  if (level <= 1) place(a, 'boxes', [1, 1], [[3, d - 1], [2, d - 2]]);
  if (level === 0) place(a, 'rug_rolled', [2, 1], [[2, d - 2], [1, d - 2]]);
  if (level >= 2) place(a, 'beanbag', [1, 1], [[w - 2, 2], [w - 2, 3]]);

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
  };
  const petId = [...items].find((id) => PET_SPRITES[id]);
  if (petId) {
    place(a, 'pet_bed', [1, 1], [[2, d - 2], [1, d - 2], [3, d - 2]]);
    place(a, PET_SPRITES[petId], [1, 1], [[3, d - 2], [2, d - 1], [4, d - 2], [1, d - 1]]);
    if (petId === 'pet_cat') place(a, 'cat_tower', [1, 1], [[0, d - 2], [w - 1, d - 3]]);
  }
  if (level === 0 && !petId) place(a, 'box_open', [1, 1], [[2, d - 2], [3, d - 2]]);

  // ── the rest of a home: kitchen, storage, the odd hobby ─────────────────
  if (level >= 1) place(a, 'wardrobe', swapped ? [1, 2] : [2, 1], at([w - 3, 0], [w - 4, 0], [w - 3, 1]));
  if (level >= 2) place(a, 'dresser', swapped ? [1, 2] : [2, 1], [[1, d - 2], [w - 3, d - 2]]);
  if (level >= 1) place(a, 'kitchen_counter', swapped ? [1, 2] : [2, 1], at([w - 4, 1], [w - 3, 1], [w - 4, 2]));
  if (level >= 2) place(a, 'stove', [1, 1], at([w - 2, 2], [w - 2, 1], [w - 3, 2]));
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
  if (level >= 2) wall(a, 'cabinets', 'right', Math.max(1, w - 3), 4);
  if (level >= 2 && pick(2) === 0) wall(a, 'string_lights', 'left', 2, 2);
  if (level >= 3 && pick(2) === 0) wall(a, 'hoop', 'right', 2, 4);

  // ── the player stands in the free middle of the room ────────────────────
  let spot: [number, number] = [Math.floor(w / 2), Math.max(1, d - 2)];
  outer: for (let ring = 0; ring < Math.max(w, d); ring++) {
    for (let gy = d - 1; gy >= 0; gy--) {
      for (let gx = 0; gx < w; gx++) {
        if (Math.abs(gx - Math.floor(w / 2)) + Math.abs(gy - (d - 2)) !== ring) continue;
        if (free(a, gx, gy, 1, 1)) {
          spot = [gx, gy];
          break outer;
        }
      }
    }
  }
  occupy(a, spot[0], spot[1], 1, 1);

  return {
    size,
    palette: paletteFrom(paint, floor),
    items: a.items,
    player: { gx: spot[0], gy: spot[1] },
  };
}

