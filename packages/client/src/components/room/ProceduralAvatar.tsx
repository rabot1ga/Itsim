import React, { useRef } from 'react';
import { AvatarCustomization, LayerManifest, GeneticTraits, GeneticsConfig, lookTintOverrides } from '@itsim/shared';
import { Composition, avatarComposition, buildLayerStack } from './layers';
import { useRenderMode } from '../../lib/useRenderMode';

/**
 * Layered procedural avatar — DESIGN.md sections 1-2.
 *
 * A full-body figure: the manifest declares the canvas (500×760), so the box
 * keeps the art's aspect ratio instead of assuming a square portrait.
 * Grayscale layers are tinted via CSS filter from the player's genetic traits.
 */
export const ProceduralAvatar: React.FC<{
  manifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  className?: string;
  compositionOverrides?: Partial<Composition>;
  /** Ручные цвета гардероба (тон кожи, цвет волос) — поверх генетики. */
  avatarCustom?: AvatarCustomization | null;
}> = ({ manifest, traits, geneticsConfig, className, compositionOverrides, avatarCustom }) => {
  // База — общая с гардеробом/профилем/карточкой (см. avatarComposition),
  // сюда только накладываются ручные переопределения; undefined = «слот не
  // тронут», он не должен зетириться в null.
  const overrides: Composition = {};
  for (const [slot, value] of Object.entries(compositionOverrides ?? {})) {
    if (value !== undefined) overrides[slot] = value;
  }
  const composition: Composition = { ...avatarComposition(null, traits), ...overrides };

  const layers = buildLayerStack(
    manifest,
    composition,
    traits,
    geneticsConfig,
    lookTintOverrides(avatarCustom ?? null)
  );
  const { width = 500, height = 760 } = manifest.resolution ?? {};

  const boxRef = useRef<HTMLDivElement>(null);
  // 500×760 исходник: на телефоне он уменьшается (там сглаживание и нужно),
  // на широком экране начинается увеличение — и только там включается nearest.
  const rendering = useRenderMode(boxRef, width);

  return (
    <div
      ref={boxRef}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      aria-label="Аватар игрока"
    >
      {layers.map((layer) => (
        <img
          key={layer.slotId}
          src={layer.file}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full select-none"
          style={{ filter: layer.filter ?? 'none', imageRendering: rendering }}
        />
      ))}
    </div>
  );
};
