import { test, expect } from '@playwright/test';
import { bootFreshGame } from './helpers';

test('shop recovers after HTTP failure and career has reachable vacancies', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/api/content/items', async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    else await route.continue();
  });
  await bootFreshGame(page);
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Магазин', exact: true })
    .click();
  await expect(page.getByText('Магазин недоступен', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('article', { name: 'Бюджетный ПК', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Работа', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Доступные компании' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Откликнуться' }).first()).toBeVisible();
  expect(
    await page.evaluate(() => {
      const area = document.getElementById('game-scroll')!;
      return area.scrollWidth > area.clientWidth;
    })
  ).toBe(false);
});
