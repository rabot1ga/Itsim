import { test, expect } from '@playwright/test';
import { resolveStory } from './helpers/story';

for (const width of [320, 390, 480]) {
  test(`home HUD, room and shortcuts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    for (const name of ['Энергия', 'Здоровье', 'Настроение']) {
      const meter = page.getByRole('progressbar', { name, exact: true });
      await expect(meter).toBeVisible();
      expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    }
    // Комната на «Главной» — миниатюра тира (HomeRoomCard, редизайн 22.10.2026):
    // сцена `/art/room/<тир>.webp`, действия — только во вкладке «Дом». У картинки
    // alt="" и роли нет, поэтому локатор по классу, а не getByRole('img').
    const roomThumb = page.locator('img.room-thumb');
    await expect(roomThumb).toBeVisible();
    await expect(roomThumb).toHaveAttribute('src', /^\/art\/room\/(start|cozy|work|dream)\.webp$/);
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
    await expect(roomThumb).toHaveCount(0);
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
    await expect(roomThumb).toBeVisible();
    // Конструктор комнаты удалён (редизайн 22.10.2026): на «Дом» ведёт меню,
    // там — карточка события с зонами-действиями.
    await page.getByRole('button', { name: 'Меню' }).click();
    const dialog = page.getByRole('dialog', { name: 'Меню' });
    await dialog.getByRole('button', { name: 'Дом', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Дом' })).toBeVisible();
    await expect(page.getByLabel('Твоя комната').locator('.story-choice').first()).toBeVisible();
  });
}

test('профиль — карточка жизни: баннер настроения, чипы, без слоёв внешности', async ({ page, request }) => {
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByLabel('Деньги')).toBeVisible();
  await resolveStory(page);

  await page.getByRole('button', { name: 'Меню' }).click();
  const dialog = page.getByRole('dialog', { name: 'Меню' });
  await dialog.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // Баннер — портрет одного из трёх настроений, а не слоистая фигура
  const banner = page.locator('.profile-banner img');
  await expect(banner).toBeVisible();
  expect(await banner.getAttribute('src')).toMatch(/^\/art\/profile\/(normal|tired|burnout)\.webp$/);

  // Чипы ключевых ресурсов на месте, kicker называет грейд и должность
  await expect(page.getByLabel('Ключевые показатели')).toBeVisible();
  expect(await page.locator('img[src^="/layers/"]').count()).toBe(0);

  // Экран не вылезает за 390px
  expect(
    await page.evaluate(() => {
      const scroll = document.getElementById('game-scroll')!;
      return scroll.scrollWidth > scroll.clientWidth;
    })
  ).toBe(false);
});
