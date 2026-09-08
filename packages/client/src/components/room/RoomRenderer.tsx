import React from 'react';
import { LayerManifest, GeneticTraits, GeneticsConfig, AvatarCustomization } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';
import { ProceduralAvatar } from './ProceduralAvatar';
import { PixelIcon } from '../pixel/PixelIcon';

/**
 * Layered procedural room — DESIGN.md sections 1-2.
 *
 * The player is drawn full-body, standing on the floor in the same vector style
 * as the furniture. The 32×32 pixel bust is a portrait and lives in the
 * identity card (PixelIdentity), not in the room.
 * Fixed slots (bg/window/decor/desk/chair/setup/atmosphere/pet) stacked
 * by zOrder. Owned items and cross-collection bonuses override slots.
 */
/** One head slot: the fanciest owned accessory wins */
function petAccessory(wear?: string[]): string | null {
  if (!wear || wear.length === 0) return null;
  if (wear.includes('pet_crown')) return '👑';
  if (wear.includes('pet_glasses')) return '🕶️';
  if (wear.includes('pet_bow')) return '🎀';
  return null;
}

export const RoomRenderer: React.FC<{
  roomManifest: LayerManifest;
  avatarManifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  housingLevel: number;
  composition: Composition;
  /** wardrobe overrides for the layered avatar */
  avatarCustom?: AvatarCustomization | null;
  /** owned pet accessory item ids (pet_bow / pet_glasses / pet_crown) */
  petWear?: string[];
  /** pet was fed today → happy bubble */
  petFed?: boolean;
}> = ({ roomManifest, avatarManifest, traits, geneticsConfig, housingLevel, composition, avatarCustom, petWear, petFed }) => {
  const layers = buildLayerStack(roomManifest, composition, traits, geneticsConfig);

  // Wardrobe wins; owned headphones still auto-equip when the slot is untouched.
  const avatarOverrides: Record<string, string> = {
    ...(avatarCustom?.hair ? { hair: avatarCustom.hair } : {}),
    ...(avatarCustom?.beard ? { beard: avatarCustom.beard } : {}),
    ...(avatarCustom?.top ? { top: avatarCustom.top } : {}),
    ...(avatarCustom?.bottom ? { bottom: avatarCustom.bottom } : {}),
  };
  const accessory = avatarCustom?.accessory ?? composition.avatarAccessory;
  if (accessory) avatarOverrides.accessory = accessory;

  return (
    <div className="relative w-full aspect-square overflow-hidden border-2 border-ink-700 bg-ink-800">
      {layers.map((layer) => (
        <img
          key={layer.slotId}
          src={layer.file}
          alt=""
          draggable={false}
          className={`absolute inset-0 w-full h-full select-none ${layer.slotId === 'pet' ? 'animate-pet-bob' : ''}`}
          style={{ filter: layer.filter ?? 'none' }}
        />
      ))}

      {/* Pet accessories + mood bubble (pets live at ~x88% y70% of the canvas) */}
      {composition.pet && composition.pet !== 'pet_none' && (
        <>
          {petAccessory(petWear) && (
            <span className="absolute left-[79%] top-[53%] text-2xl select-none">
              {petAccessory(petWear)}
            </span>
          )}
          {petFed && (
            <PixelIcon
              name="heart"
              size={10}
              title="Питомец сыт"
              className="absolute left-[88%] top-[61%] text-moss-300"
            />
          )}
        </>
      )}

      {/* The player stands on the floor, next to the desk */}
      <div className="absolute left-[6%] bottom-[5%] w-[38%]">
        <ProceduralAvatar
          manifest={avatarManifest}
          traits={traits}
          geneticsConfig={geneticsConfig}
          compositionOverrides={avatarOverrides}
        />
      </div>

      {/* Housing level badge */}
      <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-[10px] text-ink-300 font-mono">
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
  /** room editor overrides (custom > cross-collection > automatic) */
  custom?: { slots?: Record<string, string | null>; wallColor?: string };
}): Composition {
  const { traits, housingLevel, items, crossLayers, custom } = opts;

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

  // Room editor: explicit player choice wins over everything automatic
  if (custom?.slots) {
    for (const [slotId, entryId] of Object.entries(custom.slots)) {
      if (entryId) composition[slotId] = entryId;
    }
  }

  return composition;
}
