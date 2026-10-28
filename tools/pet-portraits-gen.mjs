#!/usr/bin/env node
/**
 * Генератор пиксель-портретов питомцев (долг «pet pixel-portraits», 27.10.2026).
 *
 * Один запуск — все 15 питомцев: packages/client/public/art/pet-v1/<id>.png
 * (64×64, RGBA, прозрачный фон). Портрет — «бюст»: голова + плечи, пиксельная
 * сетка, image-rendering: pixelated в комнате (lib/petPortraits.ts).
 *
 * Принцип E4: генератор, а не рисунок — спеки ниже, перегенерация = `node
 * tools/pet-portraits-gen.mjs`. Ничего не зависит от API и ассетов-мастеров.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../packages/client/public/art/pet-v1');

// ── PNG-энкодер (8-bit RGBA, без внешних зависимостей) ─────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Растровый холст ───────────────────────────────────────────────────────
const S = 64;
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
}
function makeCanvas() {
  return Buffer.alloc(S * S * 4);
}
function px(cv, x, y, c) {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  cv[i] = c[0];
  cv[i + 1] = c[1];
  cv[i + 2] = c[2];
  cv[i + 3] = c[3];
}
function rect(cv, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(cv, x + i, y + j, c);
}
function circle(cv, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.4) px(cv, x, y, c);
}
function ellipse(cv, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) px(cv, x, y, c);
}
function tri(cv, x1, y1, x2, y2, x3, y3, c) {
  const minX = Math.min(x1, x2, x3),
    maxX = Math.max(x1, x2, x3);
  const minY = Math.min(y1, y2, y3),
    maxY = Math.max(y1, y2, y3);
  const area = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3) || 1;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / area;
      const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / area;
      const w3 = 1 - w1 - w2;
      if (w1 >= -0.02 && w2 >= -0.02 && w3 >= -0.02) px(cv, x, y, c);
    }
}

// ── Спеки питомцев: 15 id из petSkins.ts ─────────────────────────────────
// palete: [основной, тёмный(контур/тени), светлый(морда/брюшко), глаза, акцент]
const SPECS = {
  pet_cat: {
    pal: ['#8a93a6', '#5d6474', '#e8ecf2', '#1c2321', '#f2a6b8'],
    draw(cv, p) {
      tri(cv, 12, 24, 14, 4, 28, 16, p[0]);
      tri(cv, 52, 24, 50, 4, 36, 16, p[0]);
      tri(cv, 15, 20, 16, 9, 24, 16, p[4]);
      tri(cv, 49, 20, 48, 9, 40, 16, p[4]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      circle(cv, 32, 30, 18, p[0]);
      ellipse(cv, 32, 37, 11, 7, p[2]);
      rect(cv, 20, 22, 3, 2, p[1]);
      rect(cv, 41, 22, 3, 2, p[1]);
      rect(cv, 22, 16, 3, 2, p[1]);
      rect(cv, 39, 16, 3, 2, p[1]);
      circle(cv, 24, 29, 3, p[3]);
      circle(cv, 40, 29, 3, p[3]);
      px(cv, 25, 28, hex('#ffffff'));
      px(cv, 41, 28, hex('#ffffff'));
      tri(cv, 30, 35, 34, 35, 32, 38, p[4]);
      rect(cv, 27, 39, 3, 1, p[3]);
      rect(cv, 34, 39, 3, 1, p[3]);
    },
  },
  pet_dog: {
    pal: ['#c98c4e', '#8f5e2e', '#ffe8c7', '#1c2321', '#e05543'],
    draw(cv, p) {
      ellipse(cv, 14, 28, 8, 13, p[1]);
      ellipse(cv, 50, 28, 8, 13, p[1]);
      ellipse(cv, 14, 30, 5, 9, p[0]);
      ellipse(cv, 50, 30, 5, 9, p[0]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      circle(cv, 32, 30, 18, p[0]);
      ellipse(cv, 32, 37, 11, 8, p[2]);
      circle(cv, 24, 27, 3, p[3]);
      circle(cv, 40, 27, 3, p[3]);
      px(cv, 25, 26, hex('#ffffff'));
      px(cv, 41, 26, hex('#ffffff'));
      ellipse(cv, 32, 34, 3, 2, p[3]);
      rect(cv, 31, 36, 2, 3, p[3]);
      ellipse(cv, 32, 41, 3, 4, p[4]);
    },
  },
  pet_cactus: {
    pal: ['#63c74d', '#3e8948', '#c7e569', '#1c2321', '#e5533c'],
    draw(cv, p) {
      rect(cv, 24, 20, 16, 36, p[0]);
      rect(cv, 12, 28, 8, 12, p[0]);
      rect(cv, 12, 26, 4, 4, p[0]);
      rect(cv, 44, 24, 8, 12, p[0]);
      rect(cv, 48, 22, 4, 4, p[0]);
      rect(cv, 24, 20, 16, 3, p[2]);
      circle(cv, 32, 14, 5, p[4]);
      circle(cv, 32, 14, 2, hex('#ffd98a'));
      circle(cv, 27, 32, 3, p[3]);
      circle(cv, 37, 32, 3, p[3]);
      px(cv, 28, 31, hex('#ffffff'));
      px(cv, 38, 31, hex('#ffffff'));
      rect(cv, 29, 38, 6, 2, p[3]);
      for (const [x, y] of [
        [21, 26],
        [21, 38],
        [21, 48],
        [43, 30],
        [43, 42],
        [32, 50],
      ])
        px(cv, x, y, p[1]);
    },
  },
  pet_robo: {
    pal: ['#e8a33d', '#b0722a', '#ffd98a', '#262626', '#7ec8e3'],
    draw(cv, p) {
      rect(cv, 18, 46, 28, 12, p[1]);
      rect(cv, 20, 48, 24, 10, p[0]);
      rect(cv, 30, 38, 4, 8, p[1]);
      rect(cv, 14, 14, 36, 28, p[1]);
      rect(cv, 16, 16, 32, 24, p[0]);
      rect(cv, 18, 18, 28, 16, p[2]);
      rect(cv, 22, 23, 6, 5, p[4]);
      rect(cv, 36, 23, 6, 5, p[4]);
      px(cv, 24, 25, hex('#ffffff'));
      px(cv, 38, 25, hex('#ffffff'));
      rect(cv, 26, 33, 12, 2, p[3]);
      rect(cv, 31, 6, 2, 8, p[1]);
      circle(cv, 32, 5, 3, p[4]);
      rect(cv, 12, 22, 3, 8, p[1]);
      rect(cv, 49, 22, 3, 8, p[1]);
      rect(cv, 24, 52, 4, 3, p[4]);
      rect(cv, 36, 52, 4, 3, p[4]);
    },
  },
  pet_spider: {
    pal: ['#7e57c2', '#4527a0', '#b39ddb', '#1c2321', '#ff8a65'],
    draw(cv, p) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const y = 22 + k * 8;
          const x0 = 32 + side * 14;
          rect(cv, Math.min(x0, x0 + side * 12), y + (k - 1) * 3, 12, 3, p[1]); // нога
          px(cv, x0 + side * 13, y + (k - 1) * 3 + 2, p[1]);
        }
      }
      ellipse(cv, 32, 48, 15, 11, p[1]); // брюшко
      ellipse(cv, 32, 46, 12, 8, p[0]);
      circle(cv, 32, 28, 15, p[0]); // голова
      circle(cv, 26, 25, 3, p[3]);
      circle(cv, 38, 25, 3, p[3]); // большие глаза
      circle(cv, 21, 29, 2, p[3]);
      circle(cv, 43, 29, 2, p[3]); // малые
      px(cv, 27, 24, hex('#ffffff'));
      px(cv, 39, 24, hex('#ffffff'));
      rect(cv, 28, 34, 8, 2, p[3]); // улыбка
      tri(cv, 27, 38, 30, 42, 25, 42, p[4]); // клыки
      tri(cv, 37, 38, 34, 42, 39, 42, p[4]);
    },
  },
  pet_bulldog: {
    pal: ['#e8d5b7', '#b08c5e', '#fff3e0', '#1c2321', '#e05543'],
    draw(cv, p) {
      rect(cv, 12, 18, 10, 8, p[1]);
      rect(cv, 42, 18, 10, 8, p[1]); // заломленные уши
      rect(cv, 14, 16, 6, 4, p[0]);
      rect(cv, 44, 16, 6, 4, p[0]);
      ellipse(cv, 32, 52, 21, 10, p[1]);
      ellipse(cv, 32, 48, 19, 9, p[0]);
      circle(cv, 32, 30, 19, p[0]); // широкая голова
      ellipse(cv, 32, 36, 13, 10, p[2]); // плоская морда
      ellipse(cv, 24, 28, 3, 3, p[3]);
      ellipse(cv, 40, 28, 3, 3, p[3]); // бульдожьи глаза
      px(cv, 25, 27, hex('#ffffff'));
      px(cv, 41, 27, hex('#ffffff'));
      ellipse(cv, 32, 34, 4, 3, p[1]); // широкий нос
      rect(cv, 22, 40, 4, 4, p[2]);
      rect(cv, 38, 40, 4, 4, p[2]); // брыли
      rect(cv, 29, 38, 6, 2, p[3]);
      rect(cv, 30, 42, 2, 3, hex('#ffffff')); // зуб-нижняя челюсть
    },
  },
  pet_parrot: {
    pal: ['#4db64d', '#2e7f2e', '#ffe082', '#1c2321', '#e5533c'],
    draw(cv, p) {
      tri(cv, 20, 12, 26, 2, 32, 12, p[0]); // хохолок
      tri(cv, 28, 10, 32, 0, 38, 10, p[0]);
      ellipse(cv, 32, 52, 18, 9, p[1]); // тело
      ellipse(cv, 32, 48, 16, 8, p[0]);
      circle(cv, 32, 28, 17, p[0]); // голова
      ellipse(cv, 32, 44, 10, 8, p[2]); // грудка
      circle(cv, 32, 28, 17, p[0]);
      ellipse(cv, 22, 40, 7, 12, p[1]); // крыло
      ellipse(cv, 22, 40, 5, 9, p[0]);
      circle(cv, 26, 26, 4, p[3]); // глаз
      px(cv, 27, 25, hex('#ffffff'));
      circle(cv, 26, 26, 2, hex('#ffffff')); // белый обод
      circle(cv, 26, 26, 1, p[3]);
      tri(cv, 38, 28, 50, 32, 38, 38, p[4]); // клюв
      tri(cv, 38, 33, 46, 34, 38, 38, hex('#c62828'));
    },
  },
  pet_hamster: {
    pal: ['#e0a96d', '#b07c42', '#ffe8c7', '#1c2321', '#c98c4e'],
    draw(cv, p) {
      circle(cv, 19, 18, 5, p[1]);
      circle(cv, 45, 18, 5, p[1]);
      circle(cv, 19, 18, 3, p[4]);
      circle(cv, 45, 18, 3, p[4]);
      ellipse(cv, 32, 52, 20, 10, p[1]);
      ellipse(cv, 32, 48, 18, 9, p[0]);
      circle(cv, 32, 30, 18, p[0]);
      circle(cv, 21, 34, 6, p[2]);
      circle(cv, 43, 34, 6, p[2]);
      ellipse(cv, 32, 38, 10, 6, p[2]);
      circle(cv, 25, 28, 2, p[3]);
      circle(cv, 39, 28, 2, p[3]);
      px(cv, 26, 27, hex('#ffffff'));
      px(cv, 40, 27, hex('#ffffff'));
      ellipse(cv, 32, 34, 2, 2, p[1]);
      rect(cv, 31, 36, 2, 3, p[3]);
      ellipse(cv, 32, 46, 4, 3, p[2]);
    },
  },
  pet_fish: {
    pal: ['#ff9d4d', '#e06b2c', '#ffd9a8', '#1c2321', '#4fc3f7'],
    draw(cv, p) {
      tri(cv, 14, 32, 2, 18, 2, 46, p[1]); // хвост-веер
      tri(cv, 14, 32, 4, 22, 4, 42, p[0]);
      ellipse(cv, 36, 32, 20, 15, p[0]); // тело
      ellipse(cv, 36, 36, 14, 8, p[2]); // брюшко
      tri(cv, 30, 18, 36, 8, 42, 18, p[1]); // плавник сверху
      ellipse(cv, 34, 44, 6, 4, p[1]); // нижний плавник
      circle(cv, 48, 28, 4, p[3]); // глаз
      px(cv, 49, 27, hex('#ffffff'));
      ellipse(cv, 54, 34, 2, 2, p[1]); // рот
      circle(cv, 20, 12, 3, [79, 195, 247, 160]); // пузырёк
      circle(cv, 14, 7, 2, [79, 195, 247, 120]);
    },
  },
  pet_fox: {
    pal: ['#f27c38', '#c85c28', '#ffe3c7', '#2b1d16', '#ffffff'],
    draw(cv, p) {
      tri(cv, 12, 22, 18, 2, 26, 18, p[0]);
      tri(cv, 52, 22, 46, 2, 38, 18, p[0]);
      tri(cv, 14, 18, 18, 6, 23, 16, p[1]);
      tri(cv, 50, 18, 46, 6, 41, 16, p[1]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      ellipse(cv, 32, 30, 20, 16, p[0]);
      ellipse(cv, 32, 38, 12, 8, p[4]);
      ellipse(cv, 32, 32, 9, 5, p[2]);
      circle(cv, 24, 28, 3, p[3]);
      circle(cv, 40, 28, 3, p[3]);
      px(cv, 25, 27, hex('#ffffff'));
      px(cv, 41, 27, hex('#ffffff'));
      ellipse(cv, 32, 38, 3, 2, p[3]);
      rect(cv, 31, 40, 2, 3, p[3]);
    },
  },
  pet_owl: {
    pal: ['#a1887f', '#6d4c41', '#ffe0b2', '#1c2321', '#ffb74d'],
    draw(cv, p) {
      tri(cv, 14, 18, 18, 2, 28, 14, p[1]);
      tri(cv, 50, 18, 46, 2, 36, 14, p[1]);
      ellipse(cv, 32, 50, 20, 12, p[1]);
      ellipse(cv, 32, 48, 18, 11, p[0]);
      circle(cv, 32, 28, 19, p[0]);
      ellipse(cv, 32, 38, 13, 9, p[2]);
      circle(cv, 23, 26, 8, p[2]);
      circle(cv, 41, 26, 8, p[2]);
      circle(cv, 23, 26, 5, p[3]);
      circle(cv, 41, 26, 5, p[3]);
      px(cv, 25, 24, hex('#ffffff'));
      px(cv, 43, 24, hex('#ffffff'));
      tri(cv, 29, 31, 35, 31, 32, 37, p[4]);
      rect(cv, 22, 44, 20, 2, p[1]);
      rect(cv, 24, 48, 16, 2, p[1]);
    },
  },
  pet_raccoon: {
    pal: ['#9e9e9e', '#616161', '#eeeeee', '#1c2321', '#4e342e'],
    draw(cv, p) {
      tri(cv, 12, 20, 16, 2, 28, 14, p[1]);
      tri(cv, 52, 20, 48, 2, 36, 14, p[1]);
      tri(cv, 15, 16, 17, 7, 24, 13, p[2]);
      tri(cv, 49, 16, 47, 7, 40, 13, p[2]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      ellipse(cv, 32, 30, 19, 15, p[0]);
      ellipse(cv, 32, 30, 17, 8, p[2]); // белая «маска» поперёк
      ellipse(cv, 24, 28, 7, 5, p[4]);
      ellipse(cv, 40, 28, 7, 5, p[4]); // тёмная маска
      circle(cv, 24, 28, 3, p[3]);
      circle(cv, 40, 28, 3, p[3]);
      px(cv, 25, 27, hex('#ffffff'));
      px(cv, 41, 27, hex('#ffffff'));
      ellipse(cv, 32, 36, 8, 5, p[2]); // белая морда
      tri(cv, 29, 33, 35, 33, 32, 37, p[4]); // тёмный нос
      rect(cv, 28, 39, 8, 1, p[3]);
    },
  },
  pet_turtle: {
    pal: ['#66bb6a', '#2e7d32', '#c8e6c9', '#1c2321', '#ffb74d'],
    draw(cv, p) {
      ellipse(cv, 32, 46, 22, 14, p[1]); // панцирь
      ellipse(cv, 32, 44, 19, 11, p[0]);
      ellipse(cv, 26, 40, 5, 4, p[2]); // щитки
      ellipse(cv, 38, 40, 5, 4, p[2]);
      ellipse(cv, 32, 50, 6, 4, p[2]);
      circle(cv, 32, 22, 13, p[0]); // голова
      ellipse(cv, 32, 26, 9, 6, p[2]);
      circle(cv, 27, 20, 3, p[3]);
      circle(cv, 37, 20, 3, p[3]);
      px(cv, 28, 19, hex('#ffffff'));
      px(cv, 38, 19, hex('#ffffff'));
      rect(cv, 29, 26, 6, 2, p[3]); // улыбка
      ellipse(cv, 12, 48, 5, 4, p[0]);
      ellipse(cv, 52, 48, 5, 4, p[0]); // лапы
      px(cv, 20, 24, p[4]);
      px(cv, 44, 24, p[4]); // веснушки-пятнышки
    },
  },
  pet_cat_shadow: {
    pal: ['#37474f', '#263238', '#90a4ae', '#ffd54f', '#546e7a'],
    draw(cv, p) {
      tri(cv, 12, 24, 14, 4, 28, 16, p[0]);
      tri(cv, 52, 24, 50, 4, 36, 16, p[0]);
      tri(cv, 15, 20, 16, 9, 24, 16, p[1]);
      tri(cv, 49, 20, 48, 9, 40, 16, p[1]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      circle(cv, 32, 30, 18, p[0]);
      ellipse(cv, 32, 37, 10, 6, p[4]); // морда чуть светлее
      ellipse(cv, 24, 28, 3, 3, p[3]);
      ellipse(cv, 40, 28, 3, 3, p[3]); // светящиеся глаза
      px(cv, 25, 27, hex('#fff9c4'));
      px(cv, 41, 27, hex('#fff9c4'));
      tri(cv, 30, 34, 34, 34, 32, 37, p[4]);
      rect(cv, 27, 38, 3, 1, p[4]);
      rect(cv, 34, 38, 3, 1, p[4]);
    },
  },
  pet_dragon: {
    pal: ['#4db6ac', '#2e7f76', '#b2dfdb', '#1c2321', '#ff8a65'],
    draw(cv, p) {
      tri(cv, 18, 16, 22, 0, 28, 14, p[4]);
      tri(cv, 46, 16, 42, 0, 36, 14, p[4]);
      tri(cv, 14, 26, 10, 12, 22, 20, p[0]);
      tri(cv, 50, 26, 54, 12, 42, 20, p[0]);
      ellipse(cv, 32, 52, 19, 10, p[1]);
      ellipse(cv, 32, 48, 17, 9, p[0]);
      ellipse(cv, 32, 30, 19, 15, p[0]);
      ellipse(cv, 32, 36, 13, 8, p[2]);
      ellipse(cv, 32, 33, 6, 3, p[2]);
      px(cv, 29, 33, p[3]);
      px(cv, 35, 33, p[3]);
      circle(cv, 23, 25, 3, p[3]);
      circle(cv, 41, 25, 3, p[3]);
      px(cv, 24, 24, hex('#ffffff'));
      px(cv, 42, 24, hex('#ffffff'));
      rect(cv, 27, 39, 10, 2, p[3]);
      rect(cv, 28, 41, 2, 2, hex('#ffffff'));
      rect(cv, 34, 41, 2, 2, hex('#ffffff'));
    },
  },
};

mkdirSync(OUT, { recursive: true });
for (const [id, spec] of Object.entries(SPECS)) {
  const cv = makeCanvas();
  const p = spec.pal.map(hex);
  spec.draw(cv, p);
  writeFileSync(join(OUT, `${id}.png`), encodePng(S, cv));
  console.log(`pet-v1/${id}.png`);
}
console.log(`\n${Object.keys(SPECS).length} portraits → ${OUT}`);
