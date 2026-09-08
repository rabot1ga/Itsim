/**
 * isogen · slice
 *
 * Cuts an AI-generated sprite sheet into individual sprites:
 *   1. keys out the flat background colour (sampled from the corners),
 *   2. finds connected blobs of remaining pixels,
 *   3. drops specks, merges blobs that overlap on the x axis (a lamp is one
 *      object even when its shade does not touch its base),
 *   4. writes each sprite as a trimmed RGBA png plus a labelled contact sheet
 *      so a human can name them.
 *
 * Usage: node tools/isogen/slice.mjs <sheet.png> <outDir> [--tol 70] [--min 900] [--gap 14]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [, , sheetPath, outDir, ...rest] = process.argv;
const arg = (name, dflt) => {
  const i = rest.indexOf('--' + name);
  return i === -1 ? dflt : Number(rest[i + 1]);
};
const TOL = arg('tol', 70);
const MIN_AREA = arg('min', 900);
const GAP = arg('gap', 14);

fs.mkdirSync(outDir, { recursive: true });

const img = sharp(sheetPath).ensureAlpha();
const { width: W, height: H } = await img.metadata();
const { data } = await img.raw().toBuffer({ resolveWithObject: true });

// background = the most common colour among the four corners
const corner = (x, y) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};
const bg = corner(2, 2);
const isBg = (i) => {
  const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) < TOL;
};

// label connected components (4-neighbour flood fill over an explicit stack)
const label = new Int32Array(W * H).fill(-1);
const boxes = [];
for (let p = 0; p < W * H; p++) {
  if (label[p] !== -1 || isBg(p * 4)) continue;
  const id = boxes.length;
  const box = { x0: W, y0: H, x1: 0, y1: 0, area: 0 };
  const stack = [p];
  label[p] = id;
  while (stack.length) {
    const q = stack.pop();
    const x = q % W, y = (q / W) | 0;
    box.area++;
    if (x < box.x0) box.x0 = x;
    if (x > box.x1) box.x1 = x;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
    const push = (n) => {
      if (n >= 0 && n < W * H && label[n] === -1 && !isBg(n * 4)) {
        label[n] = id;
        stack.push(n);
      }
    };
    if (x > 0) push(q - 1);
    if (x < W - 1) push(q + 1);
    if (y > 0) push(q - W);
    if (y < H - 1) push(q + W);
  }
  boxes.push(box);
}

// keep real objects, then merge vertically stacked parts of the same object
const objs = boxes.filter((b) => b.area >= MIN_AREA);
let merged = true;
while (merged) {
  merged = false;
  outer: for (let i = 0; i < objs.length; i++) {
    for (let j = i + 1; j < objs.length; j++) {
      const a = objs[i], b = objs[j];
      const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
      const near = overlapX > 0.4 * Math.min(a.x1 - a.x0, b.x1 - b.x0) && gapY < GAP;
      if (near) {
        objs[i] = {
          x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
          area: a.area + b.area,
        };
        objs.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
}

// reading order: rows top→bottom, then left→right inside a row
objs.sort((a, b) => (Math.abs(a.y0 - b.y0) > 80 ? a.y0 - b.y0 : a.x0 - b.x0));

// cut out each sprite with the background turned transparent
const base = path.basename(sheetPath, '.png');
const cells = [];
for (let i = 0; i < objs.length; i++) {
  const o = objs[i];
  const w = o.x1 - o.x0 + 1, h = o.y1 - o.y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((o.y0 + y) * W + (o.x0 + x)) * 4;
      const dst = (y * w + x) * 4;
      const transparent = isBg(src);
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = transparent ? 0 : 255;
    }
  }
  const file = path.join(outDir, `${base}_${String(i).padStart(2, '0')}.png`);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
  cells.push({ index: i, file, width: w, height: h });
}

fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(cells, null, 2));
console.log(`${base}: ${cells.length} sprites`);
