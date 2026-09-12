#!/usr/bin/env node
/**
 * Avatar-layer assembly tool (avatar layers v2, story-v1 art style).
 *
 * Pipeline per layer:
 *   key   — chroma-key the flat magenta backdrop out, auto-crop the content;
 *           for `stripBody` slots, additionally key out the gray mannequin base
 *           so accessories/glasses/caps isolate cleanly
 *   place — scale the cropped content into slot bounding-box and blit onto the
 *           500×760 transparent canvas; `anchor` fractions let us line up a
 *           specific landmark (brim, lenses, ear cups, coin) onto a canvas-y
 *           coordinate calibrated from body_base
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
const TOL = 72; // chroma tolerance — raised to kill pink/magenta AA halos around skin/edge pixels
const EDGE_DILATE = 2; // expand transparency outward by N px to peel remaining halo

const CANVAS_W = 500;
const CANVAS_H = 760;

/** Canvas-absolute placement spec, recalibrated off body_base bbox 73..427×30..729.
 *  Body anatomy (canvas px):
 *    crown y≈30   hairline y≈55   brow y≈70     eye line y≈101
 *    nose y≈130   mouth y≈150     chin y≈170    neck y≈178      shoulders y≈188
 *    chest y≈230  waistband y≈410 crotch y≈470  knees y≈560     ankles/feet bottom y≈729
 *
 *  FIT RULES:
 *    • clothing (top/bottom): width-fill torso/legs so sleeves/pant legs cover
 *      the arms and shins (the grayscaled body_base shows skin at wrists/ankles)
 *    • hair/beard/eyes:       width-fill head region
 *    • accessories:           width-fill slot, anchored by `anchor.frac`→`anchor.target`
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
    clear: { x: 165, y: 78, w: 170, h: 52 },
  },
  // beard: mouth-to-chin. Full-body masters paint the beard onto the mannequin
  // face (no stripBody needed — grayscale layer covers only the facial hair area
  // when anchored correctly because the keyed crop is tight to the beard's
  // connected component; see the bbox stats in commit notes).
  beard: { x: 190, y: 148, w: 120, h: 90, fit: 'width', alignY: 'top' },
  // eyes: small pair centered on the eye line y≈101 (eyes are painted onto the
  // mannequin face and include eye makeup/highlights; stripBody IS used because
  // the eye bbox otherwise drags gray skin around the eyes).
  eyes: { x: 180, y: 96, w: 140, h: 36, fit: 'width', alignY: 'center', stripBody: true },
  // tops: shoulder-to-hem. h=360 leaves room for long shirts/jackets whose hem
  // falls to mid-thigh (e.g. shirt, cat-hoodie); short-sleeve Ts end earlier but
  // that's fine — body_base hands show correctly as skin past the cuffs.
  top: { x: 95, y: 180, w: 310, h: 400, fit: 'width', alignY: 'top' },
  // bottoms: waist-to-ankles, width-fill legs. h=360 gives room for slouchy
  // pants/sweatpants that bunch at the ankle.
  bottom: { x: 105, y: 400, w: 290, h: 360, fit: 'width', alignY: 'top' },
  // Accessories use anchor-based placement: place so that the fraction `frac`
  // down from the top of the (resized) item lands exactly at canvas-y `target`.
  // Fracs measured from auto-cropped item bbox: cap-brim 0.58, beanie-cuff 0.81,
  // glasses/VR-lens center ≈0.46, headphone cups ≈0.73, medal coin ≈0.73.
  acc_head: {
    x: 165, y: 0, w: 170, h: CANVAS_H, fit: 'width', alignY: 'top',
    anchor: { frac: 0.70, target: 73 }, stripBody: true,
  },
  acc_face: {
    x: 175, y: 0, w: 150, h: CANVAS_H, fit: 'width', alignY: 'top',
    anchor: { frac: 0.46, target: 100 }, stripBody: true,
  },
  acc_ears: {
    x: 135, y: 0, w: 230, h: CANVAS_H, fit: 'width', alignY: 'top',
    anchor: { frac: 0.73, target: 108 }, stripBody: true,
  },
  acc_chest: {
    x: 212, y: 0, w: 76, h: CANVAS_H, fit: 'width', alignY: 'top',
    anchor: { frac: 0.73, target: 310 }, stripBody: true,
  },
};

/** Body fits the canvas: full height minus margin, centered horizontally. */
const BODY = { height: 700, top: 30 };

async function keyImage(input, opts = {}) {
  const { stripBody = false } = opts;
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
  // Pass 1a: stripBody — for accessory (and eye) slots, key out the gray
  // mannequin base / skin pixels underneath the item while keeping the item
  // itself. A pixel is "body" if it has LOW channel spread (desaturated gray
  // or skin-tone) AND its luminance is mid-range; very dark (black frames,
  // lashes, shadow) and very bright (specular highlights, white logos)
  // pixels survive even when desaturated.
  if (stripBody) {
    const SAT_TOL = 26;
    const LUM_LO = 55;
    const LUM_HI = 210;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (!opaque[p]) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = (r + g + b) / 3;
      if (spread < SAT_TOL && lum > LUM_LO && lum < LUM_HI) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
        opaque[p] = 0;
        keyed++;
      }
    }
  }
  // Pass 1b: dilate transparency by EDGE_DILATE pixels outward — peels the
  // magenta/skin AA halo that survives the chroma key.
  if (EDGE_DILATE > 0) {
    for (let step = 0; step < EDGE_DILATE; step++) {
      const kill = new Uint8Array(px.w * px.h);
      for (let y = 0; y < px.h; y++) {
        for (let x = 0; x < px.w; x++) {
          const p = y * px.w + x;
          if (!opaque[p]) continue;
          let edge = false;
          for (let dy = -1; dy <= 1 && !edge; dy++) {
            for (let dx = -1; dx <= 1 && !edge; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= px.w || ny >= px.h) { edge = true; break; }
              if (!opaque[ny * px.w + nx]) edge = true;
            }
          }
          if (edge) kill[p] = 1;
        }
      }
      for (let p = 0; p < kill.length; p++) {
        if (kill[p]) {
          opaque[p] = 0;
          data[p * 4] = 0; data[p * 4 + 1] = 0; data[p * 4 + 2] = 0; data[p * 4 + 3] = 0;
        }
      }
    }
  }
  // Pass 2: drop isolated noise pixels (no opaque neighbour in 3×3).
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
  // Pass 3: connected components — keep all sizeable components (pairs of
  // lenses/cups/eyes split into two blobs must survive); drop specks.
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
        const qx = q % px.w;
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
  let top;
  if (slot.anchor) {
    // Place item so `anchor.frac` of the way down from its top edge lines up
    // with canvas-y `anchor.target` (e.g. brim of cap lands on brow line).
    top = Math.round(slot.anchor.target - slot.anchor.frac * h);
  } else {
    top =
      slot.alignY === 'bottom'
        ? Math.round(slot.y + slot.h - h)
        : slot.alignY === 'top'
          ? Math.round(slot.y)
          : Math.round(slot.y + (slot.h - h) / 2);
  }
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
  const { img, crop } = await keyImage(input, { stripBody: !!slot.stripBody });
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
