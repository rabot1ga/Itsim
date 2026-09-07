import { PlacedItem, RoomSize, WallSide } from './geometry';

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
}

const PALETTES: RoomPalette[] = [
  // 0 — общага: cold concrete, tired lino
  {
    wallLeft: '#2b3140',
    wallRight: '#343b4c',
    wallTrim: '#454d61',
    floorA: '#6b5a46',
    floorB: '#75634d',
    floorLine: '#584a3a',
    skirting: '#232936',
  },
  // 1 — однушка: warmer paint, honest parquet
  {
    wallLeft: '#2f3646',
    wallRight: '#3a4254',
    wallTrim: '#505b72',
    floorA: '#8a6238',
    floorB: '#95693c',
    floorLine: '#6d4d2c',
    skirting: '#262c39',
  },
  // 2 — центр: soft blue-grey, light oak
  {
    wallLeft: '#333c4f',
    wallRight: '#3f4a60',
    wallTrim: '#55617a',
    floorA: '#a2794f',
    floorB: '#ae8357',
    floorLine: '#7d5b39',
    skirting: '#28303e',
  },
  // 3 — ипотека: deep evening walls, dark walnut
  {
    wallLeft: '#2c3547',
    wallRight: '#374258',
    wallTrim: '#4e5c76',
    floorA: '#7a5535',
    floorB: '#845c3a',
    floorLine: '#5e4128',
    skirting: '#232b3a',
  },
  // 4 — пентхаус: near-black walls, pale designer floor
  {
    wallLeft: '#252c3b',
    wallRight: '#2f3849',
    wallTrim: '#5b6a86',
    floorA: '#9d8b74',
    floorB: '#a9977f',
    floorLine: '#7a6a57',
    skirting: '#1d2431',
  },
];

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
  job?: unknown;
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

  // ── the workplace: desk against the back-right wall ─────────────────────
  const bigDesk = hasAny('gaming_pc', 'macbook');
  if (bigDesk) {
    place(a, 'desk_dual', [3, 2], [[1, 0], [2, 0], [0, 0]]);
  } else {
    place(a, 'desk_wood', [2, 1], [[1, 0], [2, 0], [0, 0]]);
  }
  if (hasAny('gaming_pc', 'mining_gpu')) place(a, 'pc_tower', [1, 1], [[w - 2, 0], [4, 0], [w - 1, 1]]);
  if (has('macbook')) place(a, 'laptop_table', [1, 1], [[4, 1], [w - 2, 2]]);

  const chair = hasAny('gaming_chair', 'herman_miller')
    ? 'chair_gaming'
    : has('office_chair')
      ? 'chair_office'
      : null;
  if (chair) place(a, chair, [1, 1], [[2, 2], [1, 2], [3, 2]]);

  // ── living: bed along the back-left wall, then comfort by housing level ──
  place(a, 'bed', [2, 3], [[0, 2], [0, 1], [0, 3]]);
  if (level >= 1) place(a, 'nightstand', [1, 1], [[0, 1], [0, 0], [1, 1]]);
  if (level >= 1) place(a, 'fridge', [1, 1], [[w - 1, 0], [w - 1, 1]]);
  if (level >= 2) place(a, 'tv_stand', [2, 1], [[1, d - 1], [2, d - 1]]);
  if (level >= 2) place(a, 'coffee_table', [1, 1], [[w - 3, d - 2], [3, d - 2]]);
  if (level >= 3) place(a, 'sofa', [2, 1], [[w - 3, d - 1], [w - 2, d - 1]]);
  if (level >= 2) place(a, 'armchair', [1, 1], [[w - 1, d - 2], [w - 1, d - 3]]);
  if (level >= 3) place(a, 'palm', [1, 1], [[0, d - 1], [1, d - 1]]);
  if (level >= 4) place(a, 'arcade', [1, 1], [[w - 1, 2], [w - 1, 3]]);
  if (level >= 1) place(a, 'floor_lamp', [1, 1], [[w - 1, d - 1], [0, d - 1]]);
  if (level <= 1) place(a, 'boxes', [1, 1], [[3, d - 1], [2, d - 2]]);
  if (level === 0) place(a, 'rug_rolled', [2, 1], [[2, d - 2], [1, d - 2]]);
  if (level >= 2) place(a, 'beanbag', [1, 1], [[w - 2, 2], [w - 2, 3]]);

  // ── what the player earned ──────────────────────────────────────────────
  if (totalLevels >= 20) place(a, 'bookshelf', [1, 1], [[w - 1, 0], [w - 2, 0], [w - 1, 1]]);
  if (totalLevels >= 40) place(a, 'whiteboard', [2, 1], [[w - 2, 1], [w - 3, 0]]);
  if (has('desk_plant')) place(a, 'plant_monstera', [1, 1], [[w - 1, d - 1], [0, d - 1], [w - 2, d - 1]]);
  if (hasAny('mining_rig', 'mining_asic')) place(a, 'server_rack', [1, 1], [[w - 1, 3], [w - 1, 2]]);
  const pet = [...items].some((id) => id.startsWith('pet_') && !id.match(/^pet_(bow|glasses|crown)$/));
  if (pet) place(a, 'pet_bed', [1, 1], [[2, d - 2], [1, d - 2], [3, d - 2]]);
  if (level === 0 && !pet) place(a, 'box_open', [1, 1], [[2, d - 2], [3, d - 2]]);

  // ── walls ───────────────────────────────────────────────────────────────
  wall(a, 'window', 'right', Math.max(1, w - 4), 6);
  wall(a, 'poster', 'left', 1, 10);
  if (level >= 1) wall(a, 'corkboard', 'left', Math.max(2, d - 4), 8);
  if (totalLevels >= 20) wall(a, 'shelf_books', 'right', 1, 16);
  if (level >= 3) wall(a, 'shelf_plants', 'left', Math.max(3, d - 3), 14);
  if (hasAny('gaming_pc', 'mining_rig') || level >= 3) wall(a, 'neon_bolt', 'right', w - 1, 12);

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
    palette: PALETTES[level],
    items: a.items,
    player: { gx: spot[0], gy: spot[1] },
  };
}

/**
 * Which character sprite the player is drawn with.
 *
 * The wardrobe has more options than the sprite set does, so tops collapse to
 * three silhouettes (hoodie / t-shirt / office shirt) and long hairstyles get
 * their own sprite. Everything unknown falls back to the hoodie.
 */
export function characterSprite(player: ScenePlayer): string {
  const g = (player as { genetics?: { hairStyle?: string; top?: string } }).genetics;
  const av = (player as { avatar?: { hair?: string | null; top?: string | null } }).avatar;
  const hair = av?.hair ?? g?.hairStyle ?? '';
  const top = av?.top ?? g?.top ?? '';

  if (/long|ponytail|manbun/.test(hair)) return 'char_long';
  if (top === 'top_shirt' || top === 'top_jacket') return 'char_shirt';
  if (top === 'top_tshirt') return 'char_tshirt';
  return 'char_base';
}
