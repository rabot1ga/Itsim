/**
 * Пиксель-портреты питомцев (долг «pet pixel-portraits», 27.10.2026).
 *
 * `/art/pet-v1/<id>.png` (64×64 RGBA, пиксельная сетка). Генератор —
 * `tools/pet-portraits-gen.mjs` (детерминированный, перегенерация по команде).
 * Модуль НЕ трогает `petSkins.ts` (стилевые строки «как выглядит»): портреты —
 * новый слой поверх; для id без ассета комната падает обратно на эмодзи-скин.
 */

const BASE = '/art/pet-v1';

/** Все id с портретом — генератор держит их в синхроне с petSkins. */
export const PET_PORTRAITS = [
  'pet_cat',
  'pet_dog',
  'pet_cactus',
  'pet_robo',
  'pet_spider',
  'pet_bulldog',
  'pet_parrot',
  'pet_hamster',
  'pet_fish',
  'pet_fox',
  'pet_owl',
  'pet_raccoon',
  'pet_turtle',
  'pet_cat_shadow',
  'pet_dragon',
] as const;

export type PetPortraitId = (typeof PET_PORTRAITS)[number];

/** Путь к портрету или null, если ассета нет (комната использует эмодзи-скин). */
export function petPortrait(id: string | undefined): string | null {
  return id && (PET_PORTRAITS as readonly string[]).includes(id) ? `${BASE}/${id}.png` : null;
}
