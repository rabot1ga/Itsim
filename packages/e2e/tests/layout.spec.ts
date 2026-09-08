import { test, expect } from '@playwright/test';

for (const width of [320, 390, 480]) {
  test(`home HUD, room and shortcuts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: /^(Начать игру|Продолжить)/ }).click();

    for (const name of ['Энергия', 'Здоровье', 'Мотивация']) {
      const meter = page.getByRole('progressbar', { name, exact: true });
      await expect(meter).toBeVisible();
      expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    }
    const room = page.getByRole('region', { name: 'Твоя комната' });
    await expect(room).toBeVisible();
    await expect(room.locator('svg[aria-label="Комната игрока"]')).toBeVisible();
    expect(
      await page.evaluate(() => {
        const scroll = document.getElementById('game-scroll')!;
        return document.documentElement.scrollWidth > innerWidth || scroll.scrollWidth > scroll.clientWidth;
      })
    ).toBe(false);

    await room.getByRole('button', { name: 'Магазин', exact: true }).click();
    await expect(room).toHaveCount(0);
    await page.getByRole('button', { name: 'День', exact: true }).click();
    await expect(room).toBeVisible();
    await room.getByRole('button', { name: 'Обустроить' }).click();
    await expect(page.getByRole('button', { name: 'Дом', exact: true })).toHaveAttribute('aria-current', 'true');
  });
}
