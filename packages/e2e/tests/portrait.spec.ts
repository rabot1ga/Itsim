import { test, expect, type Page } from '@playwright/test';
import { tintFilter, tintFromHex } from '@itsim/shared';
import { act, resolveStory } from './helpers/story';

/**
 * Внешность игрока в настоящем браузере.
 *
 * Здесь защищаются два факта, которые нельзя проверить в jsdom:
 *  1. «Комната» и «Профиль» рисуют один и тот же слоистый стек — наборы файлов
 *     совпадают посимвольно, а не «похожи».
 *  2. Ручная краска (`player.avatar.*Color`) доезжает до плоской фигуры: фильтр
 *     слоя волос становится ровно тем, что отдаёт движок
 *     (`tintFilter(tintFromHex(...))`), и шаринг-карточка перерисовывается в
 *     другой PNG. Рядов «Цвета» в гардеробе больше нет (27.09.2026 — в шкафу
 *     выбирают вещи, а не краску), поэтому состояние меняется настоящим
 *     `customize_avatar` и перезагрузкой: заодно это проверка, что хекс
 *     переживает reload.
 *
 * Пункт 2 — это регресс, который в jsdom не поймать: там не считается ни CSS
 * filter, ни canvas-вызовы, ни загрузка svg/webp. Карточка до переезда на
 * плоский стек рисовала iso-комнату, и unit-тесты это ловили только по списку
 * слоёв; здесь ловится по пикселям (dataURL меняется ⇔ краски поменялись).
 */

const HAIR = 'img[src*="/layers/avatar-v2/hair_"]';

// Сейв у этого спека свежий (reset на каждый прогон), а свежий день встречает
// игрока сюжетом — без `.story-card` клики по «Обустроить комнату» и по заголовку
// «Гардероб» упирались бы в оверлей и падали на таймауте теста, а не на асерте.

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

/**
 * Лист «Меню» — единственный надёжный способ попасть на «Дом» с любого экрана.
 * Навигация обёрнута в `act`: сюжет дня встанет поверх экрана в тот же момент,
 * когда клиент применит ответ, и клик по кнопке под оверлеем иначе висит
 * до actionability-таймаута.
 */
async function openView(page: Page, label: string) {
  await act(page, async () => {
    await page.getByRole('button', { name: 'Меню' }).click();
    await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: label, exact: true }).click();
  });
}

async function openRoom(page: Page) {
  await act(page, async () => {
    await openView(page, 'Дом');
    await expect(page.getByLabel('Комната')).toBeVisible();
  });
}

/**
 * Краска пишется только через состояние — кликать по рядам цвета больше нечем.
 *
 * POST идёт настоящим `customize_avatar` (тот же путь, что был у свотча: та же
 * валидация хекса по палитре в `isoLook.ts`), а стор обновляется перезагрузкой:
 * так проверка заодно доказывает, что хекс лежит в сейве, а не в памяти вкладки.
 * Сюжет по пути закрывает `act`/`resolveStory` — карточка встаёт в том же
 * ответе, что и состояние, и перехватила бы клик.
 */
async function tintViaApi(request: Page['request'], page: Page, colour: string) {
  const res = await request.post('/api/game/action', {
    data: {
      actionId: 'customize_avatar',
      params: { slot: 'hairColor', entryId: colour },
      idempotencyKey: `e2e-tint-${colour}-${Date.now()}`,
    },
  });
  expect(res.ok()).toBe(true);
  expect((await res.json()).state.avatar.hairColor).toBe(colour);

  await page.reload();
  await expect(page.getByLabel('Деньги')).toBeVisible();
  await resolveStory(page, { strict: false });
  await openRoom(page);
  await expect(page.locator(`[aria-label="Комната"] ${HAIR}`).first()).toHaveAttribute(
    'style',
    styleWithFilter(tintFilter(tintFromHex(colour)!))
  );
}

/**
 * «Гардероб» — переключатель, а не кнопка «открыть»: тап по заголовку сворачивает
 * раскрытую секцию. Раньше тест жал по нему вслепую и попадал внутрь свёрнутой
 * секции — бокс у её содержимого есть, а перекрыт заголовком, отсюда
 * `click Timeout … intercepts pointer events` (починено в примитиве, см.
 * `accordion.spec.ts`). Теперь состояние читаем по `aria-expanded` и жмём только
 * если секция закрыта.
 */
async function openWardrobe(page: Page) {
  const toggle = page.getByRole('button', { name: 'Гардероб', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await act(page, () => toggle.click());
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

async function generateCard(page: Page) {
  await page.getByRole('button', { name: 'Сгенерировать', exact: true }).click();
  const preview = page.getByAltText('Шар-карточка');
  await expect(preview).toBeVisible();
  return preview.getAttribute('src');
}

for (const width of [320, 390, 480]) {
  test(`flat figure matches across room, profile and wardrobe; persisted tint reaches room and card at ${width}px`, async ({
    page,
    request,
  }) => {
    // Каждый прогон начинается с чистого сейва: тесты файла идут по одному
    // игроку, и без reset второй прогон получил бы цвет, поставленный первым, —
    // тогда «фигура перекрасилась» падало как ложный дефект, а «не перекрасилась»
    // вообще выглядело бы как работающий код.
    expect((await request.post('/api/game/reset')).ok()).toBe(true);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    // Ждём не «полсекунды, вдруг сюжет», а первого коммита состояния: стор
    // пишет `player` и `activeEvent` одним `set()` (store/gameStore.ts:185-196),
    // значит к моменту, когда видна шапка, клиент уже решил — показывать карточку
    // или нет. Окно ожидания здесь = гонка, она и роняла спек под нагрузкой.
    await expect(page.getByLabel('Деньги')).toBeVisible();
    await resolveStory(page);
    await act(page, () => page.getByRole('button', { name: 'Обустроить комнату', exact: true }).click());
    await expect(page.getByLabel('Комната')).toBeVisible();

    const roomSrcs = await figureSrcs(page, 'Комната');
    expect(roomSrcs.length).toBeGreaterThanOrEqual(5);
    expect(roomSrcs.some((src) => src.includes('bottom_'))).toBe(true);
    const roomHair = await hairFilter(page, 'Комната');

    await openView(page, 'Профиль');
    await expect(page.getByLabel('Профиль персонажа')).toBeVisible();
    expect(await figureSrcs(page, 'Аватар игрока')).toEqual(roomSrcs);
    expect(await hairFilter(page, 'Аватар игрока')).toBe(roomHair);

    // Живое превью гардероба = ровно тот стек, что рисует комната. Рядов цвета
    // здесь больше нет, превью осталось — оно и обязано совпадать.
    await openRoom(page);
    // событие может прилететь и между экранами — оно так же блокирует клик
    await resolveStory(page);
    await openWardrobe(page);
    expect(await figureSrcs(page, 'Превью гардероба')).toEqual(roomSrcs);
    expect(await hairFilter(page, 'Превью гардероба')).toBe(roomHair);

    // Реальное действие, без подставного состояния и моков.
    await tintViaApi(request, page, '#2b2320');
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

    // Вторая краска: карточка пересобралась, а фигура осталась перекрашенной —
    // `tintViaApi` сам делает reload, так что это ещё и проверка персистентности.
    await tintViaApi(request, page, '#d7a94b');
    const cardB = await generateCard(page);
    expect(cardB).not.toBe(cardA);

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
