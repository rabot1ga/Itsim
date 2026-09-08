// temp: pixel->ASCII viewer for iso blobs (delete after use)
import sharp from 'sharp';

const file = process.argv[2];
const cols = process.argv[3] ? parseInt(process.argv[3], 10) : 76;
const maxRows = process.argv[4] ? parseInt(process.argv[4], 10) : 90;

const img = sharp(file).ensureAlpha();
const { width, height } = await img.metadata();
const s = Math.min(1, cols / width, maxRows / height);
const w = Math.max(1, Math.round(width * s));
const h = Math.max(1, Math.round(height * s));
const buf = await sharp(file).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer();
const RAMP = ' .:-=+*#%@';
let out = '';
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const a = buf[i + 3];
    if (a < 24) { out += ' '; continue; }
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out += RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))];
  }
  out += '\n';
}
console.log(`${file} ${width}x${height} -> ${w}x${h}`);
console.log(out);
