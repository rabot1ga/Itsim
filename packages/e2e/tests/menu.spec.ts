import { test, expect } from '@playwright/test';

for (const width of [320, 390, 480]) {
  test(`UI 05 entry screen and section shortcuts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto('/');
    expect(response?.headers()['cache-control']).toContain('no-store');
    const menu = page.getByRole('main', { name: 'Главное меню' });
    await expect(menu).toHaveAttribute('data-ui-revision', '05');
    await expect(menu.getByRole('heading', { level: 1 })).toContainText('АЙТИШНИКА');
    await expect(menu.getByText('UI 05', { exact: true })).toBeVisible();
    expect(await menu.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true
    );
    expect(await menu.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);

    for (const [shortcut, heading] of [
      ['Работа', 'Карьера'],
      ['Обучение', 'Обучение'],
      ['Магазин', 'Магазин'],
    ]) {
      await menu
        .getByRole('navigation', { name: 'Разделы игры' })
        .getByRole('button', { name: new RegExp(`^${shortcut}`) })
        .click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Ещё', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Ещё', exact: true })
        .getByRole('button', { name: 'Главное меню', exact: true })
        .click();
      await expect(menu).toBeVisible();
    }
    await menu.getByRole('button', { name: /^(Начать игру|Продолжить)/ }).click();
    await expect(page.getByRole('region', { name: 'Твоя комната' })).toBeVisible();
  });
}
