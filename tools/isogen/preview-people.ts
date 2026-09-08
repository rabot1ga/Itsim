/**
 * isogen · people preview
 *
 * Renders a wall of characters straight out of `characterLook`, so the variety
 * the recolour engine produces can be eyeballed. Every figure here is the same
 * handful of drawings with different seeds.
 *
 * Usage: npx tsx tools/isogen/preview-people.ts [outFile] [--count 48] [--scale 3]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpriteMeta } from '../../packages/client/src/components/iso/geometry';
import { characterLook, petLook } from '../../packages/client/src/components/iso/palette';
import { buildColourMap, recolourPixels } from '../../packages/client/src/components/iso/recolor';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../../packages/client/public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'iso/manifest.json'), 'utf8')) as {
  sprites: Record<string, SpriteMeta>;
};

const arg = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? dflt : Number(process.argv[i + 1]);
};
const out = process.argv[2]?.startsWith('--') ? '/tmp/iso/people.png' : process.argv[2] ?? '/tmp/iso/people.png';
const COUNT = arg('--count', 48);
const SCALE = arg('--scale', 3);
const COLS = arg('--cols', 12);

async function figure(sprite: string, colours: Record<string, string>) {
  const meta = manifest.sprites[sprite];
  const { data, info } = await sharp(path.join(PUBLIC, meta.file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  recolourPixels(data, buildColourMap(meta.roles ?? {}, colours));
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(info.width * SCALE, info.height * SCALE, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

/** cell size follows the tallest character in the manifest, whatever the grid */
const cell =
  Math.round(
    Math.max(
      ...Object.values(manifest.sprites)
        .filter((m) => m.kind === 'char')
        .map((m) => Math.max(m.w, m.h))
    ) * 1.12
  ) * SCALE;
const petIds = ['pet_cat', 'pet_dog', 'pet_bulldog', 'pet_cactus', 'pet_robo', 'pet_spider'];

const people = await Promise.all(
  Array.from({ length: COUNT }, async (_, i) => {
    const look = characterLook({ fallbackSeed: `person-${i * 13 + 5}` });
    return figure(look.base, look.colours);
  })
);
const pets = await Promise.all(
  Array.from({ length: COLS }, async (_, i) => {
    const id = petIds[i % petIds.length];
    return figure(id, petLook(`pet-${i * 17}`, id));
  })
);

const rows = Math.ceil(people.length / COLS) + 1;
const sheet = await sharp({
  create: { width: COLS * cell, height: rows * cell, channels: 4, background: { r: 17, g: 21, b: 28, alpha: 1 } },
})
  .composite([
    ...people.map((input, i) => ({
      input,
      left: (i % COLS) * cell + Math.round(cell * 0.16),
      top: Math.floor(i / COLS) * cell + 4,
    })),
    ...pets.map((input, i) => ({
      input,
      left: i * cell + Math.round(cell * 0.16),
      top: (rows - 1) * cell + Math.round(cell * 0.2),
    })),
  ])
  .png()
  .toFile(out);

console.log('wrote', out, sheet.width + '×' + sheet.height);
