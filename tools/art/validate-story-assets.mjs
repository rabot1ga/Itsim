import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const manifest = JSON.parse(await readFile('packages/client/public/art/story-v1/manifest.json', 'utf8'));
const count = manifest.files.length;
assert(count >= 12, 'Story manifest lost files');
assert.equal(new Set(manifest.files.map((f) => f.id)).size, count);
let total = 0;
for (const file of manifest.files) {
  assert(file.file.startsWith('/art/story-v1/') && !file.file.includes('..'));
  const bytes = await readFile(`packages/client/public${file.file}`);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width, file.width);
  assert.equal(meta.height, file.height);
  assert.equal(bytes.length, file.bytes);
  total += bytes.length;
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
assert(total < 400_000, 'Story asset budget exceeded');
console.log(`Validated ${count} generated assets, ${total} bytes, dimensions and SHA-256 match`);
