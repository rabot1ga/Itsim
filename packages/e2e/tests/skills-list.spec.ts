import { test, expect } from '@playwright/test';

for (const width of [320, 390, 480]) {
  test(`skill list filters, selection and map preference at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Обучение', exact: true }).click();
    const modes = page.getByRole('group', { name: 'Вид навыков' });
    await expect(modes.getByRole('button', { name: 'Список', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const list = page.getByRole('region', { name: 'Список навыков' });

    await page.getByText('Поиск и направления', { exact: true }).click();
    await page.getByLabel('Найти навык').fill('React');
    await expect(list.getByRole('article', { name: 'React', exact: true }).getByRole('button')).toBeDisabled();
    await page.getByLabel('Найти навык').fill('Python');
    await expect(list.getByRole('article')).toHaveCount(1);
    const python = list.getByRole('article', { name: 'Python', exact: true });
    const pick = python.getByRole('button');
    if (await pick.isEnabled()) await pick.click();
    await expect(python.getByRole('button', { name: 'Основной навык' })).toHaveAttribute('aria-pressed', 'true');
    expect((await (await request.get('/api/game/state')).json()).state.mainSkillId).toBe('python');
    expect(
      await page.evaluate(() => {
        const scroll = document.getElementById('game-scroll')!;
        return scroll.scrollWidth > scroll.clientWidth;
      })
    ).toBe(false);
    await modes.getByRole('button', { name: 'Карта', exact: true }).click();
    await expect(list).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Обучение', exact: true }).click();
    await expect(modes.getByRole('button', { name: 'Карта', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await modes.getByRole('button', { name: 'Список', exact: true }).click();
    await expect(list).toBeVisible();
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
  await expect(page.getByText('Не удалось загрузить обучение.', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('article', { name: 'JavaScript', exact: true })).toBeVisible();
});
