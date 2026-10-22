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

export const ROOM_TIER_META: Record<RoomTier, { title: string; tagline: string; description: string }> = {
  start: {
    title: 'Комната на старте',
    tagline: 'Съёмная комната, коробки ещё не разобраны',
    description:
      'Первая съёмная комната: тонкая кровать, старый монитор и коробки из переезда. Всё впереди — и код, и уют.',
  },
  cozy: {
    title: 'Обжитая комната',
    tagline: 'Плед, растения и кот — жизнь наладилась',
    description:
      'Комната обжита: тёплая лампа, растения на полках, кот на кровати. Сюда хочется возвращаться даже после овертайма.',
  },
  work: {
    title: 'Домашний офис',
    tagline: 'Два монитора, микрофон и доска для архитектур',
    description:
      'Комната стала рабочим инструментом: два монитора, нормальное кресло и доска, на которой рождаются архитектурные решения.',
  },
  dream: {
    title: 'Студия мечты',
    tagline: 'Панорамное окно, гитара и код на рассвете',
    description:
      'Студия мечты: панорамное окно с закатным городом, растения везде, гитара в углу. Код здесь пишется спокойно — жизнь удалась.',
  },
};
