import React, { useEffect, useMemo, useState } from 'react';
import { layout, viewport, SpriteMeta, PlacedItem } from './geometry';
import { buildRoomScene, characterSprite, ScenePlayer } from './scene';
import { shellPolygons, pointsAttr } from './shell';

/**
 * Isometric room — the player's flat, drawn from generated pixel sprites.
 *
 * The whole scene is one inline SVG: the shell (floor + two walls) is polygons
 * the code computes, the furniture is `<image>` sprites placed on the tile grid
 * and painted back-to-front. An SVG viewBox scales to any screen for free, and
 * `image-rendering: pixelated` keeps every sprite crisp instead of soapy.
 */

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

export const IsoRoom: React.FC<{
  player: ScenePlayer;
  /** sprite id for the player figure; defaults to the wardrobe match */
  character?: string;
  className?: string;
  /** extra sprites (pets, events) placed on free tiles by the caller */
  extras?: PlacedItem[];
}> = ({ player, character, className, extras }) => {
  const manifest = useIsoManifest();

  const view = useMemo(() => {
    if (!manifest) return null;
    const scene = buildRoomScene(player);
    const vp = viewport(scene.size, manifest.tile);
    const polys = shellPolygons(vp, scene.size, scene.palette, manifest.tile);
    const items: PlacedItem[] = [
      ...scene.items,
      ...(extras ?? []),
      {
        kind: 'char',
        sprite: character ?? characterSprite(player),
        gx: scene.player.gx,
        gy: scene.player.gy,
        tiles: [1, 1],
      },
    ];
    return { vp, polys, calls: layout(vp, items, manifest.sprites, manifest.tile) };
  }, [manifest, player, character, extras]);

  if (!view) {
    return (
      <div
        className={`w-full rounded-xl border border-ink-700 bg-ink-800 animate-pulse-soft ${className ?? ''}`}
        style={{ aspectRatio: '4 / 3' }}
      />
    );
  }

  const { vp, polys, calls } = view;

  return (
    <svg
      viewBox={`0 0 ${vp.width} ${vp.height}`}
      className={`w-full rounded-xl border border-ink-700 bg-ink-900 ${className ?? ''}`}
      style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}
      role="img"
      aria-label="Комната игрока"
    >
      {polys.map((p, i) => (
        <polygon key={i} points={pointsAttr(p.points)} fill={p.fill} opacity={p.opacity} />
      ))}
      {calls.map((c, i) => (
        <image
          key={`${c.sprite}-${i}`}
          href={manifest!.sprites[c.sprite].file}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          style={{ imageRendering: 'pixelated' }}
          transform={c.flip ? `translate(${2 * c.x + c.w} 0) scale(-1 1)` : undefined}
        />
      ))}
    </svg>
  );
};
