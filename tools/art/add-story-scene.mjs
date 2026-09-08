/** Add or refresh one story scene from a generated master.
 *
 * Usage: node tools/art/add-story-scene.mjs <id> /path/to/master.png
 *
 * The batch script (build-story-assets.mjs) packs the original 2026-09-08 atlas
 * in one go; this one exists for the scenes that arrive later, one at a time.
 * Masters stay out of the repo — only the 384×230 WebP and its manifest row
 * are committed, so `validate-story-assets.mjs` can still prove what shipped.
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const [id, master] = process.argv.slice(2);
if (!id || !master) throw new Error('Usage: node tools/art/add-story-scene.mjs <id> <master.png>');

const WIDTH = 384;
const HEIGHT = 230;
const manifestPath = 'packages/client/public/art/story-v1/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const output = join('packages/client/public/art/story-v1', `${id}.webp`);
await sharp(await readFile(master))
  .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
  .webp({ quality: 88 })
  .toFile(output);

const bytes = await readFile(output);
const meta = await sharp(bytes).metadata();
const row = {
  id,
  file: `/art/story-v1/${id}.webp`,
  width: meta.width,
  height: meta.height,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  source: basename(master),
  crop: { fit: 'cover', width: WIDTH, height: HEIGHT },
};
manifest.files = [...manifest.files.filter((f) => f.id !== id), row];

const masterSha = createHash('sha256')
  .update(await readFile(master))
  .digest('hex');
manifest.masters = [
  ...manifest.masters.filter((m) => m.name !== basename(master)),
  { name: basename(master), sha256: masterSha },
];

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${id}: ${meta.width}×${meta.height}, ${bytes.length} bytes`);
