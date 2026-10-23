import { t } from './i18n';
import { roomTierOf, type RoomTier } from './roomArt';
/**
 * Офис как карточка события (фаза 3 редизайна 22.10.2026): сцена-баннер из
 * `public/art/office/<тир>.webp` + строки рабочих действий из общего каталога.
 * Iso-сцена (`components/iso/`) удалена; спрайты `public/iso/` остались
 * только иконками товаров в «Магазине» (`components/iso/IsoIcon.tsx`).
 *
 * Лестница та же, что у комнаты, — дом и офис растут вместе с карьерой:
 *   intern/junior → openspace · middle → cabinet · senior → floor · teamlead+ → tower.
 */
export const OFFICE_TIERS = ['openspace', 'cabinet', 'floor', 'tower'] as const;
export type OfficeTier = (typeof OFFICE_TIERS)[number];
const BY_ROOM_TIER: Record<RoomTier, OfficeTier> = {
  start: 'openspace',
  cozy: 'cabinet',
  work: 'floor',
  dream: 'tower',
};
/** Тир офиса растёт той же лестницей грейда, что и комната (единый источник — `roomTierOf`). */
export function officeTierOf(grade: string): OfficeTier {
  return BY_ROOM_TIER[roomTierOf(grade)];
}
export function officeArtwork(tier: OfficeTier): string {
  return `/art/office/${tier}.webp`;
}
export const OFFICE_TIER_META: Record<
  OfficeTier,
  {
    title: string;
    tagline: string;
    description: string;
  }
> = {
  openspace: {
    title: t('Опенспейс'),
    tagline: t('Ряды столов, дешёвый свет и чужие мониторы'),
    description: t(
      'Большой опенспейс: одинаковые столы, перегородки и гул разговоров. Своего угла нет — но именно здесь начинается карьера.'
    ),
  },
  cabinet: {
    title: t('Кабинет команды'),
    tagline: t('Стеклянный угол, растения и своя доска'),
    description: t(
      'У команды свой угол за стеклом: нормальные столы, доска для схем и тёплая лампа. Место, куда хочется приходить.'
    ),
  },
  floor: {
    title: t('Свой этаж'),
    tagline: t('Переговорная, три монитора и вид на город'),
    description: t(
      'Отдельный этаж команды: большая переговорка, место для архитектуры и окна от пола до потолка. Ты здесь главный по технике.'
    ),
  },
  tower: {
    title: t('Верхний этаж'),
    tagline: t('Панорама, угол стола и тишина'),
    description: t(
      'Кабинет на верхнем этаже: панорамное стекло, угол стола и полка с наградами. Видно город, который ты собирал по частям.'
    ),
  },
};
