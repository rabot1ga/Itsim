/**
 * Скины питомца в комнате (роадмап «Скины и позиции питомца в комнате»).
 *
 * Вид — эмоудзи по виду питомца (pixel-портреты — отдельным батчем позже,
 * НЕ сейчас); аксессуары (бант/корона/очки) вешаются бейджем, если куплены.
 */
export const PET_SKIN_EMOJI: Record<string, string> = {
  pet_cat: '🐱',
  pet_dog: '🐶',
  pet_cactus: '🌵',
  pet_robo: '🤖',
  pet_spider: '🕷️',
  pet_bulldog: '🐶',
  pet_parrot: '🦜',
  pet_hamster: '🐹',
  pet_fish: '🐟',
};

/** Аксессуары-украшения: не питомцы, но на сцене видны бейджем. */
export const PET_ACCESSORY_BADGE: Record<string, string> = {
  pet_bow: '🎀',
  pet_crown: '👑',
  pet_glasses: '🕶️',
};

export function petEmoji(skin: string | null | undefined): string | null {
  return (skin && PET_SKIN_EMOJI[skin]) || null;
}

/** Бейджи купленных аксессуаров поверх эмодзи питомца. */
export function petBadges(owned: readonly string[]): string[] {
  return Object.entries(PET_ACCESSORY_BADGE)
    .filter(([id]) => owned.includes(id))
    .map(([, badge]) => badge);
}
