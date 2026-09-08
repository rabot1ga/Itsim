import React, { useEffect, useMemo, useRef, useState } from 'react';
import { layout, viewport, spriteTransform, DrawCall, SpriteMeta, PlacedItem } from './geometry';
import { buildRoomScene, ScenePlayer } from './scene';
import { shellPolygons, pointsAttr } from './shell';
import { characterLook, petLook } from './palette';
import { recolourSprite, variantKey } from './recolor';
import { useRenderMode } from './useRenderMode';

/**
 * Isometric room — the player's flat, drawn from generated pixel sprites.
 *
 * The whole scene is one inline SVG: the shell (floor + two walls) is polygons
 * the code computes, the furniture is `<image>` sprites placed on the tile grid
 * and painted back-to-front. An SVG viewBox scales to any screen for free, and
 * `image-rendering: pixelated` keeps every sprite crisp instead of soapy.
 *
 * Sprites that carry colour roles (the player, the pets) are recoloured on a
 * canvas first, so one drawing covers thousands of different looks.
 */


/** Which sprites are the animal itself (and so get a coat colour). */
const CREATURE = /^pet_(cat|dog|bulldog|cactus|robo|spider|parrot|fish|hamster)(_|$)/;

export interface IsoManifest {
  tile: { w: number; h: number; wallH: number };
  sprites: Record<string, SpriteMeta>;
}

let manifestCache: IsoManifest | null = null;
let manifestPromise: Promise<IsoManifest | null> | null = null;

export function useIsoManifest(): IsoManifest | null {
  const [manifest, setManifest] = useState<IsoManifest | null>(manifestCache);

  useEffect(() => {
    if (manifestCache) return;
    if (!manifestPromise) {
      manifestPromise = fetch('/iso/manifest.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    let alive = true;
    manifestPromise.then((m) => {
      if (!alive) return;
      if (m) manifestCache = m;
      setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return manifest;
}

/**
 * Resolve every recoloured sprite in the scene to a data URL. Until a variant
 * is ready the original file is drawn, so the room never flashes empty.
 */
export function useSpriteVariants(calls: DrawCall[], sprites: Record<string, SpriteMeta>): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const wanted = useMemo(
    () =>
      calls
        .filter((c) => c.colours && sprites[c.sprite]?.roles)
        .map((c) => ({ key: variantKey(sprites[c.sprite].file, c.colours!), call: c })),
    [calls, sprites]
  );

  const signature = wanted.map((w) => w.key).join('|');

  useEffect(() => {
    let alive = true;
    Promise.all(
      wanted.map(async ({ key, call }) => {
        const meta = sprites[call.sprite];
        const url = await recolourSprite(meta.file, meta.roles!, call.colours!);
        return [key, url] as const;
      })
    ).then((pairs) => {
      if (!alive) return;
      setUrls((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [key, url] of pairs) {
          if (next[key] !== url) {
            next[key] = url;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      alive = false;
    };
    // `signature` captures every variant this scene needs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls;
}

export const IsoRoom: React.FC<{
  player: ScenePlayer;
  /** override the sprite chosen for the player figure */
  character?: string;
  className?: string;
  /** extra sprites (events, guests) placed on free tiles by the caller */
  extras?: PlacedItem[];
}> = ({ player, character, className, extras }) => {
  const manifest = useIsoManifest();

  const view = useMemo(() => {
    if (!manifest) return null;
    const scene = buildRoomScene(player, manifest.sprites, manifest.tile);
    const vp = viewport(scene.size, manifest.tile);
    const polys = shellPolygons(vp, scene.size, scene.palette, manifest.tile);

    const p = player as { genetics?: { seed?: string }; telegramId?: number | string };
    const look = characterLook({
      genetics: (player as { genetics?: never }).genetics,
      avatar: (player as { avatar?: never }).avatar ?? null,
      fallbackSeed: String(p.telegramId ?? 'player'),
    });
    const seed = p.genetics?.seed ?? String(p.telegramId ?? 'player');

    const items: PlacedItem[] = [
      ...scene.items.map((item) =>
        item.kind !== 'wall' && CREATURE.test(item.sprite)
          ? { ...item, colours: petLook(seed, item.sprite.replace(/_(sleep|eat|play)$/, '')) }
          : item
      ),
      ...(extras ?? []),
      {
        kind: 'char',
        sprite: character ?? look.base,
        gx: scene.player.gx,
        gy: scene.player.gy,
        tiles: [1, 1],
        colours: look.colours,
      },
    ];

    return { vp, polys, calls: layout(vp, items, manifest.sprites, manifest.tile) };
  }, [manifest, player, character, extras]);

  const variants = useSpriteVariants(view?.calls ?? [], manifest?.sprites ?? {});
  const svgRef = useRef<SVGSVGElement>(null);
  const rendering = useRenderMode(svgRef, view?.vp.width ?? 0);

  if (!view || !manifest) {
    return (
      <div
        className={`w-full border-2 border-ink-700 bg-ink-800 animate-pulse-soft ${className ?? ''}`}
        style={{ aspectRatio: '4 / 3' }}
      />
    );
  }

  const { vp, polys, calls } = view;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vp.width} ${vp.height}`}
      className={`w-full border-2 border-ink-700 bg-ink-900 ${className ?? ''}`}
      style={{ imageRendering: rendering, shapeRendering: 'crispEdges' }}
      role="img"
      aria-label="Комната игрока"
    >
      {polys.map((p, i) => (
        <polygon key={i} points={pointsAttr(p.points)} fill={p.fill} opacity={p.opacity} />
      ))}
      {calls.map((c, i) => {
        const meta = manifest.sprites[c.sprite];
        const href = c.colours ? variants[variantKey(meta.file, c.colours)] ?? meta.file : meta.file;
        return (
          <image
            key={`${c.sprite}-${i}`}
            href={href}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            style={{ imageRendering: rendering }}
            transform={spriteTransform(c)}
          />
        );
      })}
    </svg>
  );
};
