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
  // Редкие с торговой площадки (роадмап «Деньги и рост»)
  pet_fox: '🦊',
  pet_owl: '🦉',
  pet_raccoon: '🦝',
  pet_turtle: '🐢',
  pet_cat_shadow: '🐈‍⬛',
  pet_dragon: '🐲',
};

/** Аксессуары-украшения: не питомцы, но на сцене видны бейджем. */
export const PET_ACCESSORY_BADGE: Record<string, string> = {
  pet_bow: '🎀',
  pet_crown: '👑',
  pet_glasses: '🕶️',
  // Эксклюзив Stars (мерч v2: живая косметика вместо мёртвых наград)
  pet_halo: '😇',
  pet_wings: '🪽',
  pet_visor: '🥽',
  pet_scarf: '🧣',
  // Сезонные наборы Stars (зима/лето)
  pet_santa: '🎅',
  pet_mitten: '🧤',
  pet_snowflake: '❄️',
  pet_flower: '🌸',
  pet_icecream: '🍦',
  pet_sun: '🌞',
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

/**
 * Анимация питомца в комнате (роадмап «Анимации питомца idle/sleep/happy»):
 * состояние выводится из игрового — энергии (спит на нуле) и кормления
 * (сытый — счастливый), иначе спокойное покачивание.
 */
export type PetAnim = 'idle' | 'happy' | 'sleep';
export function petAnimState(player: { energy?: number; petFedToday?: boolean }): PetAnim {
  if ((player.energy ?? 1) <= 0) return 'sleep';
  if (player.petFedToday) return 'happy';
  return 'idle';
}
