import { Point, RoomSize, TILE, TileSize, Viewport, tilePolygon, toScreen, wallPolygons } from './geometry';
import { RoomPalette } from './scene';

/**
 * The room shell — floor and the two walls — as flat polygons.
 *
 * Drawn by code rather than shipped as art: the grid has to line up with the
 * sprite placement to the pixel, and every housing level repaints the same
 * geometry with its own palette. Returned as plain data so both the React
 * renderer and the offline preview can draw it.
 */

export interface ShellPoly {
  points: Point[];
  fill: string;
  opacity?: number;
}

export function shellPolygons(
  vp: Viewport,
  size: RoomSize,
  palette: RoomPalette,
  tile: TileSize = TILE
): ShellPoly[] {
  const polys: ShellPoly[] = [];
  const walls = wallPolygons(vp, size, tile);

  // walls first — everything else is in front of them
  polys.push({ points: walls.left, fill: palette.wallLeft });
  polys.push({ points: walls.right, fill: palette.wallRight });

  // a lit strip along the top of each wall: cheap, and it reads as daylight
  const trim = (from: Point, to: Point, thickness = 3): Point[] => [
    from,
    to,
    { x: to.x, y: to.y + thickness },
    { x: from.x, y: from.y + thickness },
  ];
  polys.push({
    points: trim(walls.left[3], walls.left[2]),
    fill: palette.wallTrim,
  });
  polys.push({
    points: trim(walls.right[3], walls.right[2]),
    fill: palette.wallTrim,
  });

  // floor: planks running along the gx axis, two shades alternating per row
  for (let gy = 0; gy < size.d; gy++) {
    for (let gx = 0; gx < size.w; gx++) {
      polys.push({
        points: tilePolygon(vp, gx, gy, tile),
        fill: (gx + gy) % 2 === 0 ? palette.floorA : palette.floorB,
      });
    }
  }

  // seams: one thin line per plank row, drawn as a squashed diamond edge
  for (let gy = 1; gy < size.d; gy++) {
    const from = toScreen(vp, 0, gy, tile);
    const to = toScreen(vp, size.w, gy, tile);
    polys.push({
      points: [from, to, { x: to.x, y: to.y + 1 }, { x: from.x, y: from.y + 1 }],
      fill: palette.floorLine,
      opacity: 0.5,
    });
  }
  for (let gx = 1; gx < size.w; gx++) {
    const from = toScreen(vp, gx, 0, tile);
    const to = toScreen(vp, gx, size.d, tile);
    polys.push({
      points: [from, to, { x: to.x, y: to.y + 1 }, { x: from.x, y: from.y + 1 }],
      fill: palette.floorLine,
      opacity: 0.35,
    });
  }

  // skirting board where the walls meet the floor
  const skirt = (from: Point, to: Point): Point[] => [
    { x: from.x, y: from.y - 4 },
    { x: to.x, y: to.y - 4 },
    to,
    from,
  ];
  polys.push({
    points: skirt(toScreen(vp, 0, 0, tile), toScreen(vp, 0, size.d, tile)),
    fill: palette.skirting,
  });
  polys.push({
    points: skirt(toScreen(vp, 0, 0, tile), toScreen(vp, size.w, 0, tile)),
    fill: palette.skirting,
  });

  return polys;
}

export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
