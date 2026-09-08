/**
 * Contact sheet for the 9-slice UI frames.
 *
 * The frames in `public/ui/` are 12px squares — unreadable at their own size and
 * meaningless flat, because the whole point is what they look like *stretched*.
 * This renders each one at the size it actually gets used at, so the art can be
 * reviewed without a browser (there is no headless Chrome in the sandbox).
 *
 *   node tools/uigen/sheet.mjs [out.png]
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.resolve(HERE, '../../packages/client/public/ui');
const OUT = process.argv[2] ?? path.resolve(HERE, '../../docs/assets/ui-frames.png');

const ZOOM = 3; // everything is drawn at 1:1 then blown up with nearest neighbour
const BG = { r: 0x11, g: 0x15, b: 0x1c, alpha: 1 };

/**
 * Stretch a 9-slice frame to `w`×`h`: corners stay put, edges repeat, the middle
 * fills. Same maths the browser runs for `border-image`, done by hand so the
 * result is a real PNG.
 */
async function nineSlice(file, w, h, slice) {
  const src = sharp(path.join(UI, file));
  const { width: sw, height: sh } = await src.metadata();
  const [t, r, b, l] = slice;
  const raw = await src.raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * raw.info.width + x) * raw.info.channels;
    return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3] ?? 255];
  };

  const out = Buffer.alloc(w * h * 4);
  // Map a destination coordinate back onto the source: inside a corner it is 1:1,
  // in the middle it wraps around the stretchable band.
  const map = (d, size, before, after, srcSize) => {
    if (d < before) return d;
    if (d >= size - after) return srcSize - (size - d);
    const band = srcSize - before - after;
    return before + ((d - before) % band);
  };

  for (let y = 0; y < h; y++) {
    const sy = map(y, h, t, b, sh);
    for (let x = 0; x < w; x++) {
      const sx = map(x, w, l, r, sw);
      const [cr, cg, cb, ca] = px(sx, sy);
      const i = (y * w + x) * 4;
      out[i] = cr;
      out[i + 1] = cg;
      out[i + 2] = cb;
      out[i + 3] = ca;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

function label(text, color = '#a3acbc') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="14">
    <text x="0" y="11" font-family="monospace" font-size="11" fill="${color}">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const ROWS = [
  { file: 'panel.png', slice: [4, 4, 4, 4], w: 120, h: 46, note: 'panel — карточка' },
  { file: 'panel-hi.png', slice: [4, 4, 4, 4], w: 120, h: 46, note: 'panel-hi — наведение' },
  { file: 'panel-gold.png', slice: [4, 4, 4, 4], w: 120, h: 46, note: 'panel-gold — выбрано' },
  { file: 'well.png', slice: [4, 4, 4, 4], w: 120, h: 46, note: 'well — вдавленный блок' },
  { file: 'btn-gold.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-primary' },
  { file: 'btn-gold-down.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-primary:active' },
  { file: 'btn-dark.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-secondary' },
  { file: 'btn-dark-down.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-secondary:active' },
  { file: 'btn-moss.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-success' },
  { file: 'btn-moss-down.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-success:active' },
  { file: 'btn-clay.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-danger' },
  { file: 'btn-clay-down.png', slice: [4, 4, 5, 4], w: 110, h: 30, note: 'btn-danger:active' },
];

const COLS = 2;
const CELL_W = 150;
const CELL_H = 62;
const PAD = 10;

const sheetW = COLS * CELL_W + PAD * 2;
const sheetH = Math.ceil(ROWS.length / COLS) * CELL_H + PAD * 2;

const layers = [];
for (const [i, row] of ROWS.entries()) {
  const col = i % COLS;
  const line = Math.floor(i / COLS);
  const frame = await nineSlice(row.file, row.w, row.h, row.slice);
  layers.push({
    input: frame,
    left: PAD + col * CELL_W,
    top: PAD + line * CELL_H,
  });
  layers.push({
    input: await label(row.note),
    left: PAD + col * CELL_W,
    top: PAD + line * CELL_H + row.h + 3,
  });
}

const flat = await sharp({
  create: { width: sheetW, height: sheetH, channels: 4, background: BG },
})
  .composite(layers)
  .png()
  .toBuffer();

await sharp(flat)
  .resize({ width: sheetW * ZOOM, height: sheetH * ZOOM, kernel: 'nearest' })
  .png()
  .toFile(OUT);

console.log(`${OUT}  ${sheetW * ZOOM}×${sheetH * ZOOM}`);
