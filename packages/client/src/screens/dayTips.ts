import { t } from '../lib/i18n';
/**
 * Onboarding tips for the first week (days 1..7).
 *
 * The first sessions of an idle/life sim should reveal mechanics gradually —
 * one pointer per day instead of a wall of four action grids. Each tip is
 * tied to a concrete day and to real mechanics the player can act on right
 * now. Pure module: no React, easy to test and to grow into a content file.
 */
export interface DayTip {
  title: string;
  body: string;
  /** chrome emoji (the design system's icon language) */
  icon: string;
}
const TIPS: Record<number, DayTip> = {
  1: {
    title: t('День 1 — выбери, кем станешь'),
    body: t(
      'Открой «Развитие» и тапни по языку/направлению — он станет основным, и учёба будет качать именно его. Затем начни с YouTube-туториалов: бесплатный опыт без риска.'
    ),
    icon: 'book',
  },
  2: {
    title: t('День 2 — работа и деньги'),
    body: t(
      'После учёбы попробуй «Рабочую задачу» или фриланс. Зарплаты ещё нет, поэтому подработки и экономия решают. Следи за строкой «Стоимость дня»: жизнь дорожает каждый день.'
    ),
    icon: 'coin',
  },
  3: {
    title: t('День 3 — не выгори'),
    body: t(
      'Здоровье и настроение — не украшение. «Прогулка» и «Поспать» дёшевы, а вот игнорировать усталость — дорого: события-выборы станут злее, а здоровье на нуле бьёт по всему.'
    ),
    icon: 'heart',
  },
  4: {
    title: t('День 4 — копай вглубь'),
    body: t(
      'Грейды растут не от количества курсов, а от глубины основного навыка (25+ уровень открывает вторые ветки — React, TypeScript…). Один навык вглубь лучше пяти вширь.'
    ),
    icon: 'target',
  },
  5: {
    title: t('День 5 — собеседования'),
    body: t(
      'Когда основной навык подрастёт, на вкладке «Работа» появятся собеседования. Готовься: правильные ответы = оффер. Не соглашайся на первую попавшуюся работу — сравни условия.'
    ),
    icon: 'briefcase',
  },
  6: {
    title: t('День 6 — комната и отдых'),
    body: t(
      'Загляни в «Дом»: жильё дороже — но меняет сцену и даёт бонусы к энергии и настроению. А «Бар с друзьями» и «Хобби» поднимают настроение — это вложения в себя.'
    ),
    icon: 'house',
  },
  7: {
    title: t('Неделя — подведи итоги'),
    body: t(
      'Открой «Прогресс» и «Задание дня». Если деньги кончаются — «Подработки» вне IT спасают от минуса. Дальше игра раскроется сама: события, майнинг, питомцы и офис.'
    ),
    icon: 'chart',
  },
};
/** Tip for a given game day; null outside the onboarding window (days 1–7). */
export function tipForDay(day: number | null | undefined): DayTip | null {
  if (!day) return null;
  return TIPS[day] ?? null;
}
