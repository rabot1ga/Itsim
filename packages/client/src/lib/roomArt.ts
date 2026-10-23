import { t } from './i18n';
import type { PetRoomPosition } from '@itsim/shared';
/**
 * Комната как карточка события (решение 22.10.2026, вариант B): сцена-баннер
 * из `public/art/room/<тир>.webp` + строки-действия из общего каталога.
 *
 * Четыре тира прогресса переключаются грейдом — комната растёт вместе с
 * карьерой, без нового состояния и миграций:
 *   безработный/intern/junior → start · middle → cozy · senior · work · teamlead+ → dream.
 *
 * Пиксельной идентичности (кастомизации) нет: в сценах один постоянный
 * протагонист story-v1/финалов. Provenance арта — в `public/art/room/README.md`.
 */
export const ROOM_TIERS = ['start', 'cozy', 'work', 'dream'] as const;
export type RoomTier = (typeof ROOM_TIERS)[number];
export function roomTierOf(grade: string): RoomTier {
  switch (grade) {
    case 'middle':
      return 'cozy';
    case 'senior':
      return 'work';
    case 'teamlead':
    case 'architect':
    case 'cto':
      return 'dream';
    // unemployed/intern/junior и всё неизвестное (битый сейв, мок, новый
    // грейд из будущего) — стартовый тир: комната растёт только по известным
    // ступеням, «студия мечты» по умолчанию была багом (e2e 320px, день 1).
    default:
      return 'start';
  }
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
