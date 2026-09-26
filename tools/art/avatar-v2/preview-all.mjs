#!/usr/bin/env node
/**
 * QA-превью посадки: каждый слой поверх тела — так видно, где артефакт сел
 * не на место (глаза шире лица, борода на воротнике, хохолок вместо причёски).
 *
 *   node tools/art/avatar-v2/preview-all.mjs [--layers=<dir>] [--out=<file.png>]
 */
import sharp from 'sharp';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

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
const OUT = opt('out', join(HERE, 'artifacts', 'preview-all.png'));
const [CW, CH] = [500, 760];
const COLS = 6;
const GAP = 6;

const blank = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 20, b: 24, alpha: 1 } } });

const files = (await readdir(DIR)).filter((f) => f.endsWith('.webp') && f !== 'body_base.webp').sort();
const body = await sharp(join(DIR, 'body_base.webp')).ensureAlpha().png().toBuffer();
const comps = [];
for (let i = 0; i < files.length; i++) {
  const layer = await sharp(join(DIR, files[i])).ensureAlpha().png().toBuffer();
  const tile = await blank(CW, CH)
    .composite([{ input: body }, { input: layer }])
    .png()
    .toBuffer();
  comps.push({
    input: tile,
    left: GAP + (i % COLS) * (CW + GAP),
    top: GAP + Math.floor(i / COLS) * (CH + GAP),
  });
}
const rows = Math.ceil(files.length / COLS);
await mkdir(dirname(OUT), { recursive: true });
await blank(COLS * CW + (COLS + 1) * GAP, rows * CH + (rows + 1) * GAP)
  .composite(comps)
  .png()
  .toFile(OUT);
console.log(`✓ ${files.length} слоёв поверх тела → ${OUT}`);
