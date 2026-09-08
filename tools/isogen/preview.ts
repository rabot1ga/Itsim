/**
 * isogen · preview
 *
 * Renders isometric rooms straight from the game's own scene code into a PNG,
 * so the art can be reviewed without a browser. It imports the same
 * geometry/scene/shell/palette modules the app uses — including the recolour
 * engine — so if the preview looks right, the app looks right.
 *
 * Usage: npx tsx tools/isogen/preview.ts [outFile] [--scale 2] [--cols 4]
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, viewport, SpriteMeta, PlacedItem } from '../../packages/client/src/components/iso/geometry';
import { buildRoomScene, roomSeed, ScenePlayer } from '../../packages/client/src/components/iso/scene';
import { shellPolygons, pointsAttr } from '../../packages/client/src/components/iso/shell';
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
const out = process.argv[2]?.startsWith('--') ? '/tmp/iso/room.png' : process.argv[2] ?? '/tmp/iso/room.png';
const SCALE = arg('--scale', 2);
const COLS = arg('--cols', 4);

const ITEMS = [
  ['office_chair', 'cheap_pc'],
  ['gaming_chair', 'gaming_pc', 'desk_plant', 'pet_cat'],
  ['herman_miller', 'macbook', 'pet_dog', 'gym_subscription'],
  ['gaming_chair', 'gaming_pc', 'mining_rig', 'pet_spider'],
  ['office_chair', 'macbook', 'desk_plant', 'pet_bulldog'],
  ['herman_miller', 'gaming_pc', 'macbook', 'pet_robo', 'desk_plant'],
];

/** Eight different people in eight different flats. */
const CASES: ScenePlayer[] = Array.from({ length: 8 }, (_, i) => ({
  housingLevel: i % 5,
  items: ITEMS[i % ITEMS.length],
  skills: { a: { level: 8 + i * 4 }, b: { level: 6 + i * 3 } },
  genetics: { seed: `seed-${i * 7 + 3}` },
  petFedToday: i % 2 === 0,
}));

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

async function renderRoom(player: ScenePlayer) {
  const scene = buildRoomScene(player, manifest.sprites, manifest.tile as never);
  const vp = viewport(scene.size);
  const polys = shellPolygons(vp, scene.size, scene.palette);
  const seed = roomSeed(player);
  const look = characterLook({ genetics: player.genetics, fallbackSeed: seed });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.width}" height="${vp.height}" shape-rendering="crispEdges">
${polys
  .map((p) => `<polygon points="${pointsAttr(p.points)}" fill="${p.fill}"${p.opacity ? ` opacity="${p.opacity}"` : ''}/>`)
  .join('\n')}
</svg>`;

  const items: PlacedItem[] = [
    ...scene.items.map((item) =>
      item.kind !== 'wall' && /^pet_(cat|dog|bulldog|cactus|robo|spider)(_|$)/.test(item.sprite)
        ? { ...item, colours: petLook(seed, item.sprite.replace(/_(sleep|eat|play)$/, '')) }
        : item
    ),
    {
      kind: 'char',
      sprite: look.base,
      gx: scene.player.gx,
      gy: scene.player.gy,
      tiles: [1, 1],
      colours: look.colours,
    },
  ];

  const composites = [];
  for (const call of layout(vp, items, manifest.sprites)) {
    composites.push({
      input: await spriteBuffer(call.sprite, call.colours, call.flip, call.shear ?? 0),
      left: call.x,
      top: call.y - (call.shear ? Math.round(call.w / 4) : 0),
    });
  }

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buf: await sharp(buf).composite(composites).png().toBuffer(), w: vp.width, h: vp.height };
}

const rendered = await Promise.all(CASES.map(renderRoom));
const cellW = Math.max(...rendered.map((r) => r.w)) + 8;
const cellH = Math.max(...rendered.map((r) => r.h)) + 8;
const rows = Math.ceil(rendered.length / COLS);

const sheet = await sharp({
  create: {
    width: cellW * Math.min(COLS, rendered.length) * SCALE,
    height: cellH * rows * SCALE,
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
