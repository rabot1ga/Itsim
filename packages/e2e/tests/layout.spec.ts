import { test, expect } from '@playwright/test';

for (const width of [320, 390, 480]) {
  test(`home HUD, room and shortcuts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    for (const name of ['Энергия', 'Здоровье', 'Мотивация']) {
      const meter = page.getByRole('progressbar', { name, exact: true });
      await expect(meter).toBeVisible();
      expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    }
    const room = page.getByRole('region', { name: 'Твоя комната' });
    await expect(room).toBeVisible();
    await expect(room.getByRole('img')).toBeVisible();
    expect(
      await page.evaluate(() => {
        const scroll = document.getElementById('game-scroll')!;
        return document.documentElement.scrollWidth > innerWidth || scroll.scrollWidth > scroll.clientWidth;
      })
    ).toBe(false);

    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Магазин', exact: true })
      .click();
    await expect(room).toHaveCount(0);
    const filters = page.getByRole('group', { name: 'Категории товаров' });
    await expect(filters).toBeVisible();
    await filters.getByRole('button', { name: 'Техника', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Бюджетный ПК', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Кактус на стол', exact: true })).toHaveCount(0);
    await filters.getByRole('button', { name: 'Для дома', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Кактус на стол', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => {
        const scroll = document.getElementById('game-scroll')!;
        return scroll.scrollWidth > scroll.clientWidth;
      })
    ).toBe(false);
    await page.getByRole('button', { name: 'Главная', exact: true }).click();
    await expect(room).toBeVisible();
    await room.getByRole('button', { name: 'Обустроить' }).click();
    await expect(page.getByRole('heading', { name: 'Дом', exact: true })).toBeVisible();
  });
}
