import { test, expect } from '@playwright/test';
import { openView, goToday } from './helpers/nav';

/**
 * Reference 1.png (IA «Колода», DESIGN-DECK §2): игра открывается сразу в
 * стеке дня; нижняя панель — два контрока: «Сегодня» (стек) и «Архив»
 * (шторка со всеми экранами). Таббар упразднён.
 */
for (const width of [320, 390, 480]) {
  test(`reference 1.png opens directly into the deck game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-ui-revision="11"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Начать игру|Продолжить)/ })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    expect(await nav.getByRole('button').allTextContents()).toEqual(['Сегодня', 'Архив']);
    await expect(page.getByRole('region', { name: 'Персонаж и состояние' })).toBeVisible();
    // Комната над стеком — миниатюра тира (редизайн 22.10.2026): слоёв
    // room/avatar больше нет (идентичность снята), только сцена /art/room/.
    // alt=\"\" → getByRole('img') её не видит, локатор по классу.
    const roomThumb = page.locator('img.room-thumb');
    await expect(roomThumb).toBeVisible();
    await expect(roomThumb).toHaveAttribute('src', /^\/art\/room\/(start|cozy|work|dream)\.webp$/);
    expect(await roomThumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    expect(await page.locator('img[src^="/layers/"]').count()).toBe(0);
    // Стек дня: верхняя карточка — решение с кнопками-дублёрами жеста
    await expect(page.locator('[data-deck-id="morning"]')).toBeVisible();

    // Архив открывается шторкой и ведёт на каждый экран без горизонтального скролла
    for (const name of ['Работа', 'Развитие', 'Прогресс', 'Магазин', 'Настройки']) {
      await openView(page, name);
      expect(
        await page.evaluate(() => {
          const area = document.getElementById('game-scroll')!;
          return area.scrollWidth > area.clientWidth;
        })
      ).toBe(false);
    }
    // «Прогресс» ведёт в «Топ игроков»
    await openView(page, 'Прогресс');
    await expect(page.getByRole('button', { name: /^Топ игроков/ })).toBeVisible();
    // «Друзья» — дверь внутри «Работы»
    await openView(page, 'Работа');
    await page.getByRole('button', { name: /^Коллеги и знакомые/ }).click();
    await expect(page.getByRole('article', { name: 'Саня', exact: true })).toBeVisible();
    // Профиль — из HUD-портрета на «Сегодня»; дверь профиля — «Настройки»
    await goToday(page);
    await page.getByRole('button', { name: 'Открыть профиль' }).click();
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Настройки/ })).toBeVisible();
    await goToday(page);
    await expect(roomThumb).toBeVisible();
  });
}

test('development and shop keep reference-sized rows, not giant cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openView(page, 'Развитие');
  await page.getByRole('tab', { name: /Направления/ }).click();
  const skill = page.getByRole('button', { name: 'JavaScript', exact: true });
  await expect(skill).toBeVisible();
  expect((await skill.boundingBox())!.height).toBeLessThanOrEqual(90);
  // «Магазин» — экран «Архива» (IA «Колода»)
  await openView(page, 'Магазин');
  const product = page.getByRole('article', { name: 'Бюджетный ПК', exact: true });
  await expect(product).toBeVisible();
  expect((await product.boundingBox())!.height).toBeLessThanOrEqual(100);
});
