import { Point, RoomSize, TILE, TileSize, Viewport, tilePolygon, toScreen, wallPolygons } from './geometry';
import { RoomPalette } from './scene';

/**
 * The room shell — floor and the two walls — as flat polygons.
 *
 * Drawn by code rather than shipped as art: the grid has to line up with the
 * sprite placement to the pixel, and every flat repaints the same geometry with
 * its own finishes. Returned as plain data so both the React renderer and the
 * offline preview can draw it.
 */

export interface ShellPoly {
  points: Point[];
  fill: string;
  opacity?: number;
}

/** Cheap deterministic noise so a floor varies without looking random. */
function jitter(gx: number, gy: number, salt: number): number {
  const n = Math.sin(gx * 127.1 + gy * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function shellPolygons(
  vp: Viewport,
  size: RoomSize,
  palette: RoomPalette,
  tile: TileSize = TILE
): ShellPoly[] {
  const polys: ShellPoly[] = [];
  const walls = wallPolygons(vp, size, tile);
  const pattern = palette.floorPattern ?? 'tiles';

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
  polys.push({ points: trim(walls.left[3], walls.left[2]), fill: palette.wallTrim });
  polys.push({ points: trim(walls.right[3], walls.right[2]), fill: palette.wallTrim });

  // floor
  for (let gy = 0; gy < size.d; gy++) {
    for (let gx = 0; gx < size.w; gx++) {
      let fill: string;
      switch (pattern) {
        case 'planks':
          // boards run along gx: the whole row shares a shade
          fill = jitter(0, gy, 3) > 0.5 ? palette.floorA : palette.floorB;
          break;
        case 'tiles':
          fill = (gx + gy) % 2 === 0 ? palette.floorA : palette.floorB;
          break;
        case 'carpet':
          fill = jitter(gx, gy, 7) > 0.75 ? palette.floorB : palette.floorA;
          break;
        default: // concrete: mostly flat with the odd patch
          fill = jitter(gx, gy, 11) > 0.88 ? palette.floorB : palette.floorA;
      }
      polys.push({ points: tilePolygon(vp, gx, gy, tile), fill });
    }
  }

  // seams — planks show board joints one way, tiles show a full grid, carpet
  // and concrete show nothing at all
  const seamAlong = (gy: number, opacity: number) => {
    const from = toScreen(vp, 0, gy, tile);
    const to = toScreen(vp, size.w, gy, tile);
    polys.push({
      points: [from, to, { x: to.x, y: to.y + 1 }, { x: from.x, y: from.y + 1 }],
      fill: palette.floorLine,
      opacity,
    });
  };
  const seamAcross = (gx: number, opacity: number) => {
    const from = toScreen(vp, gx, 0, tile);
    const to = toScreen(vp, gx, size.d, tile);
    polys.push({
      points: [from, to, { x: to.x, y: to.y + 1 }, { x: from.x, y: from.y + 1 }],
      fill: palette.floorLine,
      opacity,
    });
  };

  if (pattern === 'planks') {
    for (let gy = 1; gy < size.d; gy++) seamAlong(gy, 0.55);
    // short butt joints, staggered per row, so boards do not look endless
    for (let gy = 0; gy < size.d; gy++) {
      const gx = 1 + Math.floor(jitter(gy, 2, 5) * (size.w - 1));
      const from = toScreen(vp, gx, gy, tile);
      const to = toScreen(vp, gx, gy + 1, tile);
      polys.push({
        points: [from, to, { x: to.x + 1, y: to.y }, { x: from.x + 1, y: from.y }],
        fill: palette.floorLine,
        opacity: 0.4,
      });
    }
  } else if (pattern === 'tiles') {
    for (let gy = 1; gy < size.d; gy++) seamAlong(gy, 0.4);
    for (let gx = 1; gx < size.w; gx++) seamAcross(gx, 0.3);
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
