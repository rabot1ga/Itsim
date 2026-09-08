import { PlacedItem, RoomSize, SpriteMeta, TILE, TileSize } from './geometry';

/**
 * Floor allocator with occlusion.
 *
 * Furnishing a room is a packing problem with a twist: in an isometric view a
 * tall object does not only take its own tile, it *hides* the tiles diagonally
 * behind it. A monstera dropped in front of the player covers her to the waist;
 * a wardrobe swallows whatever ends up behind it. Reserving only the footprint
 * is what makes generated rooms look like a pile of stickers.
 *
 * So every cell has two flags: `taken` (something stands here) and `hidden`
 * (something in front would cover anything standing here). An item may only be
 * placed where both are clear, and placing it marks the cells it eclipses. The
 * cost of hiding is read straight from the art: a sprite taller than its own
 * footprint diamond rises over the floor behind it, one grid step per tile
 * height.
 */

export interface Allocator {
  size: RoomSize;
  taken: boolean[];
  hidden: boolean[];
  items: PlacedItem[];
  sprites: Record<string, SpriteMeta>;
  tile: TileSize;
}

export function allocator(
  size: RoomSize,
  sprites: Record<string, SpriteMeta> = {},
  tile: TileSize = TILE
): Allocator {
  return {
    size,
    taken: new Array(size.w * size.d).fill(false),
    hidden: new Array(size.w * size.d).fill(false),
    items: [],
    sprites,
    tile,
  };
}

/** How many diagonal steps behind itself this sprite covers. */
export function hidesRows(a: Allocator, sprite: string, tiles?: [number, number]): number {
  const meta = a.sprites[sprite];
  if (!meta) return 0;
  const [fw, fd] = tiles ?? meta.tiles ?? [1, 1];
  // the footprint's own diamond is this tall on screen; anything above it
  // sticks up over the floor behind
  const own = (fw + fd) * (a.tile.h / 2);
  return Math.max(0, Math.floor((meta.h - own) / a.tile.h));
}

function inside(a: Allocator, gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < a.size.w && gy < a.size.d;
}

/** A free cell is empty, unhidden and inside the room. */
export function free(a: Allocator, gx: number, gy: number, w = 1, d = 1): boolean {
  if (gx < 0 || gy < 0 || gx + w > a.size.w || gy + d > a.size.d) return false;
  for (let x = gx; x < gx + w; x++) {
    for (let y = gy; y < gy + d; y++) {
      const i = y * a.size.w + x;
      if (a.taken[i] || a.hidden[i]) return false;
    }
  }
  return true;
}

export function occupy(a: Allocator, gx: number, gy: number, w = 1, d = 1): void {
  for (let x = gx; x < gx + w; x++) {
    for (let y = gy; y < gy + d; y++) a.taken[y * a.size.w + x] = true;
  }
}

/** Walk the cells this sprite would eclipse, if it stood at (gx, gy). */
function eclipsed(
  a: Allocator,
  sprite: string,
  gx: number,
  gy: number,
  tiles: [number, number],
  visit: (x: number, y: number) => void
): void {
  const rows = hidesRows(a, sprite, tiles);
  for (let step = 1; step <= rows; step++) {
    for (let x = gx - step; x < gx + tiles[0] - step; x++) {
      for (let y = gy - step; y < gy + tiles[1] - step; y++) {
        if (inside(a, x, y)) visit(x, y);
      }
    }
  }
}

/** Nothing already stands in the cells this sprite would cover. */
export function shadowClear(
  a: Allocator,
  sprite: string,
  gx: number,
  gy: number,
  tiles: [number, number]
): boolean {
  let ok = true;
  eclipsed(a, sprite, gx, gy, tiles, (x, y) => {
    if (a.taken[y * a.size.w + x]) ok = false;
  });
  return ok;
}

function markShadow(
  a: Allocator,
  sprite: string,
  gx: number,
  gy: number,
  tiles: [number, number]
): void {
  eclipsed(a, sprite, gx, gy, tiles, (x, y) => {
    a.hidden[y * a.size.w + x] = true;
  });
}

/**
 * Put a sprite on the first cell out of the preferred ones where it neither
 * lands on something nor covers it.
 */
export function place(
  a: Allocator,
  sprite: string,
  tiles: [number, number],
  candidates: Array<[number, number]>,
  extra: Partial<PlacedItem> = {}
): boolean {
  for (const [gx, gy] of candidates) {
    if (!free(a, gx, gy, tiles[0], tiles[1])) continue;
    if (!shadowClear(a, sprite, gx, gy, tiles)) continue;
    occupy(a, gx, gy, tiles[0], tiles[1]);
    markShadow(a, sprite, gx, gy, tiles);
    a.items.push({ kind: 'floor', sprite, gx, gy, tiles, ...extra } as PlacedItem);
    return true;
  }
  return false;
}

/**
 * A cell for someone to stand in: free, unhidden, and as close to the wanted
 * spot as the furniture allows. Searched front-to-back, because a person is
 * the subject of the picture and belongs in the open part of the room.
 */
export function standingSpot(a: Allocator, want: [number, number]): [number, number] {
  let best: [number, number] = want;
  let bestScore = Infinity;
  for (let gy = a.size.d - 1; gy >= 0; gy--) {
    for (let gx = 0; gx < a.size.w; gx++) {
      if (!free(a, gx, gy)) continue;
      const score = Math.abs(gx - want[0]) + Math.abs(gy - want[1]);
      if (score < bestScore) {
        bestScore = score;
        best = [gx, gy];
      }
    }
  }
  return best;
}
