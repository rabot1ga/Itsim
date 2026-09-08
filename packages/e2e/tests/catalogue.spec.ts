import { test, expect } from '@playwright/test';

test('shop recovers after HTTP failure and career has reachable vacancies', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/api/content/items', async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^(Начать игру|Продолжить)/ }).click();
  await page.getByRole('region', { name: 'Твоя комната' }).getByRole('button', { name: 'Магазин' }).click();
  await expect(page.getByText('Магазин недоступен', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('article', { name: 'Бюджетный ПК', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Карьера', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Доступные компании' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Откликнуться' }).first()).toBeVisible();
  expect(
    await page.evaluate(() => {
      const area = document.getElementById('game-scroll')!;
      return area.scrollWidth > area.clientWidth;
    })
  ).toBe(false);
});
