import { test, expect } from '@playwright/test';
import { bootFreshGame } from './helpers';

for (const width of [320, 390, 480]) {
  test(`reference 1.png opens directly into five-tab game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootFreshGame(page);
    await expect(page.locator('[data-ui-revision="09"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Начать игру|Продолжить)/ })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    expect(await nav.getByRole('button').allTextContents()).toEqual([
      'Главная',
      'Работа',
      'Обучение',
      'Отдых',
      'Магазин',
    ]);
    await expect(page.getByRole('region', { name: 'Персонаж и состояние' })).toBeVisible();
    const room = page.getByRole('region', { name: 'Твоя комната' });
    await expect(room.getByRole('img')).toBeVisible();
    expect(await room.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true
    );
    for (const name of ['Работа', 'Обучение', 'Отдых', 'Магазин']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'true');
      expect(
        await page.evaluate(() => {
          const area = document.getElementById('game-scroll')!;
          return area.scrollWidth > area.clientWidth;
        })
      ).toBe(false);
    }
    // Друзья moved behind «⋮» when «Отдых» took the fifth tab.
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Меню', exact: true });
    await expect(sheet.getByRole('button', { name: /Настройки/ })).toBeVisible();
    await sheet.getByRole('button', { name: /Друзья/ }).click();
    await expect(page.getByRole('article', { name: 'Саня', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await sheet.getByRole('button', { name: /Профиль/ }).click();
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await page.getByRole('button', { name: 'На главную', exact: true }).click();
    await expect(room).toBeVisible();
  });
}

test('learning and shop keep reference-sized rows, not giant cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootFreshGame(page);
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: /Направления/ }).click();
  const skill = page.getByRole('button', { name: 'JavaScript', exact: true });
  await expect(skill).toBeVisible();
  expect((await skill.boundingBox())!.height).toBeLessThanOrEqual(90);
  await nav.getByRole('button', { name: 'Магазин', exact: true }).click();
  const product = page.getByRole('article', { name: 'Бюджетный ПК', exact: true });
  await expect(product).toBeVisible();
  expect((await product.boundingBox())!.height).toBeLessThanOrEqual(100);
});
