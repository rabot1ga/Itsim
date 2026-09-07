import React from 'react';
import { LayerManifest, GeneticTraits, GeneticsConfig } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';

/**
 * Layered procedural avatar — DESIGN.md sections 1-2.
 * 500×500 layers stacked by manifest zOrder; grayscale layers tinted
 * via CSS filter from the player's genetic traits.
 */
export const ProceduralAvatar: React.FC<{
  manifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  className?: string;
  compositionOverrides?: Partial<Composition>;
}> = ({ manifest, traits, geneticsConfig, className, compositionOverrides }) => {
  const composition: Composition = {
    body: 'body_base',
    eyes: traits.eyeShape,
    hair: traits.hairStyle,
    beard: traits.beard,
    top: traits.top,
    accessory: traits.accessory,
    ...compositionOverrides,
  };

  const layers = buildLayerStack(manifest, composition, traits, geneticsConfig);

  return (
    <div className={`relative aspect-square overflow-hidden ${className ?? ''}`} aria-label="Аватар игрока">
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
