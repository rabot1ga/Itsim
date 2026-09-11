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

const CANVAS_W = 500;
const CANVAS_H = 760;

/** Canvas-absolute placement spec (tuned on the assembled body). */
const SLOTS = {
  // hair: scaled to head width, crown top anchored; long styles flow down freely;
  // `clear` carves the face window so no fringe can ever cover the eyes
  hair: {
    x: 160,
    y: 24,
    w: 180,
    h: 300,
    fit: 'width',
    alignY: 'top',
    clear: { x: 197, y: 90, w: 106, h: 34 },
  },
  // beard: chin region below the nose
  beard: { x: 210, y: 168, w: 80, h: 68, fit: 'box', alignY: 'center' },
  // eyes: small pair on the eye line (eye line ≈ y 101 of the canvas)
  eyes: { x: 190, y: 83, w: 120, h: 36, fit: 'width', alignY: 'center' },
  // tops: shoulders-to-hips rectangle
  top: { x: 135, y: 188, w: 230, h: 257, fit: 'box', alignY: 'center' },
  // bottoms: waist-to-ankles (feet stay bare skin)
  bottom: { x: 130, y: 428, w: 240, h: 272, fit: 'width', alignY: 'top' },
  // accessory variants land on their own anchors
  acc_head: { x: 160, y: 14, w: 180, h: 84, fit: 'box', alignY: 'bottom' },
  acc_face: { x: 175, y: 76, w: 150, h: 62, fit: 'box', alignY: 'center' },
  acc_ears: { x: 145, y: 50, w: 210, h: 120, fit: 'box', alignY: 'bottom' },
  acc_chest: { x: 208, y: 285, w: 84, h: 96, fit: 'box', alignY: 'center' },
};

/** Body fits the canvas: full height minus margin, centered horizontally. */
const BODY = { height: 700, top: 30 };

async function keyImage(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { w: info.width, h: info.height };
  let minX = px.w, minY = px.h, maxX = 0, maxY = 0, keyed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.max(Math.abs(r - MAGENTA.r), Math.abs(g - MAGENTA.g), Math.abs(b - MAGENTA.b));
    if (dist <= TOL) {
      data[i + 3] = 0;
      keyed++;
      continue;
    }
    const x = (i / 4) % px.w, y = Math.floor(i / 4 / px.w);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX <= minX) throw new Error('nothing left after chroma-key (whole image is backdrop?)');
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
