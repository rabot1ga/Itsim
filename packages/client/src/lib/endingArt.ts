/**
 * Иллюстрации шести финалов: `/art/endings/<id>.webp` (22.10.2026).
 *
 * Набор лежит в `packages/client/public/art/endings/` (512×307, WebP q82,
 * ~22–53 КБ на сцену) и нарисован одним пиксель-арт-прогоном под палитру игры
 * (#0D1117 / #1B212C / #4ADE80 / #F4D35E) с общим протагонистом story-v1
 * (каштановые волосы, квадратные очки, тёмно-синее худи), чтобы шесть сцен
 * читались как одна жизнь. Provenance — в README рядом с артом.
 *
 * Клиент пути не придумывает: id финала приходит из `checkEndings`
 * (`@itsim/shared`), а сохранённый `careerEnding === 'corporate_god'` — это
 * алиас того же финала `cto` (историческое имя в сейве).
 */
export function endingArtwork(endingId: string): string {
  const id = endingId === 'corporate_god' ? 'cto' : endingId;
  return `/art/endings/${id}.webp`;
}
