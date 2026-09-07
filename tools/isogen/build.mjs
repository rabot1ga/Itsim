/**
 * isogen · build
 *
 * Turns the sliced sheets into game-ready sprites:
 *   1. removes the magenta fringe the keying leaves behind,
 *   2. trims to the real bounding box,
 *   3. scales to the tile grid with a nearest-neighbour kernel (a 2×3 bed is
 *      exactly (2+3)×16 pixels wide, so nothing has to be nudged by hand),
 *   4. quantises to a small palette so the whole room shares one look,
 *   5. writes `packages/client/public/iso/<id>.png` and a manifest the
 *      renderer reads (size, footprint, kind).
 *
 * Usage: node tools/isogen/build.mjs [slicesDir]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SLICES = process.argv[2] ?? path.join(HERE, 'slices');
const OUT = path.resolve(HERE, '../../packages/client/public/iso');
const catalogue = JSON.parse(fs.readFileSync(path.join(HERE, 'catalogue.json'), 'utf8'));
const { w: TW, h: TH } = catalogue.tile;

fs.mkdirSync(OUT, { recursive: true });

/** Magenta halo killer: kill pixels that are still mostly magenta after keying. */
async function deFringe(input) {
  const img = sharp(input).ensureAlpha();
  const { width, height } = await img.metadata();
  const buf = await img.raw().toBuffer();
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (buf[i + 3] === 0) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const magenta = r > 110 && b > 110 && g < Math.min(r, b) * 0.72;
    if (magenta) buf[i + 3] = 0;
  }
  // erode one pixel: any opaque pixel with a transparent 4-neighbour that is
  // also close to the fringe colour gets dropped, killing the last purple rim
  const alpha = Buffer.from(buf);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (alpha[i + 3] === 0) continue;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const pinkish = r > 90 && b > 90 && g < Math.min(r, b) * 0.85;
      if (!pinkish) continue;
      const edge =
        (x > 0 && alpha[i - 4 + 3] === 0) ||
        (x < width - 1 && alpha[i + 4 + 3] === 0) ||
        (y > 0 && alpha[i - width * 4 + 3] === 0) ||
        (y < height - 1 && alpha[i + width * 4 + 3] === 0);
      if (edge) buf[i + 3] = 0;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const manifest = { tile: catalogue.tile, sprites: {} };

for (const entry of catalogue.sprites) {
  const src = path.join(SLICES, `${entry.slice}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`! missing slice ${entry.slice}`);
    continue;
  }

  const cleaned = await deFringe(src);
  const trimmed = await sharp(cleaned).trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();

  // target width: floor items follow their footprint diamond, wall items the
  // wall run they cover, characters are sized by height instead.
  const scale = entry.scale ?? 1;
  let targetW;
  if (entry.kind === 'wall') targetW = Math.round(entry.tilesW * TW * scale);
  else if (entry.kind === 'char') targetW = Math.round((entry.heightPx * meta.width) / meta.height);
  else targetW = Math.round((entry.tiles[0] + entry.tiles[1]) * (TW / 2) * scale);

  let targetH = Math.max(1, Math.round((targetW * meta.height) / meta.width));

  // Nothing on a wall may be taller than the wall itself.
  const wallLimit = catalogue.tile.wallH - 10;
  if (entry.kind === 'wall' && targetH > wallLimit) {
    targetW = Math.max(1, Math.round((targetW * wallLimit) / targetH));
    targetH = wallLimit;
  }
  // Floor pieces stay below eye level: three tiles of height is the ceiling.
  const floorLimit = Math.round(((entry.tiles?.[0] ?? 1) + (entry.tiles?.[1] ?? 1)) * TH * 1.6 + 18);
  if ((entry.kind ?? 'floor') === 'floor' && targetH > floorLimit) {
    targetW = Math.max(1, Math.round((targetW * floorLimit) / targetH));
    targetH = floorLimit;
  }

  const out = await sharp(trimmed)
    .resize(targetW, targetH, { kernel: 'nearest', fit: 'fill' })
    .png({ palette: true, colours: 48, dither: 0, compressionLevel: 9 })
    .toBuffer();

  const file = `${entry.id}.png`;
  fs.writeFileSync(path.join(OUT, file), out);
  manifest.sprites[entry.id] = {
    file: `/iso/${file}`,
    w: targetW,
    h: targetH,
    kind: entry.kind ?? 'floor',
    ...(entry.tiles ? { tiles: entry.tiles } : {}),
    ...(entry.tilesW ? { tilesW: entry.tilesW } : {}),
  };
  console.log(`${entry.id.padEnd(16)} ${targetW}×${targetH}`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest.sprites).length} sprites → ${OUT}`);
