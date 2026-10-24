import { t } from './i18n';
import { HOUSING_NAMES, type PetRoomPosition } from '@itsim/shared';
/**
 * Комната как карточка события (решение 22.10.2026, вариант B): сцена-баннер
 * из `public/art/room/<тир>.webp` + строки-действия из общего каталога.
 *
 * Четыре тира прогресса переключаются **уровнем жилья** (24.10.2026: переезд
 * должен менять картинку дома — дом растёт с жильём, офис — с карьерой):
 *   общага → start · однушка → cozy · центр → work · ипотека/пентхаус → dream.
 *
 * Пиксельной идентичности (кастомизации) нет: в сценах один постоянный
 * протагонист story-v1/финалов. Provenance арта — в `public/art/room/README.md`.
 */
export const ROOM_TIERS = ['start', 'cozy', 'work', 'dream'] as const;
export type RoomTier = (typeof ROOM_TIERS)[number];
export function roomTierOf(housingLevel: number): RoomTier {
  switch (housingLevel) {
    case 1:
      return 'cozy';
    case 2:
      return 'work';
    case 3:
    case 4:
      return 'dream';
    // Общага (0) и всё неизвестное (битый сейв, мок, новый уровень из будущего)
    // — стартовый тир: комната растёт только по известным ступеням жилья.
    default:
      return 'start';
  }
}
/** Название текущего дома в кикере сцены (ключи i18n — RU-строки из HOUSING_NAMES). */
export function housingTitle(housingLevel: number): string {
  return t(HOUSING_NAMES[housingLevel] ?? HOUSING_NAMES[0]);
}
export function roomArtwork(tier: RoomTier): string {
  return `/art/room/${tier}.webp`;
}
/**
 * Позиции питомца на сцене комнаты: якорь в % контейнера арта
 * (translate(-50%, -100%) — питомец «сидит» на точке). Расклад тиров
 * однотипный (кровать слева, стол центр, окно справа) — якоря общие.
 */
export const PET_ROOM_META: Record<
  PetRoomPosition,
  {
    label: string;
    x: number;
    y: number;
  }
> = {
  bed: { label: t('На кровати'), x: 16, y: 58 },
  window: { label: t('На подоконнике'), x: 78, y: 36 },
  rug: { label: t('На коврике'), x: 50, y: 84 },
  desk: { label: t('За столом'), x: 24, y: 50 },
  shelf: { label: t('На полке'), x: 40, y: 8 },
};
export const DEFAULT_PET_POSITION: PetRoomPosition = 'rug';
export const ROOM_TIER_META: Record<
  RoomTier,
  {
    title: string;
    tagline: string;
    description: string;
  }
> = {
  start: {
    title: t('Комната на старте'),
    tagline: t('Съёмная комната, коробки ещё не разобраны'),
    description: t(
      'Первая съёмная комната: тонкая кровать, старый монитор и коробки из переезда. Всё впереди — и код, и уют.'
    ),
  },
  cozy: {
    title: t('Обжитая комната'),
    tagline: t('Плед, растения и кот — жизнь наладилась'),
    description: t(
      'Комната обжита: тёплая лампа, растения на полках, кот на кровати. Сюда хочется возвращаться даже после овертайма.'
    ),
  },
  work: {
    title: t('Домашний офис'),
    tagline: t('Два монитора, микрофон и доска для архитектур'),
    description: t(
      'Комната стала рабочим инструментом: два монитора, нормальное кресло и доска, на которой рождаются архитектурные решения.'
    ),
  },
  dream: {
    title: t('Студия мечты'),
    tagline: t('Панорамное окно, гитара и код на рассвете'),
    description: t(
      'Студия мечты: панорамное окно с закатным городом, растения везде, гитара в углу. Код здесь пишется спокойно — жизнь удалась.'
    ),
  },
};
