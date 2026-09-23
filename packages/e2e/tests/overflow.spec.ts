import { test, expect, type Page } from '@playwright/test';

/**
 * Горизонтального скролла нет ни на одном экране, ни в каком состоянии.
 *
 * Причина появления этого спека — реальный баг, который висел красным и был
 * списан на «тайминги»: на «Обучении» в состоянии «таб „Направления“ + второй
 * аккордеон + выбранный навык» плитка пути-архетипа растягивала весь экран на
 * 52px. Сами плитки (`div.grid` в одну колонку внутри `.card`) при этом
 * выглядели нормально, потому что у implicit-колонки грида размер `auto`: одна
 * несжимаемая строка внутри ребёнка (текст + кнопка в flex) раздвигает колонку
 * до min-content, а `overflow` у контейнера никто не просил. Лечится
 * `grid-cols-[minmax(0,1fr)]` (+ `min-w-0` там, где стоит `truncate`) — правило
 * записано в `docs/design-system.md` §9.
 *
 * Экраны перебираются в «разогретых» состояниях: голый рендер этого бага не
 * касался, и проверять только его — значит оставить дыру открытой.
 */

const TABS = ['Главная', 'Работа', 'Обучение', 'Отдых', 'Магазин'] as const;
/** всё, что живёт в шторке «Меню» — боковые экраны, куда заходят посмотреть */
const SIDE = [
  'Профиль',
  'Дом',
  'Друзья',
  'Питомец',
  'Цели',
  'Топ',
  'Офис',
  'Майнинг',
  'Кошелёк',
  'Финалы',
  'Настройки',
] as const;

async function dismissStory(page: Page): Promise<void> {
  const card = page.locator('.story-card');
  if (!(await card.isVisible().catch(() => false))) return;
  const choice = card.locator('.story-choice:not(:disabled)').first();
  if (await choice.isVisible().catch(() => false)) await choice.click();
  const done = page.getByRole('button', { name: 'Продолжить' });
  if (await done.isVisible().catch(() => false)) await done.click();
}

/**
 * Возвращает строку-диагноз, если экран вылез за 320px.
 * `worst` — самый правый элемент внутри области скролла: по нему сразу видно,
 * какая именно строка не сжимается, и в текст падения он попадает тоже.
 */
async function measure(page: Page, where: string): Promise<string | null> {
  const m = await page.evaluate(() => {
    const area = document.getElementById('game-scroll');
    if (!area) return null;
    let worst = { sel: '', right: 0 };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#game-scroll *'))) {
      const r = el.getBoundingClientRect();
      if (r.right > worst.right) {
        const cls = (el.className || '').toString().trim().split(/\s+/)[0] ?? '';
        worst = { sel: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`, right: Math.round(r.right) };
      }
    }
    return {
      client: area.clientWidth,
      scroll: area.scrollWidth,
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      worst,
    };
  });
  if (!m) return `«${where}»: нет #game-scroll — экран не тот`;
  if (m.scroll > m.client || m.doc > m.inner) {
    return (
      `«${where}»: горизонтальный скролл — область ${m.scroll}px при ${m.client}px, ` +
      `документ ${m.doc}px при ${m.inner}px; шире всех ${m.worst.sel} (правый край ${m.worst.right}px)`
    );
  }
  return null;
}

async function openSide(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Меню' }).click();
  const dialog = page.getByRole('dialog', { name: 'Меню' });
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.afterEach(async ({ request }) => {
  // Свип ходит по всем экранам и трогает состояние (навык, секции «Дома»,
  // истории). Без reset следующим спекам мог достаться невзятый сюжет: сервер
  // отвергает действия, пока открыто событие, и «portrait.spec» краснел на
  // «краска не поменялась» — то есть наш же тест делал соседа нестабильным.
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
});

test('320px: ни один экран не раздается горизонтальным скроллом', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await dismissStory(page);

  const problems: string[] = [];
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });

  for (const label of TABS) {
    await nav.getByRole('button', { name: label, exact: true }).click();
    const problem = await measure(page, label);
    if (problem) problems.push(problem);
  }

  // Состояние, в котором баг и жил: сетка путей + раскрытый аккордеон школы +
  // выбранный основной навык.
  await nav.getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: /Направления/ }).click();
  const list = page.getByRole('region', { name: 'Список навыков' });
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: /Backend/ }).click();
  const python = list.getByRole('button', { name: 'Python', exact: true });
  if (await python.isEnabled()) await python.click();
  const warm = await measure(page, 'Обучение · направления + выбранный навык');
  if (warm) problems.push(warm);

  for (const label of SIDE) {
    await openSide(page, label);
    // «Дом» проверяем с открытыми секциями: и редактор, и гардероб несут свои
    // ряды «подпись + кнопка», и именно они умеют вылезать за край
    if (label === 'Дом') {
      for (const section of [/Настроить комнату/, /Гардероб/]) {
        const toggle = page.getByRole('button', { name: section });
        if (await toggle.isVisible().catch(() => false)) await toggle.click();
      }
    }
    const problem = await measure(page, label);
    if (problem) problems.push(problem);
    await dismissStory(page);
  }

  expect(problems, `экраны шире 320px:\n${problems.join('\n')}`).toEqual([]);
});
