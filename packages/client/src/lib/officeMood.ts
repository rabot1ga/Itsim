/**
 * Настроение офисного дня (docs/design.md §11). Жило в iso-сцене
 * (`components/iso/officeMood.ts`) и управляло её перекраской; после снятия
 * iso-сцены (фаза 3, 22.10.2026) показывается строкой в карточке офиса.
 */
export type OfficeMood = 'normal' | 'deadline' | 'friday' | 'night' | 'retro';

export interface OfficeMoodInput {
  currentDay: number;
  energy: number;
  maxEnergy: number;
  motivation: number;
}

export function officeMoodOf(input: OfficeMoodInput): OfficeMood {
  const { currentDay, energy, maxEnergy, motivation } = input;
  if (energy <= Math.max(2, Math.round((maxEnergy || 16) * 0.15))) return 'night';
  if (motivation < 30) return 'deadline';
  if (currentDay % 7 === 0) return 'friday';
  if (currentDay % 7 === 3) return 'retro';
  return 'normal';
}

export const OFFICE_MOOD_META: Record<OfficeMood, { emoji: string; label: string }> = {
  normal: { emoji: '💼', label: 'обычный день' },
  deadline: { emoji: '🔥', label: 'под дедлайном' },
  friday: { emoji: '🎉', label: 'пятница' },
  night: { emoji: '🌙', label: 'ночь у монитора' },
  retro: { emoji: '📼', label: 'ретро-вечер' },
};
