/**
 * Настроение офиса для сцены `IsoOffice` (docs/design.md §11). Жило отдельно
 * в `room/OfficeRenderer`, пока там был слоистый стек; после снятия пиксельной
 * идентичности (22.10.2026) переехало сюда, к самой iso-сцене.
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
