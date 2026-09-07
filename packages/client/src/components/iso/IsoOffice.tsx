import React, { useMemo } from 'react';
import { layout, viewport, PlacedItem } from './geometry';
import { shellPolygons, pointsAttr } from './shell';
import { buildOfficeScene, OfficeInput } from './office';
import { characterLook } from './palette';
import { variantKey } from './recolor';
import { useIsoManifest, useSpriteVariants } from './IsoRoom';

/**
 * The office, drawn with the same engine as the flat: code-drawn shell, sprite
 * furniture, recoloured people. The player stands among colleagues who each
 * have their own face and clothes, seeded from the company.
 */
export const IsoOffice: React.FC<{
  office: OfficeInput;
  /** the player, for their own look */
  player?: { genetics?: { seed?: string }; avatar?: unknown; telegramId?: number | string };
  className?: string;
}> = ({ office, player, className }) => {
  const manifest = useIsoManifest();

  const view = useMemo(() => {
    if (!manifest) return null;
    const scene = buildOfficeScene(office);
    const vp = viewport(scene.size, manifest.tile);
    const polys = shellPolygons(vp, scene.size, scene.palette, manifest.tile);

    const look = characterLook({
      genetics: player?.genetics as never,
      avatar: (player?.avatar as never) ?? null,
      fallbackSeed: String(player?.telegramId ?? 'player'),
    });

    const items: PlacedItem[] = [
      ...scene.items,
      ...scene.crew,
      {
        kind: 'char',
        sprite: look.base,
        gx: scene.player.gx,
        gy: scene.player.gy,
        tiles: [1, 1],
        colours: look.colours,
      },
    ];

    return { vp, polys, calls: layout(vp, items, manifest.sprites, manifest.tile) };
  }, [manifest, office, player]);

  const variants = useSpriteVariants(view?.calls ?? [], manifest?.sprites ?? {});

  if (!view || !manifest) {
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
      aria-label="Офис"
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
            style={{ imageRendering: 'pixelated' }}
            transform={c.flip ? `translate(${2 * c.x + c.w} 0) scale(-1 1)` : undefined}
          />
        );
      })}
    </svg>
  );
};
