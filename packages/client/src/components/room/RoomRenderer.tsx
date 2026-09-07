import React from 'react';
import { LayerManifest, GeneticTraits, GeneticsConfig } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';
import { ProceduralAvatar } from './ProceduralAvatar';
import { PixelAvatar } from './PixelAvatar';
import { PixelAvatarData } from './pixelAvatar';

/**
 * Layered procedural room — DESIGN.md sections 1-2.
 * Fixed slots (bg/window/decor/desk/chair/setup/atmosphere/pet) stacked
 * by zOrder. Owned items and cross-collection bonuses override slots.
 */
export const RoomRenderer: React.FC<{
  roomManifest: LayerManifest;
  avatarManifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  housingLevel: number;
  composition: Composition;
  /** when a pixel pack is loaded, it replaces the layered avatar in the room */
  pixelAvatar?: PixelAvatarData | null;
}> = ({ roomManifest, avatarManifest, traits, geneticsConfig, housingLevel, composition, pixelAvatar }) => {
  const layers = buildLayerStack(roomManifest, composition, traits, geneticsConfig);

  return (
    <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
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

      {/* The avatar stands in front of the desk */}
      <div className="absolute left-[8%] bottom-[16%] w-[34%]">
        {pixelAvatar ? (
          <PixelAvatar data={pixelAvatar} scale={8} className="rounded-lg" background="transparent" />
        ) : (
          <ProceduralAvatar
            manifest={avatarManifest}
            traits={traits}
            geneticsConfig={geneticsConfig}
            compositionOverrides={composition.avatarAccessory ? { accessory: composition.avatarAccessory } : undefined}
          />
        )}
      </div>

      {/* Housing level badge */}
      <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/50 text-[10px] text-slate-300 font-mono">
        жильё {housingLevel}/4
      </div>
    </div>
  );
};

/**
 * Build the room composition from player state (owned items, cross-collection
 * bonuses, genetics). Kept pure for the share-card canvas renderer.
 */
export function buildRoomComposition(opts: {
  traits: GeneticTraits;
  housingLevel: number;
  items: string[];
  crossLayers: { layerId: string; slotId: string }[];
}): Composition {
  const { traits, housingLevel, items, crossLayers } = opts;

  const itemLayer = (...ids: string[]) => ids.find((id) => items.includes(id));

  // desk: housing level
  const desks = ['desk_parata', 'desk_ikea', 'desk_office', 'desk_standing', 'desk_rgb'];
  // chair: owned item first, otherwise housing-based default
  let chair = 'chair_stool';
  if (housingLevel >= 1) chair = 'chair_office';
  if (itemLayer('herman_miller')) chair = 'chair_herman_miller';
  else if (itemLayer('gaming_chair')) chair = 'chair_gaming';
  else if (itemLayer('office_chair')) chair = 'chair_office';

  // setup: owned pc
  let setup = 'setup_laptop';
  if (itemLayer('macbook')) setup = 'setup_macbook';
  else if (itemLayer('gaming_pc')) setup = 'setup_gaming';
  else if (itemLayer('cheap_pc', 'mechanical_keyboard')) setup = 'setup_monitor';

  // atmosphere
  let atmosphere: string | null = null;
  if (itemLayer('desk_plant')) atmosphere = 'atmo_cactus';
  else if (itemLayer('coffee_maker')) atmosphere = 'atmo_coffee';
  else if (housingLevel >= 1) atmosphere = 'atmo_rug';

  // cross-collection layers
  const crossBySlot: Record<string, string | null> = {};
  for (const { layerId, slotId } of crossLayers) {
    crossBySlot[slotId] = crossBySlot[slotId] ?? layerId;
  }

  // owned pets (cross-collection skins take priority)
  let pet = crossBySlot.pet ?? null;
  if (!pet) {
    const petIds = ['pet_bulldog', 'pet_cat', 'pet_dog', 'pet_cactus', 'pet_robo', 'pet_spider'];
    for (const pid of petIds) {
      if (items.includes(pid)) {
        pet = pid;
        break;
      }
    }
  }

  const composition: Composition = {
    bg: `bg_${Math.min(4, Math.max(0, housingLevel))}`,
    window: traits.windowShape,
    decor: crossBySlot.decor ?? traits.decor,
    desk: desks[Math.min(4, Math.max(0, housingLevel))],
    chair,
    setup,
    atmosphere,
    pet,
  };

  // Avatar accessory override from owned headphones
  composition.avatarAccessory = itemLayer('sony_headphones', 'cheap_headphones')
    ? 'acc_headphones'
    : null;

  return composition;
}
