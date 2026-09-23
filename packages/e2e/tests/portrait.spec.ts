import { test, expect, type Page } from '@playwright/test';
import { tintFilter, tintFromHex } from '@itsim/shared';

/**
 * Внешность игрока в настоящем браузере.
 *
 * Здесь защищаются два факта, которые нельзя проверить в jsdom:
 *  1. «Комната» и «Профиль» рисуют один и тот же слоистый стек — наборы файлов
 *     совпадают посимвольно, а не «похожи».
 *  2. Ряд «Цвета» в гардеробе доезжает до плоской фигуры: фильтр слоя волос
 *     становится ровно тем, что отдаёт движок (`tintFilter(tintFromHex(...))`),
 *     и шаринг-карточка перерисовывается в другой PNG.
 *
 * Пункт 2 — это регресс, который в jsdom не поймать: там не считается ни CSS
 * filter, ни canvas-вызовы, ни загрузка svg/webp. Карточка до переезда на
 * плоский стек рисовала iso-комнату, и unit-тесты это ловили только по списку
 * слоёв; здесь ловится по пикселям (dataURL меняется ⇔ краски поменялись).
 */

const HAIR = 'img[src*="/layers/avatar-v2/hair_"]';

/**
 * Сюжет дня перекрывает экран: если сейв свежий (например, его сбросил соседний
 * спек через `/api/game/reset`), на загрузке прилетает `.story-card`, клики по
 * «Обустроить комнату» и по свотчам цвета упираются в оверлей, и тест падает не
 * на асерте, а на 90-секундном таймауте actionability. Скрипт сверяет
 * внешний вид, а не сюжет — историю закрываем и идём дальше.
 */
async function resolveStory(page: Page): Promise<void> {
  const card = page.locator('.story-card');
  const open = await card
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!open) return;
  await card.locator('.story-choice:not(:disabled)').first().click();
  const done = page.getByRole('button', { name: 'Продолжить' });
  await expect(done).toBeVisible({ timeout: 15_000 });
  await done.click();
  await expect(page.locator('.story-card')).toHaveCount(0);
}

/**
 * Браузер сериализует inline-style сам (trailing `;` его), поэтому сверяем
 * префикс `filter: <то, что отдал движок>`, а не строку целиком.
 */
const styleWithFilter = (filter: string) => new RegExp(`filter: ${filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

/** Пути слоёв фигуры внутри контейнера с данным aria-label (сортировано). */
function figureSrcs(page: Page, scope: string) {
  return page
    .locator(`[aria-label="${scope}"] img[src*="/layers/avatar-v2/"]`)
    .evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src') ?? '').sort());
}

/** Инлайн-фильтр слоя волос (тонировка grayscale-мастера). */
function hairFilter(page: Page, scope: string) {
  return page.locator(`[aria-label="${scope}"] ${HAIR}`).first().getAttribute('style');
}

/** Лист «Меню» — единственный надёжный способ попасть на «Дом» с любого экрана. */
async function openView(page: Page, label: string) {
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: label, exact: true }).click();
}

async function openRoom(page: Page) {
  await openView(page, 'Дом');
  await expect(page.getByLabel('Комната')).toBeVisible();
}

async function pickColour(page: Page, colour: string) {
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/game/action') && r.request().method() === 'POST');
  await page.getByRole('button', { name: colour, exact: true }).first().click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect((await response.json()).state.avatar.hairColor).toBe(colour);
  await expect(page.locator(`[aria-label="Комната"] ${HAIR}`).first()).toHaveAttribute(
    'style',
    styleWithFilter(tintFilter(tintFromHex(colour)!))
  );
}

async function generateCard(page: Page) {
  await page.getByRole('button', { name: 'Сгенерировать', exact: true }).click();
  const preview = page.getByAltText('Шар-карточка');
  await expect(preview).toBeVisible();
  return preview.getAttribute('src');
}

for (const width of [320, 390, 480]) {
  test(`flat figure matches across room and profile, wardrobe colour reaches room and card at ${width}px`, async ({
    page,
    request,
  }) => {
    // Каждый прогон начинается с чистого сейва: тесты файла идут по одному
    // игроку, и без reset второй прогон кликал бы по тому же цвету, который
    // первый уже поставил. Клиент не шлёт запрос «без изменения» → waitForResponse
    // висел до таймаута теста, а «цвет изменился» падал как ложный дефект.
    expect((await request.post('/api/game/reset')).ok()).toBe(true);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await resolveStory(page);
    await page.getByRole('button', { name: 'Обустроить комнату', exact: true }).click();
    await expect(page.getByLabel('Комната')).toBeVisible();

    const roomSrcs = await figureSrcs(page, 'Комната');
    expect(roomSrcs.length).toBeGreaterThanOrEqual(5);
    expect(roomSrcs.some((src) => src.includes('bottom_'))).toBe(true);
    const roomHair = await hairFilter(page, 'Комната');

    await openView(page, 'Профиль');
    await expect(page.getByLabel('Профиль персонажа')).toBeVisible();
    expect(await figureSrcs(page, 'Аватар игрока')).toEqual(roomSrcs);
    expect(await hairFilter(page, 'Аватар игрока')).toBe(roomHair);

    // Реальное действие гардероба, без подставного состояния и моков.
    await openRoom(page);
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    // событие может прилететь и между экранами — оно так же блокирует клик
    await resolveStory(page);
    await pickColour(page, '#2b2320');

    const tinted = await hairFilter(page, 'Комната');
    expect(tinted).not.toBe(roomHair);
    expect(tinted).toContain('hue-rotate');

    // Карточка = та же краска: png пересобрался, и в нём плоские слои.
    const cardA = await generateCard(page);
    expect(cardA).toMatch(/^data:image\/png/);
    expect(cardA!.length).toBeGreaterThan(10_000);
    expect(
      await page.getByAltText('Шар-карточка').evaluate((el) => {
        const img = el as HTMLImageElement;
        return { w: img.naturalWidth, h: img.naturalHeight };
      })
    ).toEqual({ w: 1080, h: 1080 });

    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    await pickColour(page, '#d7a94b');
    const cardB = await generateCard(page);
    expect(cardB).not.toBe(cardA);

    // Сейв: после перезагрузки плоская фигура возвращается с той же краской.
    await page.reload();
    await openRoom(page);
    await expect(page.locator(`[aria-label="Комната"] ${HAIR}`).first()).toHaveAttribute(
      'style',
      styleWithFilter(tintFilter(tintFromHex('#d7a94b')!))
    );

    expect(
      await page.evaluate(() => {
        const area = document.getElementById('game-scroll')!;
        return area.scrollWidth > area.clientWidth;
      })
    ).toBe(false);
  });
}

test('iso content outage only costs the HUD bust, the room stays drawn', async ({ page }) => {
  await page.route('**/iso/manifest.json', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.getByAltText('Стандартный портрет — внешность пока недоступна')).toBeVisible();
  await page.getByRole('button', { name: 'Обустроить комнату', exact: true }).click();
  expect((await figureSrcs(page, 'Комната')).length).toBeGreaterThanOrEqual(5);
});

test('layer content outage leaves the profile usable without a half-drawn figure', async ({ page }) => {
  await page.route('**/api/content/layers', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await openView(page, 'Профиль');
  await expect(page.getByLabel('Профиль персонажа')).toBeVisible();
  await expect(page.getByLabel('Аватар игрока')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Комната и гардероб', exact: true })).toBeEnabled();
});
