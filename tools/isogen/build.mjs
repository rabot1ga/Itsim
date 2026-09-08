/**
 * isogen · build
 *
 * Turns the sliced sheets into game-ready sprites:
 *   1. removes the magenta fringe the keying leaves behind,
 *   2. trims to the real bounding box,
 *   3. scales to the tile grid (a 2×3 bed is exactly (2+3)×(TW/2) pixels wide,
 *      so nothing has to be nudged by hand) — with a Lanczos kernel, because
 *      dropping 4 of every 5 source pixels shreds outlines and eyes,
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
/** authoring unit: sizes in catalogue.json are written against a 32px tile */
const K = TW / 32;

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
 * Which wall is this sprite drawn for?
 *
 * A picture hanging on the right-hand wall has horizontal edges running down
 * to the right; on the left-hand wall they run down to the left. The sheets
 * come back with both orientations mixed, and hanging a right-facing window on
 * the left wall is exactly what makes it look like it is stuck to the wall
 * edge-on. So measure it: fit a line through the sprite's top edge and read the
 * sign of its slope. Near-flat art (a poster drawn head-on) is reported as
 * `flat`, and the renderer shears it into whichever wall plane it lands on.
 */
async function wallFace(buf) {
  const img = sharp(buf).ensureAlpha();
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();

  const tops = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (raw[(y * width + x) * 4 + 3] > 200) {
        tops.push([x, y]);
        break;
      }
    }
  }
  // ignore the outer eighth: curtains, aerials and hanging cables live there
  const pad = Math.round(width / 8);
  const pts = tops.filter(([x]) => x >= pad && x <= width - pad);
  if (pts.length < 6) return 'flat';

  // median of pairwise slopes — robust against one tall spike in the middle
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 4; j < pts.length; j += 3) {
      slopes.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]));
    }
  }
  slopes.sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)];
  if (slope > 0.18) return 'right';
  if (slope < -0.18) return 'left';
  return 'flat';
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

  // Four bands down the sprite: head, torso, legs, feet. A colour belongs to a
  // role only if most of its pixels live in one band — colours smeared across
  // the whole figure are outlines and shadows, and repainting those ruins the
  // drawing.
  const bandOf = (t) => (t < 0.35 ? 0 : t < 0.66 ? 1 : t < 0.88 ? 2 : 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (raw[i + 3] < 200) continue;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 24) continue; // the black outline itself, never recoloured
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const st = stats.get(hex) ?? { n: 0, sy: 0, bands: [0, 0, 0, 0], r, g, b, lum };
      st.n++;
      st.sy += y / height;
      st.bands[bandOf(y / height)]++;
      stats.set(hex, st);
    }
  }

  const total = [...stats.values()].reduce((a, s) => a + s.n, 0) || 1;
  const colours = [...stats.entries()]
    .map(([hex, s]) => {
      const top = s.bands.indexOf(Math.max(...s.bands));
      return { hex, share: s.n / total, band: top, focus: s.bands[top] / s.n, y: s.sy / s.n, ...s };
    })
    .filter((c) => c.share > 0.004);

  const isSkin = (c) => {
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    if (max < 90 || max - min < 12) return false;
    if (!(c.r > c.g && c.g >= c.b)) return false;
    const hue = (60 * (c.g - c.b)) / (max - min);
    return hue >= 8 && hue <= 48 && c.r - c.b > 18 && c.r - c.b < 130;
  };

  const roles = {};
  const push = (role, c) => (roles[role] ??= []).push(c);
  const BY_BAND = ['hair', 'top', 'bottom', 'shoes'];

  if (kind === 'char') {
    // Brown hair shares a hue with skin. Tell them apart by where they sit:
    // hair caps the head and is darker than the face it frames.
    const skinLike = colours.filter(isSkin);
    const brightestSkin = Math.max(0, ...skinLike.map((c) => c.lum));
    const isHairNotSkin = (c) => c.y < 0.22 && c.lum < brightestSkin * 0.72;

    // A beige jumper is also "skin-coloured". Hands are small, so a skin hue
    // that owns a chunk of the torso is cloth.
    const isClothNotSkin = (c) => c.band === 1 && c.share > 0.055;

    for (const c of colours) {
      if (isSkin(c) && !isHairNotSkin(c) && !isClothNotSkin(c)) {
        push('skin', c);
        continue;
      }
      if (isSkin(c) && isClothNotSkin(c)) {
        push('top', c);
        continue;
      }
      if (isSkin(c)) {
        push('hair', c);
        continue;
      }
      // structural colours (outline shading, dither) span bands: leave them
      if (c.focus < 0.6) continue;
      push(BY_BAND[c.band], c);
    }
  } else {
    // creatures: every lit colour is coat, so one recolour swaps the whole animal
    for (const c of colours) push('coat', c);
  }

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
  else if (entry.kind === 'char') targetW = Math.round((entry.heightPx * K * meta.width) / meta.height);
  else targetW = Math.round((entry.tiles[0] + entry.tiles[1]) * (TW / 2) * scale);

  let targetH = Math.max(1, Math.round((targetW * meta.height) / meta.width));

  // Nothing on a wall may be taller than the wall itself.
  const wallLimit = catalogue.tile.wallH - 10;
  if (entry.kind === 'wall' && targetH > wallLimit) {
    targetW = Math.max(1, Math.round((targetW * wallLimit) / targetH));
    targetH = wallLimit;
  }
  // Floor pieces stay below eye level: three tiles of height is the ceiling.
  const floorLimit = Math.round(((entry.tiles?.[0] ?? 1) + (entry.tiles?.[1] ?? 1)) * TH * 1.6 + 18 * K);
  if ((entry.kind ?? 'floor') === 'floor' && targetH > floorLimit) {
    targetW = Math.max(1, Math.round((targetW * floorLimit) / targetH));
    targetH = floorLimit;
  }

  // Lanczos keeps the drawing readable at 1/3 of its size; the palette pass
  // right after snaps the softened edges back onto a pixel-art ramp.
  const out = await sharp(trimmed)
    .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
    .png({ palette: true, colours: 64, dither: 0, compressionLevel: 9 })
    .toBuffer();

  const roles = entry.roles ? await colourRoles(out, entry.kind ?? 'floor') : null;
  const face = entry.kind === 'wall' ? entry.face ?? (await wallFace(out)) : null;

  const file = `${entry.id}.png`;
  fs.writeFileSync(path.join(OUT, file), out);
  manifest.sprites[entry.id] = {
    file: `/iso/${file}`,
    w: targetW,
    h: targetH,
    kind: entry.kind ?? 'floor',
    ...(entry.tiles ? { tiles: entry.tiles } : {}),
    ...(entry.tilesW ? { tilesW: entry.tilesW } : {}),
    ...(face ? { face } : {}),
    ...(roles ? { roles } : {}),
  };
  console.log(`${entry.id.padEnd(16)} ${String(targetW).padStart(3)}×${String(targetH).padStart(3)}${face ? `  face:${face}` : ''}`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest.sprites).length} sprites → ${OUT}`);
