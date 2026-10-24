import { t } from './i18n';
/**
 * Профиль как «карточка жизни» (решение 22.10.2026, вариант A): баннер рисует
 * того же протагониста, что story-v1 и финалы, в одном из трёх настроений.
 * Кастомизации и слоёв больше нет: настроение выводится из состояния —
 * энергии, мотивации и выгорания, — а не выбирается игроком.
 *
 * Портреты лежат в `public/art/profile/<настроение>.webp` (512×384, q82);
 * provenance арта — в `public/art/profile/README.md`.
 */
export const PROFILE_MOODS = ['normal', 'tired', 'burnout'] as const;
export type ProfileMood = (typeof PROFILE_MOODS)[number];
export interface ProfileMoodInput {
  energy: number;
  maxEnergy: number;
  motivation: number;
  burnoutDays?: number;
}
/**
 * Выгорание перекрывает всё: счётчик дней выгорания или обвал мотивации ниже
 * 25 — и портрет честно показывает выгоревшего героя. Дальше усталость:
 * энергия на трети шкалы и ниже. Иначе — обычный рабочий ритм.
 */
export function profileMoodOf(input: ProfileMoodInput): ProfileMood {
  if ((input.burnoutDays ?? 0) > 0 || input.motivation < 25) return 'burnout';
  if (input.energy <= Math.max(2, Math.round((input.maxEnergy || 16) / 3))) return 'tired';
  return 'normal';
}
export function profileArtwork(mood: ProfileMood): string {
  return `/art/profile/${mood}.webp`;
}
export const PROFILE_MOOD_META: Record<
  ProfileMood,
  {
    label: string;
    line: string;
  }
> = {
  normal: {
    label: t('В ритме'),
    line: t('Энергия и мотивация держат планку: задачи и события идут спокойно.'),
  },
  tired: {
    label: t('Накопилась усталость'),
    line: t('Энергия на исходе: сон, прогулка или хобби помогут больше, чем овертайм.'),
  },
  burnout: {
    label: t('Выгорание'),
    line: t('Мотивация на нуле. Восстановление важнее любых дедлайнов — береги себя.'),
  },
};
