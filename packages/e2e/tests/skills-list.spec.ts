import { test, expect } from '@playwright/test';

/**
 * Learning — a flat list grouped by school (docs/design-system.md §5).
 *
 * The radial map is gone: what matters now is that every school is one
 * accordion, a row shows level and XP, a locked row states its requirement,
 * and a tap makes the skill the main one on the server, at every phone width.
 */
for (const width of [320, 390, 480]) {
  test(`skill list: accordions, selection and no horizontal scroll at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Обучение', exact: true }).click();
    await page.getByRole('tab', { name: /Направления/ }).click();

    const list = page.getByRole('region', { name: 'Список навыков' });
    await expect(list).toBeVisible();

    // The first school is open, the others start collapsed.
    const frontend = list.getByRole('button', { name: /Frontend/ });
    await expect(frontend).toHaveAttribute('aria-expanded', 'true');
    const backend = list.getByRole('button', { name: /Backend/ });
    await expect(backend).toHaveAttribute('aria-expanded', 'false');
    await backend.click();
    await expect(backend).toHaveAttribute('aria-expanded', 'true');

    // A gated skill says exactly what it needs and cannot be picked.
    await expect(list.getByRole('button', { name: 'React', exact: true })).toBeDisabled();

    // Picking a skill makes it the main one — the server is the source of truth.
    const python = list.getByRole('button', { name: 'Python', exact: true });
    if (await python.isEnabled()) await python.click();
    await expect(list.getByRole('button', { name: 'Python', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await (await request.get('/api/game/state')).json()).state.mainSkillId).toBe('python');

    expect(
      await page.evaluate(() => {
        const scroll = document.getElementById('game-scroll')!;
        return scroll.scrollWidth > scroll.clientWidth;
      })
    ).toBe(false);
  });
}

test('learning catalogue retries after HTTP error', async ({ page }) => {
  let fail = true;
  await page.route('**/api/content/skills', async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('tab', { name: /Направления/ }).click();
  await expect(page.getByText('Не удалось загрузить обучение.', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('button', { name: 'JavaScript', exact: true })).toBeVisible();
});
