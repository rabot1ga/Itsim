#!/usr/bin/env node
/**
 * Avatar-layer assembly tool (avatar layers v2, story-v1 art style).
 *
 * Pipeline per layer:
 *   key   — chroma-key the flat magenta backdrop out, auto-crop the content
 *   place — scale the cropped content into slot bounding-box and blit onto the
 *           500×760 transparent canvas the manifest declares
 *
 * Slot boxes are fractions measured against the assembled BODY layer, so the
 * whole set stays internally consistent; tweak once here, not per image.
 *
 * Usage:
 *   node tools/art/avatar-key.mjs key    <in.png> <out.png>            → alpha+crop
 *   node tools/art/avatar-key.mjs body   <in.png> <out.webp>           → key+grayscale+canvas
 *   node tools/art/avatar-key.mjs layer  <in.png> <slotKey> <out.webp> → key+fit+anchor
 *   node tools/art/avatar-key.mjs demo   <file.webp>...                → composite preview png
 */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';

const MAGENTA = { r: 255, g: 0, b: 255 };
const TOL = 42; // chroma tolerance
const EDGE_DILATE = 1; // expand transparency outward by N px to bleed off AA halos

const CANVAS_W = 500;
const CANVAS_H = 760;

/** Canvas-absolute placement spec, recalibrated off body_base bbox 72..427×30..729.
 *  Body anatomy (canvas px):
 *    crown y≈30   hairline y≈55   eye line y≈101   nose tip y≈130
 *    mouth y≈150  chin y≈170      neck y≈178      shoulders y≈188
 *    chest y≈230  waistband y≈410  crotch y≈470    knees y≈560
 *    ankles/feet bottom y≈729
 */
const SLOTS = {
  // hair: crown-top anchored; long styles flow down; `clear` carves the eye window
  hair: {
    x: 150,
    y: 24,
    w: 200,
    h: 360,
    fit: 'width',
    alignY: 'top',
    clear: { x: 185, y: 82, w: 130, h: 40 },
  },
  // beard: mouth-to-chin region (upper lip 148 → chin 180)
  beard: { x: 195, y: 145, w: 110, h: 45, fit: 'width', alignY: 'top' },
  // eyes: small pair on the eye line y≈101
  eyes: { x: 180, y: 83, w: 140, h: 40, fit: 'width', alignY: 'center' },
  // tops: shoulder-to-hem, hem must OVERLAP the pants waistband by ~20 px
  top: { x: 105, y: 180, w: 290, h: 270, fit: 'box', alignY: 'top' },
  // bottoms: waistband-to-ankles, anchored at the waist; legs extend down to ~y=705
  bottom: { x: 115, y: 405, w: 270, h: 305, fit: 'box', alignY: 'top' },
  // accessory anchors
  acc_head: { x: 150, y: 14, w: 200, h: 80, fit: 'box', alignY: 'bottom' }, // caps/beanie — brim at brow
  acc_face: { x: 170, y: 80, w: 160, h: 50, fit: 'box', alignY: 'center' }, // glasses — eye line
  acc_ears: { x: 140, y: 30, w: 220, h: 150, fit: 'box', alignY: 'top' },   // headphones — arc over crown
  acc_chest: { x: 208, y: 285, w: 84, h: 96, fit: 'box', alignY: 'center' },
};

/** Body fits the canvas: full height minus margin, centered horizontally. */
const BODY = { height: 700, top: 30 };

async function keyImage(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { w: info.width, h: info.height };
  // Pass 1: chroma-key magenta → alpha
  const opaque = new Uint8Array(px.w * px.h);
  let keyed = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.max(Math.abs(r - MAGENTA.r), Math.abs(g - MAGENTA.g), Math.abs(b - MAGENTA.b));
    if (dist <= TOL) {
      data[i + 3] = 0;
      keyed++;
      opaque[p] = 0;
    } else {
      opaque[p] = 1;
    }
  }
  // Pass 1b: dilate transparency by EDGE_DILATE pixels outward — eats the
  // magenta AA halo that survives a strict chroma key without distorting colors.
  if (EDGE_DILATE > 0) {
    for (let step = 0; step < EDGE_DILATE; step++) {
      const kill = new Uint8Array(px.w * px.h);
      for (let y = 0; y < px.h; y++) {
        for (let x = 0; x < px.w; x++) {
          const p = y * px.w + x;
          if (!opaque[p]) continue;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= px.w || ny >= px.h) { kill[p] = 1; break; }
            if (!opaque[ny * px.w + nx]) { kill[p] = 1; break; }
          }
        }
      }
      for (let p = 0; p < kill.length; p++) if (kill[p]) { opaque[p] = 0; data[p * 4 + 3] = 0; }
    }
  }
  // Pass 2: drop isolated noise pixels (no opaque neighbour in 3×3) — single-pixel
  // magenta spill along an edge would otherwise blow the auto-crop to the full frame.
  const keep = new Uint8Array(px.w * px.h);
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const p = y * px.w + x;
      if (!opaque[p]) continue;
      let has = false;
      for (let dy = -1; dy <= 1 && !has; dy++) {
        for (let dx = -1; dx <= 1 && !has; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= px.w || ny >= px.h) continue;
          if (opaque[ny * px.w + nx]) has = true;
        }
      }
      if (has) keep[p] = 1;
      else data[p * 4 + 3] = 0;
    }
  }
  // Pass 3: connected components — keep only the LARGEST component (the object).
  // Generators sometimes add a tiny watermark/dot in a corner that survives pass 2;
  // that must not define the crop box.
  const comp = new Int32Array(px.w * px.h);
  const sizes = [];
  let cid = 0;
  const stack = [];
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const p = y * px.w + x;
      if (!keep[p] || comp[p] !== 0) continue;
      cid++;
      let size = 0;
      stack.length = 0;
      stack.push(p);
      comp[p] = cid;
      while (stack.length) {
        const q = stack.pop();
        size++;
        const qx = q % px.w, qy = (q - qx) / px.w;
        const neigh = [q - px.w, q + px.w];
        if (qx > 0) neigh.push(q - 1);
        if (qx < px.w - 1) neigh.push(q + 1);
        for (const n of neigh) {
          if (keep[n] && comp[n] === 0) {
            comp[n] = cid;
            stack.push(n);
          }
        }
      }
      sizes.push({ cid, size });
    }
  }
  if (sizes.length === 0) throw new Error('nothing left after chroma-key');
  sizes.sort((a, b) => b.size - a.size);
  // Keep ALL components that are large relative to the biggest — pairs like two eyes,
  // two ear cups of headphones, two lenses of glasses split into separate blobs and
  // must all survive. Tiny specks (noise/watermarks under ~15% of the main piece)
  // are still dropped.
  const mainSize = sizes[0].size;
  const keepCids = new Set(sizes.filter((s) => s.size >= mainSize * 0.15).map((s) => s.cid));
  let minX = px.w, minY = px.h, maxX = 0, maxY = 0;
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const p = y * px.w + x;
      if (!keepCids.has(comp[p])) {
        if (keep[p]) data[p * 4 + 3] = 0;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cropW = maxX - minX + 1, cropH = maxY - minY + 1;
  // Bake the crop into a real PNG buffer: downstream metadata/resize must see
  // the CROPPED image (a raw extract pipeline reports source dims and has
  // dropped alpha for narrow strips — seen on the eyes layer).
  const png = await sharp(data, { raw: { width: px.w, height: px.h, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .png()
    .toBuffer();
  return { img: sharp(png), crop: { x: minX, y: minY, w: cropW, h: cropH }, keyed };
}

/** Remap a keyed image to luminance grayscale (tintable via CSS filters). */
async function toGrayscale(img, lo = 0.36, hi = 0.8) {
  const { data, info } = await img.png().raw().toBuffer({ resolveWithObject: true });
  let minL = 1, maxL = 0;
  const ls = new Float32Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    ls[p] = l;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  const span = Math.max(0.05, maxL - minL);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    const t = (ls[p] - minL) / span;
    const v = Math.round((lo + t * (hi - lo)) * 255);
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/** Fit `img` into slot box, honouring the slot's fit/align rules. */
async function place(img, slot) {
  const meta = await img.metadata();
  const scale = slot.fit === 'width' ? slot.w / meta.width : Math.min(slot.w / meta.width, slot.h / meta.height);
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));
  const resized = await img.resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  const left = Math.round(slot.x + (slot.w - w) / 2);
  const top =
    slot.alignY === 'bottom'
      ? Math.round(slot.y + slot.h - h)
      : slot.alignY === 'top'
        ? Math.round(slot.y)
        : Math.round(slot.y + (slot.h - h) / 2);
  return sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }]);
}

/** Zero alpha inside a slot's `clear` rect (face window for hair fringes). */
async function applyClear(img, slot) {
  if (!slot.clear) return img;
  const { data, info } = await img.png().raw().toBuffer({ resolveWithObject: true });
  const c = slot.clear;
  for (let y = c.y; y < Math.min(info.height, c.y + c.h); y++) {
    for (let x = c.x; x < Math.min(info.width, c.x + c.w); x++) {
      data[(y * info.width + x) * 4 + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function saveWebp(img, out) {
  await mkdir(dirname(out), { recursive: true });
  await img.webp({ quality: 92 }).toFile(out);
  return out;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'key') {
  const [input, out] = args;
  const { img, crop, keyed } = await keyImage(input);
  await img.png().toFile(out);
  console.log(JSON.stringify({ out, crop, keyed }));
} else if (cmd === 'body') {
  const [input, out] = args;
  const { img, crop } = await keyImage(input);
  const scale = BODY.height / crop.h;
  const w = Math.round(crop.w * scale);
  const resized = await (await toGrayscale(img)).resize(w, BODY.height, { kernel: 'nearest' }).png().toBuffer();
  const canvas = sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((CANVAS_W - w) / 2), top: BODY.top }]);
  await saveWebp(canvas, out);
  console.log(JSON.stringify({ out, placed: { w, h: BODY.height, top: BODY.top } }));
} else if (cmd === 'layer') {
  const [input, slotKey, out] = args;
  const slot = SLOTS[slotKey];
  if (!slot) throw new Error(`unknown slot ${slotKey}: ${Object.keys(SLOTS).join(', ')}`);
  const { img, crop } = await keyImage(input);
  const gray = slotKey === 'hair' || slotKey === 'beard' ? await toGrayscale(img) : img;
  const placed = await place(gray, slot);
  await saveWebp(await applyClear(placed, slot), out);
  console.log(JSON.stringify({ out, crop }));
} else if (cmd === 'demo') {
  const layers = [];
  for (const f of args) {
    const buf = await readFile(f);
    layers.push({ input: buf, name: basename(f) });
  }
  const img = sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0x22, g: 0x22, b: 0x2e, alpha: 1 } } })
    .composite(layers.map((l) => ({ input: l.input })));
  const out = '/tmp/demo-composite.png';
  await img.png().toFile(out);
  await writeFile(out.replace('.png', '.json'), JSON.stringify({ layers: layers.map((l) => l.name) }, null, 1));
  console.log(out);
} else {
  console.error('unknown command', cmd);
  process.exit(1);
}
