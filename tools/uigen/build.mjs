/**
 * uigen · 9-slice frames for the interface
 *
 * The menus are drawn with the same rules as the sprites: hard 2px outline,
 * one lit pixel row under the top edge, one dark row above the bottom, notched
 * corners, no anti-aliasing. Rather than faking that with CSS shadows, we draw
 * the frames as tiny PNGs and let `border-image` stretch their uniform middle
 * bands — the web's own 9-slice. A panel is 12×12 with a 4px slice; a button is
 * 14 tall because it carries a 3px shoulder underneath, so it reads as a key
 * you can press.
 *
 * Usage: node tools/uigen/build.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../packages/client/public/ui');
fs.mkdirSync(OUT, { recursive: true });

const hex = (h) => {
  const v = h.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
    v.length > 6 ? parseInt(v.slice(6, 8), 16) : 255,
  ];
};

/** Mix towards white (t > 0) or black (t < 0). */
function shade(h, t) {
  const [r, g, b] = hex(h);
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const m = (c) => Math.round(c + (to - c) * k);
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4, 0);
  }
  set(x, y, colour) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = hex(colour);
    const i = (y * this.w + x) * 4;
    this.buf[i] = r;
    this.buf[i + 1] = g;
    this.buf[i + 2] = b;
    this.buf[i + 3] = a;
  }
  row(y, colour, from = 0, to = this.w - 1) {
    for (let x = from; x <= to; x++) this.set(x, y, colour);
  }
  rect(x0, y0, x1, y1, colour) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, colour);
  }
  /** knock the outer corner pixels out, the way a hand-drawn frame is notched */
  notch() {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [this.w - 1, 0],
      [this.w - 2, 0],
      [this.w - 1, 1],
      [0, this.h - 1],
      [1, this.h - 1],
      [0, this.h - 2],
      [this.w - 1, this.h - 1],
      [this.w - 2, this.h - 1],
      [this.w - 1, this.h - 2],
    ]) {
      const i = (y * this.w + x) * 4;
      this.buf[i + 3] = 0;
    }
  }
  async write(name) {
    await sharp(this.buf, { raw: { width: this.w, height: this.h, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${name}.png`));
    console.log(`${name.padEnd(16)} ${this.w}×${this.h}`);
  }
}

/**
 * A flat plate: 2px outline, lit row under the top edge, dark row above the
 * bottom. 12×12, slice 4.
 */
async function plate(name, { fill, line, light = shade(fill, 0.14), dark = shade(fill, -0.3) }) {
  const c = new Canvas(12, 12);
  c.rect(0, 0, 11, 11, line);
  c.rect(2, 2, 9, 9, fill);
  c.row(2, light, 2, 9);
  c.row(9, dark, 2, 9);
  c.notch();
  await c.write(name);
}

/**
 * A key: the same plate on a 3px shoulder. 14 tall, slice 4 / 5 at the bottom.
 * `down` swaps the shoulder for an inset shadow, so pressing looks like the key
 * has travelled into the board.
 */
async function key(name, { fill, shoulder, line = shade(shoulder, -0.35), down = false }) {
  const c = new Canvas(12, 14);
  c.rect(0, 0, 11, 13, line);
  if (down) {
    c.rect(2, 2, 9, 11, fill);
    c.row(2, shade(fill, -0.28), 2, 9); // pressed: the light edge goes out
    c.row(3, shade(fill, -0.12), 2, 9);
    c.row(11, shade(fill, -0.2), 2, 9);
    c.rect(2, 12, 9, 12, shoulder);
  } else {
    c.rect(2, 2, 9, 9, fill);
    c.row(2, shade(fill, 0.3), 2, 9);
    c.row(9, shade(fill, -0.18), 2, 9);
    c.rect(2, 10, 9, 12, shoulder);
  }
  c.notch();
  await c.write(name);
}

const INK = { surface: '#1e2430', raise: '#232a37', well: '#131820', line: '#2a3240', strong: '#3a4456' };

await plate('panel', { fill: INK.surface, line: INK.line });
await plate('panel-hi', { fill: INK.raise, line: INK.strong });
await plate('panel-gold', { fill: INK.raise, line: '#8a6a25' });
await plate('well', {
  fill: INK.well,
  line: INK.line,
  light: shade(INK.well, -0.5),
  dark: shade(INK.well, 0.12),
});

await key('btn-gold', { fill: '#f4d35e', shoulder: '#a87d1f' });
await key('btn-gold-down', { fill: '#e6c451', shoulder: '#a87d1f', down: true });
// the quiet button keeps a visible outline: on a dark screen a dark key on a
// dark plate disappears entirely
await key('btn-dark', { fill: INK.raise, shoulder: '#10151d', line: '#3a4456' });
await key('btn-dark-down', { fill: INK.raise, shoulder: '#10151d', line: '#3a4456', down: true });
await key('btn-moss', { fill: '#7fae7a', shoulder: '#446b41' });
await key('btn-moss-down', { fill: '#76a471', shoulder: '#446b41', down: true });
await key('btn-clay', { fill: '#c2565a', shoulder: '#7a3336' });
await key('btn-clay-down', { fill: '#b65055', shoulder: '#7a3336', down: true });

console.log(`\nframes → ${OUT}`);
