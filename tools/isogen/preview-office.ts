/**
 * isogen · office preview
 *
 * Same idea as preview.ts, for workplaces: renders the four company kinds with
 * their crews so the office art can be reviewed without a browser.
 *
 * Usage: npx tsx tools/isogen/preview-office.ts [outFile] [--scale 2]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, viewport, SpriteMeta, PlacedItem } from '../../packages/client/src/components/iso/geometry';
import { shellPolygons, pointsAttr } from '../../packages/client/src/components/iso/shell';
import { buildOfficeScene, OfficeInput } from '../../packages/client/src/components/iso/office';
import { characterLook } from '../../packages/client/src/components/iso/palette';
import { buildColourMap, recolourPixels } from '../../packages/client/src/components/iso/recolor';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../../packages/client/public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'iso/manifest.json'), 'utf8')) as {
  sprites: Record<string, SpriteMeta>;
};

const out = process.argv[2]?.startsWith('--') ? '/tmp/iso/offices.png' : process.argv[2] ?? '/tmp/iso/offices.png';
const si = process.argv.indexOf('--scale');
const SCALE = si === -1 ? 2 : Number(process.argv[si + 1]);

const CASES: OfficeInput[] = [
  { companySize: 'startup', companyId: 'garage-co', teamSize: 2 },
  { companySize: 'outsource', companyId: 'outsource-co', teamSize: 4 },
  { companySize: 'product', companyId: 'product-co', teamSize: 4 },
  { companySize: 'enterprise', companyId: 'corp-co', teamSize: 6 },
];

async function spriteBuffer(
  sprite: string,
  colours: Record<string, string> | undefined,
  flip: boolean,
  shear: -1 | 0 | 1 = 0
) {
  const meta = manifest.sprites[sprite];
  let img = sharp(path.join(PUBLIC, meta.file));
  if (colours && meta.roles) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    recolourPixels(data, buildColourMap(meta.roles, colours));
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  if (flip) img = img.flop();
  // shear head-on wall art into the wall plane, like spriteTransform() does in
  // the browser; sharp grows the canvas, the caller lifts it back by w/4
  if (shear) img = img.affine([1, 0, shear * 0.5, 1], { interpolator: 'nearest', background: '#00000000' });
  return img.png().toBuffer();
}

async function render(input: OfficeInput) {
  const scene = buildOfficeScene(input);
  const vp = viewport(scene.size);
  const polys = shellPolygons(vp, scene.size, scene.palette);
  const look = characterLook({ fallbackSeed: `${input.companyId}:me` });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.width}" height="${vp.height}" shape-rendering="crispEdges">
${polys
  .map((p) => `<polygon points="${pointsAttr(p.points)}" fill="${p.fill}"${p.opacity ? ` opacity="${p.opacity}"` : ''}/>`)
  .join('\n')}
</svg>`;

  const items: PlacedItem[] = [
    ...scene.items,
    ...scene.crew,
    { kind: 'char', sprite: look.base, gx: scene.player.gx, gy: scene.player.gy, tiles: [1, 1], colours: look.colours },
  ];

  const composites = [];
  for (const call of layout(vp, items, manifest.sprites)) {
    composites.push({
      input: await spriteBuffer(call.sprite, call.colours, call.flip, call.shear ?? 0),
      left: call.x,
      top: call.y - (call.shear ? Math.round(call.w / 4) : 0),
    });
  }
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buf: await sharp(base).composite(composites).png().toBuffer(), w: vp.width, h: vp.height };
}

const rendered = await Promise.all(CASES.map(render));
const cellW = Math.max(...rendered.map((r) => r.w)) + 8;
const cellH = Math.max(...rendered.map((r) => r.h)) + 8;
const COLS = 2;

const sheet = await sharp({
  create: {
    width: cellW * COLS * SCALE,
    height: cellH * Math.ceil(rendered.length / COLS) * SCALE,
    channels: 4,
    background: { r: 17, g: 21, b: 28, alpha: 1 },
  },
})
  .composite(
    await Promise.all(
      rendered.map(async (r, i) => ({
        input: await sharp(r.buf).resize(r.w * SCALE, r.h * SCALE, { kernel: 'nearest' }).png().toBuffer(),
        left: (cellW * (i % COLS) + 4) * SCALE,
        top: (cellH * Math.floor(i / COLS) + 4) * SCALE,
      }))
    )
  )
  .png()
  .toFile(out);

console.log('wrote', out, sheet.width + '×' + sheet.height);
