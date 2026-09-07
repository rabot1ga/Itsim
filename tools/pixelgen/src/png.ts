/**
 * Minimal PNG codec for the pixel-art pipeline (no dependencies).
 *
 * The ТЗ forbids adding an image library for the MVP — pixel art needs
 * 8-bit RGBA + zlib only, and having the codec in-repo lets the generator
 * *verify* its own output (decode → compare RGBA), which a black-box encoder
 * would not.
 */

import { deflateSync, inflateSync } from 'zlib';

export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode RGBA → PNG (8-bit, truecolour+alpha, filter 0 — deterministic bytes) */
export function encodePng({ width, height, data }: RawImage): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode PNG → RGBA (filters 0–4 supported, 8-bit RGBA/RGB/grey inputs) */
export function decodePng(buf: Buffer): RawImage {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.subarray(0, 8).compare(sig) !== 0) throw new Error('not a PNG file');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts: Buffer[] = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const body = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== crc) throw new Error(`PNG chunk ${type}: CRC mismatch`);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} is not supported (need 8)`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`colour type ${colorType} is not supported`);

  const inflate = inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const prevRowStart = (y: number) => y * stride;

  for (let y = 0; y < height; y++) {
    const filterType = inflate[y * (stride + 1)];
    const lineStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rawByte = inflate[lineStart + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[prevRowStart(y - 1) + x] : 0;
      const c = x >= channels && y > 0 ? out[prevRowStart(y - 1) + x - channels] : 0;
      let value = rawByte;
      switch (filterType) {
        case 0: break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unknown PNG filter type ${filterType}`);
      }
      out[y * stride + x] = value & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 4) {
      data[i * 4] = out[i * 4];
      data[i * 4 + 1] = out[i * 4 + 1];
      data[i * 4 + 2] = out[i * 4 + 2];
      data[i * 4 + 3] = out[i * 4 + 3];
    } else if (channels === 3) {
      data[i * 4] = out[i * 3];
      data[i * 4 + 1] = out[i * 3 + 1];
      data[i * 4 + 2] = out[i * 3 + 2];
      data[i * 4 + 3] = 255;
    } else {
      data[i * 4] = out[i];
      data[i * 4 + 1] = out[i];
      data[i * 4 + 2] = out[i];
      data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

/** ASCII preview of an RGBA buffer — the cheapest possible art review tool */
export function asciiPreview(img: RawImage, ramp = ' .:-=+*#%@'): string {
  const lines: string[] = [];
  for (let y = 0; y < img.height; y++) {
    let line = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] === 0) {
        line += ' ';
        continue;
      }
      const lum = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      line += ramp[Math.min(ramp.length - 1, Math.floor((lum / 255) * (ramp.length - 1) + 0.5))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
