import { PlacedItem, RoomSize, WallSide } from './geometry';
import { RoomPalette } from './scene';
import { characterLook, rolls } from './palette';
import { CHARACTER_BASES } from './palette';

/**
 * The office scene.
 *
 * Same tile grid and same sprite library as the flat, but furnished from
 * employment instead of housing: a garage startup is four desks and a sofa, a
 * corporation is rows of workstations, a reception and a meeting room. The
 * team sits in it — every colleague is a recoloured character sprite seeded
 * from the company and their own index, so each company has its own faces and
 * they stay the same between visits.
 */

export interface OfficeScene {
  size: RoomSize;
  palette: RoomPalette;
  items: PlacedItem[];
  player: { gx: number; gy: number };
  /** colleagues, already recoloured and placed */
  crew: PlacedItem[];
}

export type CompanyKind = 'garage' | 'cowork' | 'product' | 'corp';

export interface OfficeInput {
  /** company id or name — the seed for the office's own look */
  companyId?: string;
  companySize?: string;
  grade?: string;
  /** how many colleagues to show */
  teamSize?: number;
  mood?: 'normal' | 'deadline' | 'friday' | 'night' | 'retro';
  seed?: string;
}

const KIND_BY_SIZE: Record<string, CompanyKind> = {
  startup: 'garage',
  outsource: 'cowork',
  product: 'product',
  enterprise: 'corp',
};

const SIZES: Record<CompanyKind, RoomSize> = {
  garage: { w: 7, d: 6 },
  cowork: { w: 9, d: 7 },
  product: { w: 10, d: 8 },
  corp: { w: 11, d: 9 },
};

/** Office finishes: colder and flatter than a home, and darker at night. */
const PALETTES: Record<CompanyKind, RoomPalette> = {
  garage: {
    wallLeft: '#33343a',
    wallRight: '#3d3e46',
    wallTrim: '#565863',
    skirting: '#26272c',
    floorA: '#6a6257',
    floorB: '#726a5e',
    floorLine: '#554e45',
    floorPattern: 'concrete',
    paintId: 'garage',
    floorId: 'screed',
  },
  cowork: {
    wallLeft: '#31404a',
    wallRight: '#3b4d59',
    wallTrim: '#587284',
    skirting: '#26313a',
    floorA: '#8a6238',
    floorB: '#95693c',
    floorLine: '#6d4d2c',
    floorPattern: 'planks',
    paintId: 'cowork',
    floorId: 'pine',
  },
  product: {
    wallLeft: '#2f3646',
    wallRight: '#3a4254',
    wallTrim: '#505b72',
    skirting: '#262c39',
    floorA: '#4f5561',
    floorB: '#555c69',
    floorLine: '#414652',
    floorPattern: 'carpet',
    paintId: 'product',
    floorId: 'carpet_grey',
  },
  corp: {
    wallLeft: '#454b58',
    wallRight: '#525968',
    wallTrim: '#767f92',
    skirting: '#343a45',
    floorA: '#3c4351',
    floorB: '#8d94a3',
    floorLine: '#2c323d',
    floorPattern: 'tiles',
    paintId: 'corp',
    floorId: 'checker',
  },
};

interface Allocator {
  size: RoomSize;
  taken: boolean[];
  items: PlacedItem[];
}

function free(a: Allocator, gx: number, gy: number, w: number, d: number): boolean {
  if (gx < 0 || gy < 0 || gx + w > a.size.w || gy + d > a.size.d) return false;
  for (let x = gx; x < gx + w; x++) {
    for (let y = gy; y < gy + d; y++) if (a.taken[y * a.size.w + x]) return false;
  }
  return true;
}

function occupy(a: Allocator, gx: number, gy: number, w: number, d: number): void {
  for (let x = gx; x < gx + w; x++) for (let y = gy; y < gy + d; y++) a.taken[y * a.size.w + x] = true;
}

function place(
  a: Allocator,
  sprite: string,
  tiles: [number, number],
  candidates: Array<[number, number]>,
  extra: Partial<PlacedItem> = {}
): [number, number] | null {
  for (const [gx, gy] of candidates) {
    if (!free(a, gx, gy, tiles[0], tiles[1])) continue;
    occupy(a, gx, gy, tiles[0], tiles[1]);
    a.items.push({ kind: 'floor', sprite, gx, gy, tiles, ...extra } as PlacedItem);
    return [gx, gy];
  }
  return null;
}

function wall(a: Allocator, sprite: string, side: WallSide, along: number, top: number): void {
  a.items.push({ kind: 'wall', sprite, side, along, top });
}

export function buildOfficeScene(input: OfficeInput): OfficeScene {
  const kind = KIND_BY_SIZE[input.companySize ?? ''] ?? 'cowork';
  const size = SIZES[kind];
  const { w, d } = size;
  const seed = input.seed ?? input.companyId ?? kind;
  const pick = rolls(`${seed}:office`);

  const a: Allocator = { size, taken: new Array(w * d).fill(false), items: [] };

  // ── workstations: rows of desks along the back-right wall ───────────────
  const rows = kind === 'garage' ? 1 : kind === 'cowork' ? 2 : 2;
  const perRow = kind === 'garage' ? 2 : kind === 'corp' ? 3 : 2;
  const desks: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const spot = place(a, 'desk_office', [2, 2], [
        [1 + i * 3, r * 3],
        [1 + i * 3, r * 3 + 1],
        [i * 3, r * 3],
      ]);
      if (spot) desks.push(spot);
    }
  }

  // ── shared rooms ────────────────────────────────────────────────────────
  if (kind !== 'garage') place(a, 'meeting_table', [4, 2], [[w - 5, d - 3], [w - 5, d - 4], [1, d - 3]]);
  if (kind === 'corp' || kind === 'product') place(a, 'reception', [3, 2], [[w - 4, 0], [w - 4, 1]]);
  place(a, 'office_sofa', [2, 1], [[0, d - 2], [1, d - 1], [0, d - 3]]);
  place(a, 'water_cooler', [1, 1], [[w - 2, 2], [w - 2, 1], [w - 3, 2]]);
  place(a, 'coffee_machine', [1, 1], [[w - 2, 3], [w - 2, 4], [w - 3, 3]]);
  if (kind !== 'garage') place(a, 'printer', [1, 1], [[w - 2, 4], [w - 2, 5], [w - 3, 4]]);
  if (kind === 'corp') place(a, 'filing_cabinet', [1, 1], [[w - 2, 5], [w - 2, 6]]);
  place(a, 'presentation_board', [2, 1], [[2, d - 2], [3, d - 2], [2, d - 3]]);
  if (kind === 'garage') place(a, 'boxes', [1, 1], [[w - 2, d - 2], [w - 3, d - 2]]);
  if (kind === 'garage') place(a, 'pizza_boxes', [1, 1], [[w - 3, d - 1], [w - 2, d - 1]]);
  place(a, 'palm', [1, 1], [[1, d - 2], [w - 2, d - 2], [1, d - 3]]);
  if (kind !== 'garage') place(a, 'plant_monstera', [1, 1], [[w - 2, d - 3], [0, d - 3]]);
  if (kind === 'product' || kind === 'corp') place(a, 'server_rack', [1, 1], [[w - 2, 6], [w - 2, 5]]);

  // ── walls ───────────────────────────────────────────────────────────────
  wall(a, 'window', 'right', Math.max(1, w - 4), 6);
  wall(a, 'wall_clock', 'right', 1, 8);
  wall(a, 'whiteboard', 'left', 1, 10);
  if (kind !== 'garage') wall(a, 'corkboard', 'left', Math.max(2, d - 4), 8);
  if (kind === 'corp') wall(a, 'diploma', 'left', Math.max(1, d - 6), 12);
  if (kind === 'garage' || pick(2) === 0) wall(a, 'neon_bolt', 'right', w - 2, 12);
  if (kind !== 'corp') wall(a, 'string_lights', 'left', 2, 2);

  // ── the team: one colleague per desk, each their own person ─────────────
  const crew: PlacedItem[] = [];
  const wanted = Math.min(input.teamSize ?? desks.length, desks.length);
  const bases = Object.keys(CHARACTER_BASES);
  for (let i = 0; i < wanted; i++) {
    const [gx, gy] = desks[i];
    const cell: [number, number] = [gx, Math.min(d - 1, gy + 2)];
    if (!free(a, cell[0], cell[1], 1, 1)) continue;
    occupy(a, cell[0], cell[1], 1, 1);
    const look = characterLook({ fallbackSeed: `${seed}:crew:${i}` });
    crew.push({
      kind: 'char',
      sprite: bases.includes(look.base) ? look.base : bases[i % bases.length],
      gx: cell[0],
      gy: cell[1],
      tiles: [1, 1],
      colours: look.colours,
    });
  }

  // ── the player takes the first free desk-side cell ──────────────────────
  let spot: [number, number] = [Math.floor(w / 2), d - 2];
  outer: for (let gy = d - 1; gy >= 0; gy--) {
    for (let gx = 0; gx < w; gx++) {
      if (free(a, gx, gy, 1, 1)) {
        spot = [gx, gy];
        break outer;
      }
    }
  }
  occupy(a, spot[0], spot[1], 1, 1);

  const palette = { ...PALETTES[kind] };
  if (input.mood === 'night') {
    palette.wallLeft = '#20252f';
    palette.wallRight = '#272d38';
    palette.wallTrim = '#3c4557';
  }

  return { size, palette, items: a.items, player: { gx: spot[0], gy: spot[1] }, crew };
}
