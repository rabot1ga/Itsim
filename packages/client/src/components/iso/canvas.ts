import { layout, viewport, PlacedItem } from './geometry';
import { buildRoomScene, roomSeed, ScenePlayer } from './scene';
import { shellPolygons } from './shell';
import { characterLook, petLook } from './palette';
import { recolourSprite } from './recolor';
import { IsoManifest } from './IsoRoom';

/**
 * Painting the isometric room onto a 2D canvas.
 *
 * The app draws rooms as SVG, but the share card needs real pixels in a PNG.
 * Same scene, same sprites, same recolours — just a different surface, so a
 * shared card always matches what the player sees in the app.
 */

const CREATURE = /^pet_(cat|dog|bulldog|cactus|robo|spider|parrot|fish|hamster)(_|$)/;

let manifestPromise: Promise<IsoManifest | null> | null = null;

export function loadIsoManifest(): Promise<IsoManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch('/iso/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draw the player's room into `box`, scaled up by whole pixels so the art
 * stays sharp, and centred on the floor.
 */
export async function drawIsoRoom(
  ctx: CanvasRenderingContext2D,
  player: ScenePlayer,
  box: Box
): Promise<void> {
  const manifest = await loadIsoManifest();
  if (!manifest) return;

  const scene = buildRoomScene(player);
  const vp = viewport(scene.size, manifest.tile);
  const seed = roomSeed(player);
  const look = characterLook({
    genetics: player.genetics,
    avatar: (player as { avatar?: never }).avatar ?? null,
    fallbackSeed: seed,
  });

  const items: PlacedItem[] = [
    ...scene.items.map((item) =>
      item.kind !== 'wall' && CREATURE.test(item.sprite)
        ? { ...item, colours: petLook(seed, item.sprite) }
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

  const scale = Math.max(1, Math.floor(Math.min(box.w / vp.width, box.h / vp.height)));
  const offX = Math.round(box.x + (box.w - vp.width * scale) / 2);
  const offY = Math.round(box.y + (box.h - vp.height * scale) / 2);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const poly of shellPolygons(vp, scene.size, scene.palette, manifest.tile)) {
    ctx.beginPath();
    poly.points.forEach((p, i) => {
      const x = offX + p.x * scale;
      const y = offY + p.y * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.globalAlpha = poly.opacity ?? 1;
    ctx.fillStyle = poly.fill;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const call of layout(vp, items, manifest.sprites, manifest.tile)) {
    const meta = manifest.sprites[call.sprite];
    const src = call.colours && meta.roles ? await recolourSprite(meta.file, meta.roles, call.colours) : meta.file;
    let img: HTMLImageElement;
    try {
      img = await loadImage(src);
    } catch {
      continue;
    }
    const x = offX + call.x * scale;
    const y = offY + call.y * scale;
    const w = call.w * scale;
    const h = call.h * scale;
    if (call.flip) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
  }

  ctx.restore();
}
