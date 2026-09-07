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

/**
 * Colour roles for recolouring.
 *
 * A character sprite is just pixels, but the recolour engine needs to know
 * which of those pixels are hair and which are trousers. Rather than hand-mask
 * 19 sprites, classify the shipped palette: skin is found by hue, the rest is
 * split by how high up the sprite each colour sits (hair on top, shoes at the
 * bottom). Each role comes out as a shading ramp sorted dark → light, which is
 * exactly what the runtime needs to map onto a new colour.
 */
async function colourRoles(buf, kind) {
  const img = sharp(buf).ensureAlpha();
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();
  const stats = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (raw[i + 3] < 200) continue;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 40) continue; // outline, never recoloured
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const st = stats.get(hex) ?? { n: 0, sy: 0, ymax: 0, r, g, b, lum };
      st.n++;
      st.sy += y / height;
      st.ymax = Math.max(st.ymax, y / height);
      stats.set(hex, st);
    }
  }

  const total = [...stats.values()].reduce((a, s) => a + s.n, 0) || 1;
  const colours = [...stats.entries()]
    .map(([hex, s]) => ({ hex, share: s.n / total, y: s.sy / s.n, ...s }))
    .filter((c) => c.share > 0.004);

  const isSkin = (c) => {
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max < 90 || max - min < 12) return false;
    if (!(c.r > c.g && c.g >= c.b)) return false;
    const hue = (60 * (c.g - c.b)) / (max - min);
    return hue >= 8 && hue <= 48 && c.r - c.b > 18 && c.r - c.b < 130 && c.y < 0.45;
  };

  const roles = {};
  const push = (role, c) => (roles[role] ??= []).push(c);

  if (kind === 'char') {
    for (const c of colours) {
      // A hood or a collar also sits high on the sprite, so height alone is not
      // enough: anything that covers a lot of the figure is clothing, not hair.
      // These sprites are ~3 heads tall, so the head owns the top 40% of the
      // frame. Only what sits below it can be clothing; the band in between is
      // left alone (faces, beards, glasses keep their own colours).
      if (isSkin(c)) push('skin', c);
      else if (c.y < 0.22 && c.ymax < 0.36 && c.share < 0.2) push('hair', c);
      else if (c.y >= 0.4 && c.y < 0.66) push('top', c);
      else if (c.y >= 0.66 && c.y < 0.88) push('bottom', c);
      else if (c.y >= 0.88) push('shoes', c);
    }
  } else {
    // creatures: every lit colour is coat, so one recolour swaps the whole animal
    for (const c of colours) push('coat', c);
  }

  // A one-colour "hair" ramp is almost always a rim light picked up around a
  // dark hairstyle — recolouring it paints the head. Leave those alone.
  if (kind === 'char' && (roles.hair?.length ?? 0) < 2) delete roles.hair;

  for (const role of Object.keys(roles)) {
    roles[role] = roles[role].sort((a, b) => a.lum - b.lum).map((c) => c.hex);
  }
  return roles;
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

  const roles = entry.roles ? await colourRoles(out, entry.kind ?? 'floor') : null;

  const file = `${entry.id}.png`;
  fs.writeFileSync(path.join(OUT, file), out);
  manifest.sprites[entry.id] = {
    file: `/iso/${file}`,
    w: targetW,
    h: targetH,
    kind: entry.kind ?? 'floor',
    ...(entry.tiles ? { tiles: entry.tiles } : {}),
    ...(entry.tilesW ? { tilesW: entry.tilesW } : {}),
    ...(roles ? { roles } : {}),
  };
  console.log(`${entry.id.padEnd(16)} ${targetW}×${targetH}`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest.sprites).length} sprites → ${OUT}`);
