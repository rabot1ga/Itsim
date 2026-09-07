/**
 * Isometric room geometry — pure math, no DOM.
 *
 * The room is a grid of `w × d` floor tiles drawn in 2:1 dimetric projection
 * (a tile is 32×16 px at 1×). Grid axis `gx` runs down-right, `gy` runs
 * down-left, so the back corner of the room is (0, 0).
 *
 * Everything here is deliberately framework-free: the React canvas renderer and
 * the offline preview tool (tools/isogen/preview.ts) share the exact same math,
 * so what we review in a PNG is what the player sees.
 */

export interface TileSize {
  w: number;
  h: number;
  wallH: number;
}

export const TILE: TileSize = { w: 32, h: 16, wallH: 72 };

/** Pixel margin around the room box inside the canvas. */
export const MARGIN = { x: 6, top: 10, bottom: 8 };

export interface RoomSize {
  /** floor tiles along the down-right axis */
  w: number;
  /** floor tiles along the down-left axis */
  d: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** screen position of grid point (0, 0) — the back corner of the floor */
  origin: Point;
}

/** Canvas size and origin for a room of the given tile size. */
export function viewport(size: RoomSize, tile: TileSize = TILE): Viewport {
  const width = (size.w + size.d) * (tile.w / 2) + MARGIN.x * 2;
  const height = (size.w + size.d) * (tile.h / 2) + tile.wallH + MARGIN.top + MARGIN.bottom;
  return {
    width,
    height,
    origin: { x: MARGIN.x + size.d * (tile.w / 2), y: MARGIN.top + tile.wallH },
  };
}

/** Grid point (can be fractional) → screen pixel. */
export function toScreen(vp: Viewport, gx: number, gy: number, tile: TileSize = TILE): Point {
  return {
    x: vp.origin.x + (gx - gy) * (tile.w / 2),
    y: vp.origin.y + (gx + gy) * (tile.h / 2),
  };
}

/** The four corners of one floor tile, clockwise from the top. */
export function tilePolygon(vp: Viewport, gx: number, gy: number, tile: TileSize = TILE): Point[] {
  return [
    toScreen(vp, gx, gy, tile),
    toScreen(vp, gx + 1, gy, tile),
    toScreen(vp, gx + 1, gy + 1, tile),
    toScreen(vp, gx, gy + 1, tile),
  ];
}

/**
 * Wall quads. `right` is the wall behind the +gx axis, `left` the one behind
 * +gy — the two faces you see in a cutaway room.
 */
export function wallPolygons(vp: Viewport, size: RoomSize, tile: TileSize = TILE) {
  const h = tile.wallH;
  const lift = (p: Point): Point => ({ x: p.x, y: p.y - h });

  const rightBottom = [toScreen(vp, 0, 0, tile), toScreen(vp, size.w, 0, tile)];
  const leftBottom = [toScreen(vp, 0, 0, tile), toScreen(vp, 0, size.d, tile)];

  return {
    right: [rightBottom[0], rightBottom[1], lift(rightBottom[1]), lift(rightBottom[0])],
    left: [leftBottom[0], leftBottom[1], lift(leftBottom[1]), lift(leftBottom[0])],
  };
}

export type WallSide = 'left' | 'right';

/**
 * A point on a wall: `along` tiles from the back corner, `up` pixels from the
 * floor line.
 */
export function wallPoint(
  vp: Viewport,
  side: WallSide,
  along: number,
  up: number,
  tile: TileSize = TILE
): Point {
  const p = side === 'right' ? toScreen(vp, along, 0, tile) : toScreen(vp, 0, along, tile);
  return { x: p.x, y: p.y - up };
}

export interface SpriteMeta {
  file: string;
  w: number;
  h: number;
  kind: 'floor' | 'wall' | 'char' | 'flat';
  tiles?: [number, number];
  tilesW?: number;
}

export interface PlacedFloorItem {
  kind: 'floor' | 'flat' | 'char';
  sprite: string;
  gx: number;
  gy: number;
  /** footprint, defaults to the sprite's own */
  tiles?: [number, number];
  flip?: boolean;
  /** lift the sprite off the floor (e.g. something standing on a desk) */
  lift?: number;
}

export interface PlacedWallItem {
  kind: 'wall';
  sprite: string;
  side: WallSide;
  along: number;
  /** pixels between the wall top and the sprite top */
  top: number;
  flip?: boolean;
}

export type PlacedItem = PlacedFloorItem | PlacedWallItem;

export interface DrawCall {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  /** painter's order: bigger is drawn later */
  depth: number;
}

/**
 * Turn placed items into draw calls in painter's order.
 *
 * Floor items are anchored by the front corner of their footprint: the sprite's
 * bottom edge sits on it and its centre lines up with the footprint centre.
 * Wall items hang from the wall plane at their `along`/`top` offset.
 */
export function layout(
  vp: Viewport,
  items: PlacedItem[],
  sprites: Record<string, SpriteMeta>,
  tile: TileSize = TILE
): DrawCall[] {
  const calls: DrawCall[] = [];

  for (const item of items) {
    const meta = sprites[item.sprite];
    if (!meta) continue;

    if (item.kind === 'wall') {
      const tilesW = meta.tilesW ?? 1;
      const centre = wallPoint(vp, item.side, item.along + tilesW / 2, tile.wallH, tile);
      calls.push({
        sprite: item.sprite,
        x: Math.round(centre.x - meta.w / 2),
        y: Math.round(centre.y + item.top),
        w: meta.w,
        h: meta.h,
        flip: item.flip ?? item.side === 'left',
        // walls are always behind everything standing on the floor
        depth: -1000 + item.along,
      });
      continue;
    }

    const [fw, fd] = item.tiles ?? meta.tiles ?? [1, 1];
    const centreX = toScreen(vp, item.gx + fw / 2, item.gy + fd / 2, tile).x;
    const front = toScreen(vp, item.gx + fw, item.gy + fd, tile).y;
    calls.push({
      sprite: item.sprite,
      x: Math.round(centreX - meta.w / 2),
      y: Math.round(front - meta.h - (item.lift ?? 0)),
      w: meta.w,
      h: meta.h,
      flip: item.flip ?? false,
      depth: item.gx + fw + item.gy + fd + (item.kind === 'flat' ? -0.5 : 0),
    });
  }

  return calls.sort((a, b) => a.depth - b.depth);
}
