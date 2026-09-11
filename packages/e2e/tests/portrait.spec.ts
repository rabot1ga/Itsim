import { test, expect, Page } from '@playwright/test';
import { bootFreshGame } from './helpers';

/**
 * Unified portrait (2026-09): the HUD and profile head shot is the same
 * layered SVG figure as the wardrobe mirror — same genetics, wardrobe wins.
 * A change picked in the wardrobe (shape or colour) must reach the portrait
 * everywhere instantly and survive a reload.
 */

/** All layer urls of the saved portrait + the hair layer's live CSS filter. */
async function portraitLook(page: Page): Promise<{ srcs: string[]; hairFilter: string }> {
  return page.evaluate(() => {
    const portrait = document.querySelector('[data-portrait="saved"]')!;
    const imgs = Array.from(portrait.querySelectorAll('img')) as HTMLImageElement[];
    const hair = imgs.find((img) => img.getAttribute('src')?.includes('/hair/'));
    return {
      srcs: imgs.map((img) => img.getAttribute('src') ?? ''),
      hairFilter: hair ? getComputedStyle(hair).filter : '',
    };
  });
}

for (const width of [320, 390, 480]) {
  test(`saved portrait follows wardrobe and survives reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // The boot resets the shared save, so the look always starts genetic.
    await bootFreshGame(page);
    const portrait = page.locator('[data-portrait="saved"] [role="img"]');
    await expect(portrait).toHaveCount(1);
    const homeLook = await portraitLook(page);
    expect(homeLook.srcs.some((s) => s.includes('/hair/'))).toBe(true);

    await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
    await expect(portrait).toHaveCount(1);
    expect(await portraitLook(page)).toEqual(homeLook);

    await page.getByRole('button', { name: 'Комната и гардероб', exact: true }).click();
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    // Real free wardrobe actions, no injected player state or fake responses.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/game/action') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '#a8443b', exact: true }).click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect((await response.json()).state.avatar.hairColor).toBe('#a8443b');

    // The hair layer file is the same (shape unchanged) but its tint changed.
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Главная', exact: true })
      .click();
    await expect(portrait).toHaveCount(1);
    const dyedLook = await portraitLook(page);
    expect(dyedLook.srcs).toEqual(homeLook.srcs);
    expect(dyedLook.hairFilter).not.toBe(homeLook.hairFilter);

    await page.reload();
    await expect(portrait).toHaveCount(1);
    expect(await portraitLook(page)).toEqual(dyedLook);
    await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
    expect(await portraitLook(page)).toEqual(dyedLook);
    expect(
      await page.evaluate(() => {
        const area = document.getElementById('game-scroll')!;
        return area.scrollWidth > area.clientWidth;
      })
    ).toBe(false);
  });
}

test('missing portrait content leaves a usable profile with a labelled fallback', async ({ page }) => {
  await page.route('**/api/content/layers', (route) => route.fulfill({ status: 503, body: '' }));
  await bootFreshGame(page);
  await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
  await expect(page.getByAltText('Стандартный портрет — внешность пока недоступна')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Комната и гардероб', exact: true })).toBeEnabled();
});
