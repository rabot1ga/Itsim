import { test, expect } from '@playwright/test';

/**
 * Reference 1.png: игра открывается сразу в четырёхтабной навигации (A2,
 * 25.10.2026): «Сегодня / Работа / Развитие / Прогресс», а «мир» (дом, питомец,
 * друзья, офис, майнинг) живёт контекстными дверями внутри экранов. Листа
 * «⋮ / Меню» больше нет.
 */
for (const width of [320, 390, 480]) {
  test(`reference 1.png opens directly into four-tab game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-ui-revision="10"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Начать игру|Продолжить)/ })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    expect(await nav.getByRole('button').allTextContents()).toEqual(['Сегодня', 'Работа', 'Развитие', 'Прогресс']);
    await expect(page.getByRole('region', { name: 'Персонаж и состояние' })).toBeVisible();
    // Комната на «Сегодня» — миниатюра тира (редизайн 22.10.2026): слоёв
    // room/avatar больше нет (идентичность снята), только сцена /art/room/.
    // alt=\"\" → getByRole('img') её не видит, локатор по классу.
    const roomThumb = page.locator('img.room-thumb');
    await expect(roomThumb).toBeVisible();
    await expect(roomThumb).toHaveAttribute('src', /^\/art\/room\/(start|cozy|work|dream)\.webp$/);
    expect(await roomThumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    expect(await page.locator('img[src^="/layers/"]').count()).toBe(0);
    for (const name of ['Работа', 'Развитие', 'Прогресс', 'Сегодня']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'true');
      expect(
        await page.evaluate(() => {
          const area = document.getElementById('game-scroll')!;
          return area.scrollWidth > area.clientWidth;
        })
      ).toBe(false);
    }
    // «Мир» идёт дверями: «Прогресс» ведёт в «Топ игроков»
    await nav.getByRole('button', { name: 'Прогресс', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Топ игроков/ })).toBeVisible();
    // «Друзья» — дверь внутри «Работы»
    await nav.getByRole('button', { name: 'Работа', exact: true }).click();
    await page.getByRole('button', { name: /^Коллеги и знакомые/ }).click();
    await expect(page.getByRole('article', { name: 'Саня', exact: true })).toBeVisible();
    // Профиль — из HUD-портрета на «Сегодня»; дверь профиля — «Настройки»
    await nav.getByRole('button', { name: 'Сегодня', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть профиль' }).click();
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Настройки/ })).toBeVisible();
    await nav.getByRole('button', { name: 'Сегодня', exact: true }).click();
    await expect(roomThumb).toBeVisible();
  });
}

test('development and shop keep reference-sized rows, not giant cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Развитие', exact: true }).click();
  await page.getByRole('tab', { name: /Направления/ }).click();
  const skill = page.getByRole('button', { name: 'JavaScript', exact: true });
  await expect(skill).toBeVisible();
  expect((await skill.boundingBox())!.height).toBeLessThanOrEqual(90);
  // «Магазин» — дверь на «Сегодня» (A2)
  await nav.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Магазин', exact: true }).click();
  const product = page.getByRole('article', { name: 'Бюджетный ПК', exact: true });
  await expect(product).toBeVisible();
  expect((await product.boundingBox())!.height).toBeLessThanOrEqual(100);
});
