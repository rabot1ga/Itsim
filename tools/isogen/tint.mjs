/**
 * isogen · tint
 *
 * Derivative sprites: the same drawing in another colour family.
 *
 * The project's asset plan (DESIGN.md) buys variety with recolouring rather
 * than redrawing — one base × N palettes. This script does exactly that for
 * pieces whose art is a single object in one hue family (a rug, an armchair):
 * it rotates the hue of every saturated pixel that belongs to the dominant
 * colour family towards a target colour, leaving neutral outlines, highlights
 * and the object's shading structure untouched. The result is a sprite that
 * reads as the same furniture in a new colour — and never as a repaint that
 * lost its outline.
 *
 * Usage:
 *   node tools/isogen/tint.mjs <in.png> <out.png> <targetHex> [hueWindow]
 *
 * e.g. node tools/isogen/tint.mjs ../../packages/client/public/iso/rug_rolled.png \
 *        /tmp/rug_moss.png '#7fae7a'
 */
import sharp from 'sharp';

const [, , inFile, outFile, targetHex, windowArg] = process.argv;
if (!inFile || !outFile || !targetHex) {
  console.error('usage: tint.mjs <in.png> <out.png> <targetHex> [hueWindow]');
  process.exit(1);
}
const HUE_WINDOW = windowArg ? parseInt(windowArg, 10) : 60;

function hexToHsl(hex) {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const img = sharp(inFile).ensureAlpha();
const { width, height } = await img.metadata();
const buf = await img.raw().toBuffer();

// dominant saturated hue of the source (the colour family we recolour)
const hist = new Map();
for (let p = 0; p < width * height; p++) {
  const i = p * 4;
  if (buf[i + 3] < 40) continue;
  const [h, s, l] = hexToHsl(
    `#${[buf[i], buf[i + 1], buf[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  );
  if (s < 0.15 || l < 0.12 || l > 0.94) continue;
  hist.set(h, (hist.get(h) || 0) + 1);
}
let dom = 0;
let best = -1;
for (const [h, c] of hist) {
  if (c > best) {
    best = c;
    dom = h;
  }
}
if (best < 0) {
  console.error('no saturated colour found — refusing to flatten a neutral sprite');
  process.exit(1);
}

const [targetH] = hexToHsl(targetHex);
const delta = targetH - dom;

for (let p = 0; p < width * height; p++) {
  const i = p * 4;
  if (buf[i + 3] === 0) continue;
  const hex = `#${[buf[i], buf[i + 1], buf[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  const [h, s, l] = hexToHsl(hex);
  if (s >= 0.15 && l > 0.1 && l < 0.95) {
    const spread = Math.abs(((h - dom + 540) % 360) - 180);
    if (spread <= HUE_WINDOW) {
      const [rh, gs, bl] = hslToHex(h + delta, s, l)
        .match(/#(..)(..)(..)/)
        .slice(1)
        .map((x) => parseInt(x, 16));
      buf[i] = rh;
      buf[i + 1] = gs;
      buf[i + 2] = bl;
    }
  }
}

await sharp(buf, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(outFile);
console.log(`${outFile} ← ${inFile}  dominant hue ${Math.round(dom)}° → ${targetHex}`);
