import { t } from './i18n';
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
export const OFFICE_MOOD_META: Record<
  OfficeMood,
  {
    icon: string;
    label: string;
  }
> = {
  normal: { icon: 'briefcase', label: t('обычный день') },
  deadline: { icon: 'flame', label: t('под дедлайном') },
  friday: { icon: 'star', label: t('пятница') },
  night: { icon: 'moon', label: t('ночь у монитора') },
  retro: { icon: 'play', label: t('ретро-вечер') },
};
