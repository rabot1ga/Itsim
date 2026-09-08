import React from 'react';

/**
 * Isometric sprite as a menu icon.
 *
 * The rooms are built from ~100 hand-generated sprites; the menus should be
 * built from the same ones. A shop row that shows the actual chair you are
 * about to buy — the one that will appear in your room — beats any emoji or
 * generic glyph, and it costs nothing: the PNG is already in the app.
 *
 * Note the deliberate lack of `image-rendering: pixelated` here: a 130px bed
 * squeezed into a 44px icon has to lose pixels, and dropping every third row
 * eats the outlines. Smooth downscaling keeps the silhouette readable; inside
 * the room, where sprites are drawn at or above 1:1, pixelated is still on.
 */

export const IsoIcon: React.FC<{
  /** sprite id from /iso/manifest.json */
  sprite: string;
  /** box side in px; the sprite is contained inside it */
  size?: number;
  className?: string;
}> = ({ sprite, size = 44, className = '' }) => (
  <img
    src={`/iso/${sprite}.png`}
    alt=""
    aria-hidden="true"
    draggable={false}
    loading="lazy"
    className={`select-none ${className}`}
    style={{
      width: size,
      height: size,
      objectFit: 'contain',
      objectPosition: 'center bottom',
      imageRendering: 'auto',
    }}
  />
);

/**
 * Which drawing stands for which shop item. Ids on the left are content items
 * (packages/content/items.json), on the right sprites the room renderer uses,
 * so buying the thing puts *that* drawing into the room.
 */
export const ITEM_SPRITE: Record<string, string> = {
  dorm: 'bed',
  cheap_pc: 'desk_wood',
  gaming_pc: 'desk_dual',
  macbook: 'laptop_table',
  office_chair: 'chair_office',
  gaming_chair: 'chair_gaming',
  herman_miller: 'chair_gaming',
  coffee_maker: 'coffee_machine',
  gym_subscription: 'dumbbells',
  desk_plant: 'plant_monstera',
  mechanical_keyboard: 'laptop_table',
  cheap_headphones: 'arcade',
  sony_headphones: 'arcade',
  study_stepik: 'bookshelf',
  study_course: 'bookshelf',
  study_advanced_course: 'whiteboard',
  study_mentor: 'presentation_board',
  mining_gpu: 'pc_tower',
  mining_rig: 'server_rack',
  mining_asic: 'server_rack',
  solar_panel: 'window',
  pet_cat: 'pet_cat',
  pet_dog: 'pet_dog',
  pet_bulldog: 'pet_bulldog',
  pet_cactus: 'pet_cactus',
  pet_robo: 'pet_robo',
  pet_spider: 'pet_spider',
  pet_bow: 'pet_bed',
  pet_glasses: 'pet_bowl_full',
  pet_crown: 'pet_bowl',
};

/** Fallback by item type, so a new item is never iconless. */
const TYPE_SPRITE: Record<string, string> = {
  pc: 'desk_dual',
  chair: 'chair_office',
  headphones: 'arcade',
  coffee: 'coffee_machine',
  pet: 'pet_cat',
  study: 'bookshelf',
  mining: 'server_rack',
  other: 'box',
};

/** The five homes, in the order the shop lists them. */
export const HOUSING_SPRITE = ['box_open', 'fridge', 'sofa', 'dining_table', 'palm'];

export function spriteForItem(id: string, type?: string): string {
  return ITEM_SPRITE[id] ?? (type ? TYPE_SPRITE[type] : undefined) ?? 'box';
}
