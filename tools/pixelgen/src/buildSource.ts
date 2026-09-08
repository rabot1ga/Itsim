/**
 * Pixel-art authoring (Этап 2 ТЗ): writes packages/content/pixel/components.source.json
 *
 * Why a script and not a hand-written blob: the same geometry rules (fixed eye
 * row, fixed mouth row, symmetry axis, canvas bounds) must hold for all 30 MVP
 * components, and humans break them. The rows produced here are the *input* for
 * the AI master-prompt loop too — a model that regenerates a component can be
 * diffed against this baseline.
 *
 * Palette tokens: 0=highlight 1=base 2=shade 3=outline (docs/pixel-art.md §1.4).
 * Components marked `mirror` describe only the left half; the renderer reflects
 * them about layout.symmetry_axis_x.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const OUT = join(ROOT, 'packages', 'content', 'pixel');

const W = 32;
const H = 32;
const AXIS = 15.5;
const EYES_Y = 15;
const MOUTH_Y = 20;
const NECK_TOP = 24;
const SHOULDER_TOP = 26;

const SKIN = ['skin#0', 'skin#1', 'skin#2', 'skin#3'];
const HAIR = ['hair#0', 'hair#1', 'hair#2', 'hair#3'];
const EYE = ['eyes#0', 'eyes#1', 'eyes#2', 'eyes#3'];
const CLOTH = ['cloth#0', 'cloth#1', 'cloth#2', 'cloth#3'];
const HAT = ['hat#0', 'hat#1', 'hat#2', 'hat#3'];
const ACC = ['accessory#0', 'accessory#1', 'accessory#2', 'accessory#3'];
const MOUTH = ['mouth#0', 'mouth#1', 'mouth#2', 'mouth#3'];
const WHITE = 'white#0';
const BLACK = 'white#3';
const LENS = '#39506b';
const METAL = '#9aa4b2';
const RED = 'eyes#4';
const DARKRED = 'eyes#5';
const TIE = 'hat#2'; // corporate tie = dark accent of the accent palette
const MEDAL = '#d9b64a'; // only in the extended pack (accessory allows literal hex)

/** head silhouette: skull (rows 5..17), cheeks (18..23), neck (24..25) */
function headMask(rows = true): Set<string> {
  const set = new Set<string>();
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    set.add(`${x},${y}`);
  };
  if (rows) {
    // skull is 1 px narrower than the cheeks so hair/hats have something to sit on
    for (let y = 5; y <= 7; y++) for (let x = 9; x <= 22; x++) add(x, y);
    for (let y = 8; y <= 17; y++) for (let x = 8; x <= 23; x++) add(x, y);
    // gentle jaw: a hard 1-px taper read as a pinecone in the first spritesheet
    for (let y = 18; y <= 23; y++) {
      const inset = y === 23 ? 2 : y === 22 ? 2 : y >= 20 ? 1 : 0;
      for (let x = 8 + inset; x <= 23 - inset; x++) add(x, y);
    }
    for (let y = NECK_TOP; y <= NECK_TOP + 1; y++) for (let x = 13; x <= 18; x++) add(x, y);
  }
  return set;
}

function band(yFrom: number, yTo: number, xFrom: number, xTo: number): Set<string> {
  const set = new Set<string>();
  for (let y = yFrom; y <= yTo; y++) for (let x = xFrom; x <= xTo; x++) set.add(`${x},${y}`);
  return set;
}

function union(...sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}


/**
 * Paint a mask with automatic shading: outline on the silhouette edge,
 * highlight on the left flank, shade on the right flank, base in the middle.
 * This is what makes "AI-generated pixels" look deliberate instead of flat.
 */
function shaded(mask: Set<string>, pal: string[], opts: { outline?: boolean; flank?: boolean } = {}): Map<string, string> {
  const out = new Map<string, string>();
  const outline = opts.outline !== false;
  const flank = opts.flank !== false;
  // flank per *row*: makes hair/cloth read as a lit volume instead of a blob
  const rowMin = new Map<number, number>();
  const rowMax = new Map<number, number>();
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    rowMin.set(y, Math.min(rowMin.get(y) ?? x, x));
    rowMax.set(y, Math.max(rowMax.get(y) ?? x, x));
  }
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    const minX = rowMin.get(y)!;
    const maxX = rowMax.get(y)!;
    const edge =
      outline && (!mask.has(`${x},${y - 1}`) || !mask.has(`${x},${y + 1}`) || !mask.has(`${x - 1},${y}`) || !mask.has(`${x + 1},${y}`));
    if (edge) {
      out.set(key, pal[3]);
      continue;
    }
    if (flank) {
      if (x <= minX + 1) out.set(key, pal[0]);
      else if (x >= maxX - 1) out.set(key, pal[2]);
      else out.set(key, pal[1]);
    } else {
      out.set(key, pal[1]);
    }
  }
  return out;
}

function grid(): Map<string, string> {
  return new Map<string, string>();
}

function put(map: Map<string, string>, key: string, color: string) {
  map.set(key, color);
}

function toRows(map: Map<string, string>, palettes: string[], origin = { x: 0, y: 0 }): string[] {
  const byY = new Map<number, Map<number, string>>();
  for (const [key, color] of map) {
    const [x, y] = key.split(',').map(Number);
    if (!byY.has(y)) byY.set(y, new Map());
    byY.get(y)!.set(x, color);
  }
  const ys = [...byY.keys()].sort((a, b) => a - b);
  if (ys.length === 0) return [];
  const tokenIndex = new Map<string, string>();
  palettes.forEach((p, i) => {
    if (!tokenIndex.has(p)) tokenIndex.set(p, String(i));
  });
  const reserved: Array<[string, string]> = [[LENS, 'l'], [METAL, 'm'], [MEDAL, 'd']];
  for (const [hex, tok] of reserved) if (!tokenIndex.has(hex)) tokenIndex.set(hex, tok);
  if (palettes.includes('white#0') && !tokenIndex.has(WHITE)) tokenIndex.set(WHITE, '0');
  if (palettes.includes('white#3') && !tokenIndex.has(BLACK)) tokenIndex.set(BLACK, '3');

  const rows: string[] = [];
  let prevY = ys[0];
  for (const y of ys) {
    // empty rows must stay in the array: the engine reads rows[y] as a y-offset
    // from the anchor, so dropping a blank row would silently shift the sprite
    for (let gap = prevY + 1; gap < y; gap++) rows.push('');
    prevY = y;
    const line: string[] = [];
    const rowMap = byY.get(y)!;
    const xs = [...rowMap.keys()].sort((a, b) => a - b);
    const first = xs[0];
    const last = xs[xs.length - 1];
    for (let x = first; x <= last; x++) {
      const color = rowMap.get(x);
      if (!color) {
        line.push('.');
        continue;
      }
      const token = tokenIndex.get(color);
      if (!token) throw new Error(`color "${color}" is not in the component palettes (row ${y}, x ${x})`);
      line.push(token);
    }
    // leading dots are meaningless (anchor pins the row) but trailing structure is not: keep gaps inside
    rows.push(`${x0(first - origin.x)}${line.join(' ')}`.trim());
  }
  return rows;

  function x0(offset: number): string {
    return offset > 0 ? `${'@'}${offset} ` : '';
  }
}

interface Comp {
  category: string;
  label: string;
  extended?: boolean;
  anchor: { x: number; y: number };
  mirror?: boolean;
  excludes?: string[];
  palettes: string[];
  rows: string[];
  tags?: string[];
}

/**
 * Build a component from a map of absolute canvas pixels.
 * `mirror` expects only the left half (x ≤ 15); rows are relative to the anchor.
 */
function component(
  id: string,
  category: string,
  label: string,
  map: Map<string, string>,
  palettes: string[],
  opts: { anchor?: { x: number; y: number }; mirror?: boolean; excludes?: string[]; tags?: string[] } = {}
): [string, Comp] {
  // anchor = top-left of the painted bbox (docs/pixel-art.md §1.1): rows stay
  // compact, and the validator is what keeps features from drifting.
  const ys = [...map.keys()].map((k) => Number(k.split(',')[1]));
  const minXs = [...map.keys()].map((k) => Number(k.split(',')[0]));
  const anchor = opts.anchor ?? (map.size === 0 ? { x: 0, y: 0 } : { x: Math.min(...minXs), y: Math.min(...ys) });
  const rows = toRows(map, palettes, anchor);
  return [
    id,
    {
      category,
      label,
      anchor,
      ...(opts.mirror ? { mirror: true } : {}),
      ...(opts.excludes ? { excludes: opts.excludes } : {}),
      palettes,
      rows,
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
  ];
}


function faceComponent(id: string, label: string, mask: Set<string>, extra?: (m: Map<string, string>) => void): [string, Comp] {
  const map = grid();
  const shadedFace = shaded(mask, SKIN);
  for (const [k, v] of shadedFace) put(map, k, v);
  // jaw shadow line
  const ys = [...mask].map((k) => Number(k.split(',')[1])).sort((a, b) => a - b);
  const maxY = ys[ys.length - 1];
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    if (y === maxY) put(map, `${x},${y}`, SKIN[3]);
    if (y >= NECK_TOP) put(map, `${x},${y}`, SKIN[2]);
  }
  extra?.(map);
  // faces are asymmetric by design (light from the left), no mirroring
  return component(id, 'face', label, map, SKIN, { tags: ['face'] });
}

// ---------------------------------------------------------------------------
// face (3)
// ---------------------------------------------------------------------------

const skullRound = headMask();
const skullAngular = (() => {
  const m = new Set<string>();
  for (let y = 5; y <= 7; y++) for (let x = 10; x <= 21; x++) m.add(`${x},${y}`);
  for (let y = 8; y <= 17; y++) for (let x = 9; x <= 22; x++) m.add(`${x},${y}`);
  // square jaw: taper by at most 2 px, then a flat chin
  for (let y = 18; y <= 23; y++) {
    const inset = y >= 22 ? 2 : y >= 20 ? 1 : 0;
    for (let x = 9 + inset; x <= 22 - inset; x++) m.add(`${x},${y}`);
  }
  for (let y = NECK_TOP; y <= NECK_TOP + 1; y++) for (let x = 13; x <= 18; x++) m.add(`${x},${y}`);
  return m;
})();
const skullLong = union(headMask(), band(18, 24, 9, 22));

const faces = [
  faceComponent('face_round', 'Округлое лицо', skullRound),
  faceComponent('face_angular', 'Угловатое лицо', skullAngular),
  faceComponent(
    'face_long',
    'Вытянутое лицо',
    skullLong,
    (m) => {
      for (const key of [
        ...[1, 2, 3].map((i) => `${12},${6 + i}`),
        ...[1, 2, 3].map((i) => `${19},${6 + i}`),
      ]) {
        if (skullLong.has(key)) m.set(key, SKIN[0]);
      }
    }
  ),
];

// ---------------------------------------------------------------------------
// eyes (5) — anchored at (8, EYES_Y); left half only, mirrored
// ---------------------------------------------------------------------------

function eyeBase(): Map<string, string> {
  const m = grid();
  for (const [x, y] of [[9, 14], [10, 14], [11, 14], [9, 15], [10, 15], [11, 15], [10, 16]] as Array<[number, number]>) {
    put(m, `${x},${y}`, WHITE);
  }
  put(m, '10,15', EYE[1]);
  put(m, '11,15', EYE[2]);
  put(m, '9,14', EYE[0]);
  return m;
}

const eyeVariants: Array<{ id: string; label: string; draw: (m: Map<string, string>) => void; tags?: string[] }> = [
  { id: 'eyes_normal', label: 'Обычные', draw: () => {} },
  {
    id: 'eyes_tired',
    label: 'Уставшие',
    draw: (m) => {
      put(m, '9,16', EYE[3]);
      put(m, '10,16', EYE[2]);
      put(m, '9,17', SKIN[2]);
      put(m, '10,17', SKIN[2]);
    },
    tags: ['tired'],
  },
  {
    id: 'eyes_closed',
    label: 'Закрытые',
    draw: (m) => {
      m.clear();
      for (const x of [9, 10, 11]) put(m, `${x},15`, EYE[3]);
    },
    tags: ['rested'],
  },
  {
    id: 'eyes_wide',
    label: 'Удивлённые',
    draw: (m) => {
      put(m, '10,14', WHITE);
      put(m, '11,14', EYE[1]);
      put(m, '10,13', WHITE);
      put(m, '11,13', EYE[2]);
    },
    tags: ['shocked'],
  },
  {
    id: 'eyes_red',
    label: 'Красные от кода',
    draw: (m) => {
      put(m, '9,14', RED);
      put(m, '10,14', RED);
      put(m, '11,14', RED);
      put(m, '9,15', DARKRED);
      put(m, '11,15', DARKRED);
    },
    tags: ['burnout'],
  },
];

const eyes = eyeVariants.map((v) => {
  const m = eyeBase();
  v.draw(m);
  // eyebrows share the hair palette (ТЗ §4 — единственное разрешённое исключение)
  for (const x of [9, 10, 11]) put(m, `${x},12`, HAIR[1]);
  return component(v.id, 'eyes', v.label, leftHalfKeyFilter(m), [HAIR[1], ...EYE, SKIN[2], WHITE, BLACK, RED, DARKRED], {
    mirror: true,
    tags: v.tags,
  });
});

function leftHalfKeyFilter(m: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, val] of m) {
    if (Number(key.split(',')[0]) <= 15) out.set(key, val);
  }
  return out;
}

// ---------------------------------------------------------------------------
// mouth (4) — anchored at (10, MOUTH_Y); left half, mirrored
// ---------------------------------------------------------------------------

function mouth(id: string, label: string, cells: Array<[number, number, string]>): [string, Comp] {
  const m = grid();
  for (const [x, y, c] of cells) put(m, `${x},${y}`, c);
  return component(id, 'mouth', label, leftHalfKeyFilter(m), [...MOUTH, WHITE, BLACK, SKIN[1], SKIN[2]], { mirror: true });
}

const mouths = [
  mouth('mouth_smile', 'Улыбка', [[11, 20, MOUTH[3]], [12, 20, MOUTH[3]], [13, 20, MOUTH[3]], [10, 19, MOUTH[3]], [14, 21, MOUTH[2]], [13, 21, MOUTH[2]], [12, 21, MOUTH[2]]]),
  mouth('mouth_flat', 'Прямо', [[10, 20, MOUTH[3]], [11, 20, MOUTH[3]], [12, 20, MOUTH[3]], [13, 20, MOUTH[3]], [14, 20, MOUTH[3]]]),
  mouth('mouth_grin', 'Широкая ухмылка', [[9, 19, MOUTH[3]], [10, 20, MOUTH[3]], [11, 20, WHITE], [12, 20, WHITE], [13, 20, MOUTH[1]], [14, 21, MOUTH[2]], [11, 21, MOUTH[2]], [12, 21, MOUTH[2]]]),
  mouth('mouth_grimace', 'Гримаса дедлайна', [[10, 19, MOUTH[3]], [11, 20, MOUTH[3]], [12, 20, MOUTH[2]], [13, 20, MOUTH[3]], [14, 19, MOUTH[3]], [11, 21, SKIN[2]], [12, 21, SKIN[2]]]),
];

// ---------------------------------------------------------------------------
// hair (6) — crown of the head; left half mirrored where symmetric
// ---------------------------------------------------------------------------

function hairMask(kind: 'short' | 'buzz' | 'curly' | 'long' | 'bald' | 'manbun'): Set<string> {
  const m = new Set<string>();
  const add = (x: number, y: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) m.add(`${x},${y}`);
  };
  if (kind === 'bald') return m;
  if (kind === 'buzz') {
    for (let x = 9; x <= 15; x++) { add(x, 4); add(x, 5); add(x, 6); }
    for (let y = 7; y <= 8; y++) add(8, y); // short sides, no hard cap line
    return m;
  }
  if (kind === 'short') {
    for (let y = 3; y <= 6; y++) for (let x = 10; x <= 15; x++) add(x, y);
    for (let x = 9; x <= 15; x++) add(x, 7);
    for (let y = 8; y <= 11; y++) { add(8, y); add(9, y); }
    for (const [x, y] of [[10, 8], [11, 8], [12, 9], [13, 9]] as Array<[number, number]>) add(x, y); // fringe over the forehead
    return m;
  }
  if (kind === 'curly') {
    for (let y = 2; y <= 6; y++) for (let x = 9; x <= 15; x++) add(x, y);
    for (const [x, y] of [[8, 4], [16, 4], [8, 7], [16, 7], [9, 8], [10, 8], [11, 9], [12, 9], [13, 10]] as Array<[number, number]>) add(x, y);
    return m;
  }
  if (kind === 'long') {
    for (let y = 3; y <= 7; y++) for (let x = 9; x <= 15; x++) add(x, y);
    // curtain grows outward so the mirrored result reads as volume, not two poles
    for (let y = 8; y <= 24; y++) {
      const outer = y < 12 ? 8 : y < 18 ? 7 : 6;
      for (let x = outer; x <= 9; x++) add(x, y);
    }
    for (let x = 10; x <= 14; x++) add(x, 8); // fringe
    return m;
  }
  // manbun: short sides + a bun sitting on the crown (anchor x=0 side of the axis)
  for (let y = 4; y <= 6; y++) for (let x = 10; x <= 15; x++) add(x, y);
  for (let x = 9; x <= 15; x++) add(x, 7);
  for (let y = 8; y <= 10; y++) add(8, y);
  for (let y = 1; y <= 3; y++) for (let x = 13; x <= 15; x++) add(x, y);
  return m;
}

const hairs = (['short', 'buzz', 'curly', 'long', 'bald', 'manbun'] as const).map((kind) => {
  const id = `hair_${kind}`;
  const labels: Record<string, string> = {
    short: 'Короткая', buzz: 'Ёжик', curly: 'Кудри', long: 'Длинные', bald: 'Лысый', manbun: 'Man bun',
  };
  const mask = hairMask(kind);
  const map = grid();
  if (kind === 'bald') {
    // none-variant of hair must be empty: the shine comes from the face highlight
    return component(id, 'hair', labels[kind], map, [...SKIN, ...HAIR], { tags: ['bald'] });
  }
  const painted = shaded(mask, HAIR);
  for (const [k, v] of painted) put(map, k, v);
  return component(id, 'hair', labels[kind], leftHalfKeyFilter(map), [...SKIN, ...HAIR], {
    mirror: kind !== 'manbun',
    tags: [kind],
  });
});

// ---------------------------------------------------------------------------
// hats (5, incl. hat_none)
// ---------------------------------------------------------------------------

function hatMap(kind: 'beanie' | 'hood' | 'cap' | 'vr' | 'none'): Map<string, string> {
  const m = grid();
  if (kind === 'none') return m;
  if (kind === 'beanie') {
    for (let y = 3; y <= 6; y++) for (let x = 8; x <= 15; x++) put(m, `${x},${y}`, HAT[1]);
    for (let x = 7; x <= 15; x++) put(m, `${x},7`, HAT[2]); // folded brim, wider than the crown
    for (let x = 9; x <= 15; x++) put(m, `${x},4`, HAT[0]);
    put(m, '10,2', HAT[3]);
    put(m, '11,2', HAT[3]);
    return m;
  }
  if (kind === 'hood') {
    for (let y = 2; y <= 6; y++) for (let x = 8; x <= 15; x++) put(m, `${x},${y}`, HAT[1]);
    for (let x = 7; x <= 15; x++) put(m, `${x},7`, HAT[2]); // brim edge around the face
    for (let y = 8; y <= 14; y++) { put(m, `6,${y}`, HAT[2]); put(m, `7,${y}`, HAT[1]); }
    for (let y = 15; y <= 20; y++) put(m, `6,${y}`, HAT[2]); // drape behind the shoulder
    for (let x = 9; x <= 15; x++) put(m, `${x},3`, HAT[0]);
    for (let x = 8; x <= 15; x++) put(m, `${x},6`, HAT[3]);
    return m;
  }
  if (kind === 'cap') {
    for (let y = 3; y <= 6; y++) for (let x = 10; x <= 15; x++) put(m, `${x},${y}`, HAT[1]);
    for (let x = 9; x <= 15; x++) put(m, `${x},7`, HAT[2]);
    for (let x = 5; x <= 10; x++) put(m, `${x},8`, HAT[3]); // brim to the left
    for (let x = 5; x <= 10; x++) put(m, `${x},9`, HAT[2]);
    put(m, '12,3', HAT[0]);
    return m;
  }
  // vr headset: band + lens, sits over the eye row
  for (let y = 13; y <= 16; y++) for (let x = 7; x <= 15; x++) put(m, `${x},${y}`, HAT[1]);
  for (let x = 8; x <= 15; x++) put(m, `${x},13`, HAT[0]);
  for (let x = 8; x <= 15; x++) put(m, `${x},16`, HAT[3]);
  for (let y = 14; y <= 15; y++) for (let x = 9; x <= 14; x++) put(m, `${x},${y}`, LENS);
  return m;
}

const hats = [
  component('hat_none', 'hat', 'Без шапки', grid(), [...HAT], { tags: ['none'] }),
  component('hat_beanie', 'hat', 'Шапка-бини', leftHalfKeyFilter(hatMap('beanie')), [...HAT], { mirror: true, tags: ['warm'] }),
  component('hat_hood', 'hat', 'Капюшон', leftHalfKeyFilter(hatMap('hood')), [...HAT, SKIN[1]], { mirror: true, excludes: ['hair'], tags: ['hood', 'cozy'] }),
  component('hat_cap', 'hat', 'Кепка', leftHalfKeyFilter(hatMap('cap')), [...HAT], { tags: ['swag'] }),
  component('hat_vr', 'hat', 'VR-шлем', leftHalfKeyFilter(hatMap('vr')), [...HAT, LENS], { mirror: true, tags: ['vr', 'metaverse'] }),
];

// ---------------------------------------------------------------------------
// clothing (4, incl. clothing_none)
// ---------------------------------------------------------------------------

/** torso that widens toward the canvas edges: shoulders, not a belt */
function torso(kind: 'hoodie' | 'tshirt' | 'shirt'): Set<string> {
  const m = new Set<string>();
  for (let y = SHOULDER_TOP - 1; y < H; y++) {
    const t = y - (SHOULDER_TOP - 1);
    const outer = kind === 'hoodie' ? Math.max(1, 10 - t) : kind === 'tshirt' ? Math.max(2, 11 - t) : Math.max(1, 10 - t);
    for (let x = outer; x <= 15; x++) m.add(`${x},${y}`);
  }
  return m;
}

function clothMap(kind: 'hoodie' | 'tshirt' | 'shirt' | 'none'): Map<string, string> {
  const m = grid();
  if (kind === 'none') return m;
  if (kind === 'hoodie') {
    for (const key of torso(kind)) put(m, key, CLOTH[1]);
    for (let x = 11; x <= 15; x++) put(m, `${x},25`, CLOTH[2]); // collar over the neck
    for (const key of torso(kind)) {
      const [x, y] = key.split(',').map(Number);
      const t = y - (SHOULDER_TOP - 1);
      const outer = Math.max(1, 10 - t);
      if (x === outer) put(m, key, CLOTH[3]); // silhouette edge
      else if (x === outer + 1 && y >= SHOULDER_TOP + 1) put(m, key, CLOTH[0]); // shoulder light
    }
    for (let y = 27; y <= 30; y++) put(m, `10,${y}`, CLOTH[2]); // drawstring
    return m;
  }
  if (kind === 'tshirt') {
    for (const key of torso(kind)) put(m, key, CLOTH[1]);
    for (let x = 12; x <= 15; x++) put(m, `${x},25`, CLOTH[3]); // crew neck
    for (const key of torso(kind)) {
      const [x, y] = key.split(',').map(Number);
      const t = y - (SHOULDER_TOP - 1);
      if (x === Math.max(2, 11 - t)) put(m, key, CLOTH[3]);
    }
    // merch print: a 2×2 logo block, no letters (ТЗ: надписей не рисуем)
    for (const [x, y] of [[11, 28], [12, 28], [11, 29], [12, 29]] as Array<[number, number]>) put(m, `${x},${y}`, CLOTH[0]);
    return m;
  }
  // corporate shirt: collar wings + tie
  for (const key of torso(kind)) put(m, key, CLOTH[0]);
  for (const key of torso(kind)) {
    const [x, y] = key.split(',').map(Number);
    const t = y - (SHOULDER_TOP - 1);
    if (x === Math.max(1, 10 - t)) put(m, key, CLOTH[2]);
  }
  for (const [x, y] of [[11, 26], [12, 27], [13, 28], [14, 27], [15, 26]] as Array<[number, number]>) put(m, `${x},${y}`, CLOTH[3]);
  for (let y = 27; y <= 31; y++) for (let x = 13; x <= 14; x++) put(m, `${x},${y}`, TIE);
  for (let x = 12; x <= 15; x++) put(m, `${x},25`, CLOTH[1]);
  return m;
}

const clothes = [
  component('clothing_none', 'clothing', 'Как есть', grid(), [...CLOTH], { tags: ['none', 'naked'] }),
  component('clothing_hoodie', 'clothing', 'Худи', leftHalfKeyFilter(clothMap('hoodie')), [...CLOTH, SKIN[2]], { mirror: true, tags: ['hoodie', 'startup'] }),
  component('clothing_tshirt', 'clothing', 'Футболка', leftHalfKeyFilter(clothMap('tshirt')), [...CLOTH], { mirror: true, tags: ['merch'] }),
  component('clothing_shirt', 'clothing', 'Корпоративная рубашка', leftHalfKeyFilter(clothMap('shirt')), [...CLOTH, TIE], { mirror: true, tags: ['corp', 'tie'] }),
];

// ---------------------------------------------------------------------------
// accessories (3, incl. accessory_none)
// ---------------------------------------------------------------------------

function accMap(kind: 'glasses' | 'headphones' | 'medal' | 'none'): Map<string, string> {
  const m = grid();
  if (kind === 'none') return m;
  if (kind === 'glasses') {
    for (let x = 8; x <= 13; x++) { put(m, `${x},14`, METAL); put(m, `${x},16`, METAL); }
    for (let y = 15; y <= 15; y++) for (let x = 9; x <= 12; x++) put(m, `${x},${y}`, LENS);
    put(m, '14,15', METAL);
    put(m, '7,15', METAL);
    return m;
  }
  if (kind === 'headphones') {
    for (let y = 4; y <= 6; y++) for (let x = 11; x <= 15; x++) put(m, `${x},${y}`, ACC[1]);
    for (let y = 7; y <= 13; y++) put(m, `7,${y}`, ACC[1]);
    for (let y = 12; y <= 16; y++) { put(m, `6,${y}`, ACC[2]); put(m, `7,${y}`, ACC[1]); }
    put(m, '11,4', ACC[0]);
    put(m, '12,4', ACC[0]);
    return m;
  }
  // medal on the chest
  for (const [x, y] of [[12, 27], [13, 27], [12, 28], [13, 28]] as Array<[number, number]>) put(m, `${x},${y}`, MEDAL);
  put(m, '13,26', ACC[3]);
  return m;
}

const accessories = [
  component('accessory_none', 'accessory', 'Без аксессуара', grid(), [...ACC], { tags: ['none'] }),
  component('accessory_glasses', 'accessory', 'Очки', leftHalfKeyFilter(accMap('glasses')), [...ACC, LENS, METAL], { mirror: true, tags: ['glasses', 'smart'] }),
  component('accessory_headphones', 'accessory', 'Наушники', leftHalfKeyFilter(accMap('headphones')), [...ACC], { mirror: true, tags: ['audio'] }),
];

// medal is not in the 30-component MVP (accessory has 3 variants per the ТЗ),
// so it is authored as an *extended* pack entry, flagged accordingly.
const extended = [component('accessory_medal', 'accessory', 'Медаль «Золотой фонда»', accMap('medal'), [...ACC], { tags: ['medal'], })];
extended[0][1].extended = true;

// ---------------------------------------------------------------------------
// File assembly
// ---------------------------------------------------------------------------

const components: Record<string, Comp> = {};
for (const [id, comp] of [...faces, ...eyes, ...mouths, ...hairs, ...hats, ...clothes, ...accessories]) {
  components[id] = comp;
}

const source = {
  format: 1,
  $schema: './pixel-art.schema.json',
  canvas: { width: W, height: H },
  layout: {
    eyes_y: EYES_Y,
    mouth_y: MOUTH_Y,
    symmetry_axis_x: AXIS,
    head: { x: 8, y: 5, w: 16, h: 19 },
  },
  palettes: {
    skin: ['#f7d7b8', '#e8b98f', '#c8956c', '#6b4a34'],
    // fixed values: sclera/pupil never recolour (docs/pixel-art.md §1.4)
    white: ['#ffffff', '#e6e9ef', '#b9c0cc', '#101014'],
    hair: ['#e8c77e', '#a9743a', '#6f4620', '#2c1c10'],
    eyes: ['#d6f2ff', '#4a90c4', '#1f3a52', '#0d1620', '#ff5d5d', '#c23b3b'],
    cloth: ['#c9e4ff', '#5b8ac9', '#33567e', '#1b2b40'],
    hat: ['#f0b6b6', '#c2565a', '#8a3438', '#3c1518'],
    accessory: ['#e6e9ef', '#9aa4b2', '#5d6672', '#232a34'],
    mouth: ['#ffb6b6', '#c86a6a', '#8a3f3f', '#3d1a1a'],
  },
  layer_order: ['face', 'eyes', 'mouth', 'clothing', 'hair', 'hat', 'accessory'],
  components,
  // Extended pack: applied by `pixelgen compile --pack` only (ТЗ §9, этап 5)
  extendedPack: Object.fromEntries(extended),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'components.source.json'), `${JSON.stringify(source, null, 2)}\n`);
const count = Object.keys(components).length;
process.stdout.write(`✓ wrote packages/content/pixel/components.source.json (${count} MVP components + ${extended.length} extended)\n`);
