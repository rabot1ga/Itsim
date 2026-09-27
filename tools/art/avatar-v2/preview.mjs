#!/usr/bin/env node
/**
 * QA-превью: 6 готовых образов, собранных так же, как их соберёт клиент
 * (стек слоёв на канвасе 500×760, без масштабирования).
 *
 *   node tools/art/avatar-v2/preview.mjs [--layers=<dir>] [--out=<file.png>]
 *
 * Результат кладётся в artifacts/ (в git не попадает).
 */
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const cfg = JSON.parse(await readFile(join(HERE, 'build.config.json'), 'utf-8'));
// Каталог сборки (layers/) в git не лежит — в свежем чекауте или после сброса
// песочницы его нет, а опубликованный набор байт-в-байт тот же вывод сборки.
const built = existsSync(resolve(HERE, cfg.layersDir, 'body_base.webp'));
const DIR = resolve(HERE, opt('layers', process.env.AVATAR_LAYERS_DIR ?? (built ? cfg.layersDir : cfg.publishDir)));
const OUT = opt('out', join(HERE, 'artifacts', 'preview.png'));
const [CW, CH] = [500, 760];
const COLS = 3;
const GAP = 8;

const combos = [
  { name: 'tshirt+jeans+short', eyes: 'eye_normal', hair: 'hair_short', top: 'top_tshirt', bottom: 'bottom_jeans' },
  {
    name: 'shirt+chinos+messy+beard+glasses',
    eyes: 'eye_tired',
    hair: 'hair_messy',
    beard: 'beard_full',
    top: 'top_shirt',
    bottom: 'bottom_chinos',
    acc: 'acc_glasses',
  },
  {
    name: 'hoodie-cat+shorts+manbun+cap',
    eyes: 'eye_red',
    hair: 'hair_manbun',
    beard: 'beard_goatee',
    top: 'top_hoodie_cat',
    bottom: 'bottom_shorts',
    acc: 'acc_cap',
  },
  {
    name: 'localhost+shirts+shades',
    eyes: 'eye_vr',
    hair: 'hair_undercut',
    top: 'top_hoodie_localhost',
    bottom: 'bottom_suit',
    acc: 'acc_vr_headset',
  },
  {
    name: 'hoodie-corp+pjs+long+headphones',
    eyes: 'eye_closed',
    hair: 'hair_long',
    top: 'top_hoodie_corp',
    bottom: 'bottom_sweatpants',
    acc: 'acc_headphones',
  },
  {
    name: 'jacket+chinos+spiky+medal',
    eyes: 'eye_legendary',
    hair: 'hair_spiky',
    beard: 'beard_stubble',
    top: 'top_jacket',
    bottom: 'bottom_chinos',
    acc: 'acc_medal',
  },
];

const blank = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 20, b: 24, alpha: 1 } } });
const load = async (name) => {
  if (!name) return null;
  const file = join(DIR, `${name}.webp`);
  return existsSync(file) ? sharp(file).ensureAlpha().png().toBuffer() : null;
};

const tiles = [];
for (const c of combos) {
  const inputs = [];
  for (const part of ['body_base', c.bottom, c.top, c.eyes, c.beard, c.hair, c.acc]) {
    const buf = await load(part);
    if (buf) inputs.push({ input: buf, left: 0, top: 0 });
  }
  tiles.push({ buf: await blank(CW, CH).composite(inputs).png().toBuffer(), name: c.name });
}

const rows = Math.ceil(tiles.length / COLS);
const composites = tiles.map((t, i) => ({
  input: t.buf,
  left: GAP + (i % COLS) * (CW + GAP),
  top: GAP + Math.floor(i / COLS) * (CH + GAP),
}));
await mkdir(dirname(OUT), { recursive: true });
await blank(COLS * CW + (COLS + 1) * GAP, rows * CH + (rows + 1) * GAP)
  .composite(composites)
  .png()
  .toFile(OUT);
console.log(`✓ ${tiles.length} образов → ${OUT}`);
