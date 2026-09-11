import React from 'react';
import { LayerManifest, GeneticTraits, GeneticsConfig, TintPaletteEntry } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';

/**
 * Layered procedural avatar — DESIGN.md sections 1-2.
 *
 * A full-body figure: the manifest declares the canvas (500×760), so the box
 * keeps the art's aspect ratio instead of assuming a square portrait.
 * Grayscale layers are tinted via CSS filter from the player's genetic traits.
 * `tintOverrides` (wardrobe hex picks, converted via hexToTint) override genetics.
 */
export const ProceduralAvatar: React.FC<{
  manifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  className?: string;
  compositionOverrides?: Partial<Composition>;
  tintOverrides?: Record<string, TintPaletteEntry> | null;
}> = ({ manifest, traits, geneticsConfig, className, compositionOverrides, tintOverrides }) => {
  const composition: Composition = {
    body: 'body_base',
    bottom: 'bottom_jeans',
    eyes: traits.eyeShape,
    hair: traits.hairStyle,
    beard: traits.beard,
    top: traits.top,
    accessory: traits.accessory,
    ...compositionOverrides,
  };

  const layers = buildLayerStack(manifest, composition, traits, geneticsConfig, tintOverrides);
  const { width = 500, height = 760 } = manifest.resolution ?? {};

  return (
    <div
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
          style={{ filter: layer.filter ?? 'none' }}
        />
      ))}
    </div>
  );
};
