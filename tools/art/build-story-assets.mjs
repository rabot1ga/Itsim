/** Pack generated masters without committing multi-megabyte intermediate files.
 * Usage: node tools/art/build-story-assets.mjs /path/to/generated-masters
 * Expects event-atlas.png (848x1264), room.png, portrait.png from this art batch.
 */
import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const source = process.argv[2];
if (!source) throw new Error('Pass a directory with generated image masters');
const output = resolve('packages/client/public/art/story-v1');
await mkdir(output, { recursive: true });
const scenes = ['night', 'pet', 'bicycle', 'offer', 'social', 'shop', 'server', 'parcel', 'rest', 'bug'];
// Visually reviewed white gutters are excluded, not included in the game art.
const columns = [
  [12, 417],
  [430, 835],
];
const rows = [
  [9, 251],
  [264, 505],
  [518, 757],
  [770, 1007],
  [1020, 1257],
];
const atlas = join(source, 'event-atlas.png');
const meta = await sharp(atlas).metadata();
if (meta.width !== 848 || meta.height !== 1264) throw new Error('This crop map requires the reviewed 848×1264 atlas');
const files = [];
async function save(id, image, master, crop) {
  const path = join(output, `${id}.webp`);
  await image.webp({ quality: 88 }).toFile(path);
  const bytes = await readFile(path);
  const info = await sharp(bytes).metadata();
  files.push({
    id,
    file: `/art/story-v1/${id}.webp`,
    width: info.width,
    height: info.height,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source: master,
    ...(crop ? { crop } : {}),
  });
}
for (const [index, id] of scenes.entries()) {
  const [left, right] = columns[index % 2];
  const [top, bottom] = rows[Math.floor(index / 2)];
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  await save(
    id,
    sharp(atlas).extract(crop).resize(384, 230, { fit: 'cover', kernel: 'nearest' }),
    'event-atlas.png',
    crop
  );
}
await save('room', sharp(join(source, 'room.png')).resize(640, 480, { fit: 'cover', kernel: 'nearest' }), 'room.png');
await save('portrait', sharp(join(source, 'portrait.png')).resize(128, 128, { kernel: 'nearest' }), 'portrait.png');
const masters = [];
for (const name of ['event-atlas.png', 'room.png', 'portrait.png']) {
  const bytes = await readFile(join(source, name));
  masters.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      created: '2026-09-08',
      provenance: 'AI-generated with user references for art direction; not crops of reference PNGs',
      masters,
      files,
    },
    null,
    2
  ) + '\n'
);
console.log(`Packed ${files.length} assets: ${files.reduce((n, f) => n + f.bytes, 0)} bytes`);
