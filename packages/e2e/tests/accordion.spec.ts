import { test, expect, type Page } from '@playwright/test';
import { resolveStory, act } from './helpers/story';

/**
 * Свёрнутая секция не должна ничего обещать ни глазу, ни пальцу, ни клавиатуре.
 *
 * Примитив аккордеона (`.accordion-body` + `grid-template-rows: 0fr`) живёт в
 * четырёх экранах — «Дом» (редактор комнаты и гардероб), «Обучение», «День»,
 * карточка давления на работе. При `0fr` высота строки нулевая, но дети внутри
 * `overflow:hidden` сохраняют собственный бокс: без `visibility:hidden` кнопка
 * свотча оставалась в дереве доступности, брала Tab и перехватывала клик там,
 * где пользователь видел только заголовок. e2e это выглядело как
 * `locator.click: Timeout … <div class="card"> intercepts pointer events`,
 * и ровно так же оно выглядит для живого человека на мобильном.
 */

const HAIR_SWATCH = '#2b2320';

/** «Дом» — экран в шторке «Меню», «Обучение» — таб внизу: входы у них разные. */
async function openRoom(page: Page) {
  await act(page, async () => {
    await page.getByRole('button', { name: 'Меню' }).click();
    const dialog = page.getByRole('dialog', { name: 'Меню' });
    await dialog.getByRole('button', { name: 'Дом', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Комната')).toBeVisible();
  });
}

/** Без скоупа по навигации локатор двусмысленен: «Обучение» — и тайл, и таб. */
async function openLearning(page: Page) {
  await act(page, async () => {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Обучение', exact: true })
      .click();
    await page.getByRole('tab', { name: /Направления/ }).click();
    await expect(page.getByRole('region', { name: 'Список навыков' })).toBeVisible();
  });
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByLabel('Деньги')).toBeVisible();
  await resolveStory(page);
});

test('свёрнутый «Гардероб» не виден, не принимает клик и не даёт Tab', async ({ page }) => {
  await openRoom(page);
  const toggle = page.getByRole('button', { name: 'Гардероб', exact: true });
  const swatch = page.getByRole('button', { name: HAIR_SWATCH, exact: true }).first();

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(swatch).toBeHidden();

  await act(page, () => toggle.click());
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(swatch).toBeVisible();

  await act(page, () => toggle.click());
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // Регресс живёт здесь: бокс у свотча остаётся, так что «скрыт» — это про
  // видимость для пользователя, а не про существование элемента в DOM.
  await expect(swatch).toBeHidden();
  await expect(toggle).toBeVisible();

  await toggle.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).not.toBe(HAIR_SWATCH);
});

test('аккордеон школ в «Обучении» сворачивается так же', async ({ page }) => {
  // Первая школа открыта по умолчанию, остальные свёрнуты — берём вторую,
  // чтобы проверять ровно то состояние, в котором дефект и виден.
  await openLearning(page);
  const group = page.getByRole('region', { name: 'Список навыков' }).locator('.skill-group').nth(1);
  const head = group.locator('.skill-group-head');
  const body = group.locator('.accordion-inner');

  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();

  await act(page, () => head.click());
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toBeVisible();

  await act(page, () => head.click());
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();
});
