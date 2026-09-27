import { test, expect, type Page } from '@playwright/test';
import { ratingMetricOf } from '@itsim/shared';
import { resolveStory, act } from './helpers/story';

/**
 * «Топ игроков» и вкладки по метрикам из ТЗ.
 *
 * Смысл спека не в том, что табы кликаются, а в том, что доска не имеет права
 * считать по-своему: число на строке обязано быть ровно той компонентой, которую
 * считает движок по *настоящему* состоянию игрока. Формула живёт в `@itsim/shared`
 * (engine/rating.ts), сервер по ней сортирует, клиент по ней же подписывает
 * строку — здесь сходятся все три, и расхождение поймается тут, а не глазами.
 *
 * Второе, что защищается: две ручки независимы. Метрика («по чему считать») и
 * «без бустеров» («кого считать») — разные группы, и переключение одной не должно
 * сбрасывать другую: ровно на таком «удобном» сбросе фильтр обычно и теряется.
 *
 * Запросов доски слушаем `page.on('request')`, а не `waitForResponse`: клик
 * обёрнут в `act` и может уйти на второй-третий повтор (сюжетная карточка), и
 * ограниченное окно ответа протухает раньше, чем клик доходит до сети. Это не
 * «увеличить таймаут», а убрать гонку: эффект ждём `expect.poll`'ом.
 */

const stateOf = (page: Page) =>
  page.request.get('/api/game/state').then(async (r) => ((await r.json()).state ?? {}) as Record<string, any>);

const metricGroup = (page: Page) => page.getByRole('group', { name: 'Метрика рейтинга' });
const filterGroup = (page: Page) => page.getByRole('group', { name: 'Фильтр рейтинга' });

function boardRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/leaderboard/')) urls.push(r.url());
  });
  return async (fragment: RegExp): Promise<URL> => {
    await expect.poll(() => urls.filter((u) => fragment.test(u)).at(-1), { timeout: 30_000 }).toBeTruthy();
    return new URL(urls.filter((u) => fragment.test(u)).at(-1)!);
  };
}

async function openBoard(page: Page): Promise<void> {
  await act(page, async () => {
    await page.getByRole('button', { name: 'Меню' }).click();
    await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Топ', exact: true }).click();
    await expect(metricGroup(page)).toBeVisible();
  });
}

test.beforeEach(async ({ page, request }) => {
  // Один игрок на весь спек: сброс нужен, чтобы «мой» рейтинг был известен до
  // клика, а не зависел от того, каким сейв достался от соседа по сьюту.
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByLabel('Деньги')).toBeVisible();
  await resolveStory(page);
});

test.afterEach(async ({ request }) => {
  // Спек читает и обновляет сейв (GET /game/state доначисляет офлайн-дни),
  // поэтому соседям не должен доставаться чужой день.
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
});

test('вкладки метрик = компоненты движка, и число на строке совпадает с его формулой', async ({ page }) => {
  const asked = boardRequests(page);
  await openBoard(page);

  await expect(metricGroup(page).getByRole('button')).toHaveText(['Рейтинг', 'Карьера', 'Навыки', 'Деньги', 'Rep']);
  await expect(metricGroup(page).getByRole('button', { name: 'Рейтинг' })).toHaveAttribute('aria-pressed', 'true');

  const state = await stateOf(page);
  const myRow = page.locator('.lb-row.is-me');
  await expect(myRow).toBeVisible();
  // Итоговая вкладка показывает ровно тот рейтинг, что лежит в состоянии.
  await expect(myRow.locator('.lb-score')).toHaveText(`${state.ratingScore} ⭐`);

  const money = Math.round(ratingMetricOf(state as any, 'money'));
  await act(page, () => metricGroup(page).getByRole('button', { name: 'Деньги' }).click());
  const url = await asked(/metric=money/);
  expect(url.pathname).toBe('/api/leaderboard/friends');
  // Ряд сверяется с движком повторяющимся ассертом: индекс доски обновляется по
  // сохранению состояния, и если GET ниже принёс игроку офлайн-начисления,
  // доска догонит их, а тест не упадёт ложным расхождением.
  await expect(myRow.locator('.lb-score')).toHaveText(`${money} /100`);
  await expect(metricGroup(page).getByRole('button', { name: 'Деньги' })).toHaveAttribute('aria-pressed', 'true');
  await expect(metricGroup(page).getByRole('button', { name: 'Рейтинг' })).toHaveAttribute('aria-pressed', 'false');
});

test('метрика и «без бустеров» — две независимые ручки', async ({ page }) => {
  const asked = boardRequests(page);
  await openBoard(page);
  const state = await stateOf(page);
  const honest = filterGroup(page).getByRole('button', { name: 'Без бустеров' });
  await act(page, () => honest.click());
  await expect(honest).toHaveAttribute('aria-pressed', 'true');
  await asked(/\/honest\?/);

  await act(page, () => metricGroup(page).getByRole('button', { name: 'Rep' }).click());
  const url = await asked(/metric=reputation/);
  // Смена метрики не имеет права сбросить фильтр — иначе «честная доска» живёт
  // ровно до первого таба.
  expect(url.pathname).toBe('/api/leaderboard/honest');
  await expect(honest).toHaveAttribute('aria-pressed', 'true');

  const rep = Math.round(ratingMetricOf(state as any, 'reputation'));
  await expect(page.locator('.lb-row.is-me').locator('.lb-score')).toHaveText(`${rep} /100`);
});
