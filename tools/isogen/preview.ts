/**
 * isogen · preview
 *
 * Renders the isometric room straight from the game's own scene code into a
 * PNG, so the room can be reviewed without a browser. It imports the same
 * geometry/scene/shell modules the app uses — if the preview looks right, the
 * app looks right.
 *
 * Usage: npx tsx tools/isogen/preview.ts [outFile] [--scale 3]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, viewport, SpriteMeta } from '../../packages/client/src/components/iso/geometry';
import { buildRoomScene, ScenePlayer } from '../../packages/client/src/components/iso/scene';
import { shellPolygons, pointsAttr } from '../../packages/client/src/components/iso/shell';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../../packages/client/public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'iso/manifest.json'), 'utf8')) as {
  sprites: Record<string, SpriteMeta>;
};

const out = process.argv[2] ?? '/tmp/iso/room.png';
const scaleArg = process.argv.indexOf('--scale');
const SCALE = scaleArg === -1 ? 3 : Number(process.argv[scaleArg + 1]);

/** Four sample players, from a dorm bed to a penthouse. */
const CASES: Array<{ label: string; player: ScenePlayer }> = [
  { label: 'общага', player: { housingLevel: 0, items: [] } },
  {
    label: 'однушка',
    player: { housingLevel: 1, items: ['office_chair', 'cheap_pc', 'desk_plant'], skills: { js: { level: 22 } } },
  },
  {
    label: 'центр',
    player: {
      housingLevel: 2,
      items: ['gaming_chair', 'gaming_pc', 'desk_plant', 'pet_cat'],
      skills: { js: { level: 25 }, ts: { level: 20 } },
    },
  },
  {
    label: 'пентхаус',
    player: {
      housingLevel: 4,
      items: ['herman_miller', 'macbook', 'gaming_pc', 'desk_plant', 'pet_dog', 'mining_rig'],
      skills: { js: { level: 30 }, ts: { level: 30 } },
    },
  },
];

async function renderRoom(player: ScenePlayer): Promise<{ buf: Buffer; w: number; h: number }> {
  const scene = buildRoomScene(player);
  const vp = viewport(scene.size);
  const polys = shellPolygons(vp, scene.size, scene.palette);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.width}" height="${vp.height}" shape-rendering="crispEdges">
${polys
  .map((p) => `<polygon points="${pointsAttr(p.points)}" fill="${p.fill}"${p.opacity ? ` opacity="${p.opacity}"` : ''}/>`)
  .join('\n')}
</svg>`;

  const items = [...scene.items, {
    kind: 'char' as const,
    sprite: 'char_base',
    gx: scene.player.gx,
    gy: scene.player.gy,
    tiles: [1, 1] as [number, number],
  }];
  const calls = layout(vp, items, manifest.sprites);

  const composites = [];
  for (const call of calls) {
    const meta = manifest.sprites[call.sprite];
    let img = sharp(path.join(PUBLIC, meta.file));
    if (call.flip) img = img.flop();
    composites.push({ input: await img.png().toBuffer(), left: call.x, top: call.y });
  }

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const composed = await sharp(buf).composite(composites).png().toBuffer();
  return { buf: composed, w: vp.width, h: vp.height };
}

const rendered = await Promise.all(CASES.map((c) => renderRoom(c.player)));
const cellW = Math.max(...rendered.map((r) => r.w)) + 8;
const cellH = Math.max(...rendered.map((r) => r.h)) + 8;

const sheet = await sharp({
  create: {
    width: cellW * rendered.length * SCALE,
    height: cellH * SCALE,
    channels: 4,
    background: { r: 17, g: 21, b: 28, alpha: 1 },
  },
})
  .composite(
    await Promise.all(
      rendered.map(async (r, i) => ({
        input: await sharp(r.buf)
          .resize(r.w * SCALE, r.h * SCALE, { kernel: 'nearest' })
          .png()
          .toBuffer(),
        left: (cellW * i + 4) * SCALE,
        top: 4 * SCALE,
      }))
    )
  )
  .png()
  .toFile(out);

console.log('wrote', out, sheet.width + '×' + sheet.height);
