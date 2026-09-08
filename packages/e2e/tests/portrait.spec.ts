import { test, expect } from '@playwright/test';

for (const width of [320, 390, 480]) {
  test(`saved portrait follows wardrobe and survives reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const portrait = page.locator('[data-portrait="saved"] image');
    await expect(portrait).toHaveCount(1);
    const homeLook = await portrait.getAttribute('href');
    await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
    await expect(portrait).toHaveAttribute('href', homeLook!);
    await page.getByRole('button', { name: 'Комната и гардероб', exact: true }).click();
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    // Real free wardrobe actions, no injected player state or fake responses.
    const looks: string[] = [];
    for (const colour of ['#2b2320', '#d7a94b']) {
      const saved = page.waitForResponse((r) => r.url().endsWith('/api/game/action') && r.request().method() === 'POST');
      await page.getByRole('button', { name: colour, exact: true }).click();
      const response = await saved;
      expect(response.ok()).toBe(true);
      expect((await response.json()).state.avatar.hairColor).toBe(colour);
      await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Главная', exact: true }).click();
      await expect(portrait).toHaveCount(1);
      looks.push((await portrait.getAttribute('href'))!);
      if (colour === '#2b2320') {
        await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
        await page.getByRole('button', { name: 'Комната и гардероб', exact: true }).click();
        await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
      }
    }
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Главная', exact: true }).click();
    await expect(portrait).toHaveCount(1);
    expect(looks[0]).not.toBe(looks[1]);
    const updated = await portrait.getAttribute('href');
    expect(updated).toMatch(/^data:image\/png/);
    await page.reload();
    await expect(portrait).toHaveAttribute('href', updated!);
    await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
    await expect(portrait).toHaveAttribute('href', updated!);
    expect(await page.evaluate(() => {
      const area = document.getElementById('game-scroll')!;
      return area.scrollWidth > area.clientWidth;
    })).toBe(false);
  });
}

test('missing portrait content leaves a usable profile with a labelled fallback', async ({ page }) => {
  await page.route('**/iso/manifest.json', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
  await expect(page.getByAltText('Стандартный портрет — внешность пока недоступна')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Комната и гардероб', exact: true })).toBeEnabled();
});
