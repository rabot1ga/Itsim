import { test, expect, type Page } from '@playwright/test';
import { resolveStory, act } from './helpers/story';
import { openView } from './helpers/nav';

/**
 * Свёрнутая секция не должна ничего обещать ни глазу, ни пальцу, ни клавиатуре.
 *
 * Примитив аккордеона (`.accordion-body` + `grid-template-rows: 0fr`) живёт в
 * живых местах — школы в «Обучении» и карточка давления на работе
 * (строка «Вчера» удалена 28.10.2026 вместе со сводкой дня). При `0fr` высота строки нулевая, но дети внутри `overflow:hidden`
 * сохраняют собственный бокс: без `visibility:hidden` кнопка свотча оставалась
 * в дереве доступности, брала Tab и перехватывала клик там, где пользователь
 * видел только заголовок. e2e это выглядело как
 * `locator.click: Timeout … <div class="card"> intercepts pointer events`,
 * и ровно так же оно выглядит для живого человека на мобильном.
 *
 * До 22.10.2026 первой пробой был гардероб в комнате; вместе со снятием
 * пиксельной идентичности гардероб удалён, и спек защищает школы навыков —
 * тот же примитив, но живой экран.
 */

/** В новой IA (A2) «Развитие» — только таб, но скоуп по навигации не мешает. */
async function openLearning(page: Page) {
  await act(page, async () => {
    await openView(page, 'Развитие');
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

test('свёрнутый аккордеон школы не виден, не принимает клик и не даёт Tab', async ({ page }) => {
  await openLearning(page);
  // Первая школа открыта по умолчанию, остальные свёрнуты — берём вторую,
  // чтобы проверять ровно то состояние, в котором дефект и виден.
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
  // Регресс живёт здесь: бокс у содержимого остаётся (грид-строка свёрнута в
  // 0fr, дети не схлопываются), так что «скрыт» — это про видимость для
  // пользователя, а не про существование элемента в DOM.
  await expect(body).toBeHidden();
  await expect(head).toBeVisible();

  // Фокус не должен оставаться внутри свёрнутой секции — ни одной из них.
  await head.focus();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('.accordion-body:not(.open)')).some((body) =>
        body.contains(document.activeElement)
      )
    )
  ).toBe(false);
});

test('аккордеон школ разворачивается и сворачивается симметрично', async ({ page }) => {
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
