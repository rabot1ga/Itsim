import { test, expect } from '@playwright/test';
import { bootFreshGame } from './helpers';

for (const width of [320, 390, 480]) {
  test(`story card uses scene, named effects and failure retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let saved: any;
    let chooseCount = 0;
    const story = {
      id: 'tutorial_cat',
      title: '🐱 Кот прошёлся по клавиатуре',
      description: 'Пушистый помощник внёс свои правки в код. Что будешь делать?',
      tags: ['pets', 'code'],
      choices: [
        { text: 'Пустить в кресло помощника', effects: { motivation: 10, skill: { javascript: 3, python: -1 } } },
        { text: 'Купить новую клавиатуру', requires: { money: 99999999 }, effects: { money: -99999999 } },
      ],
    };
    // A deterministic UI fixture; game balance/event selection remains server-side.
    await page.route('**/api/game/state', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      saved = data.state;
      await route.fulfill({ json: { ...data, activeEvent: story } });
    });
    await page.route('**/api/game/event-choice', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ eventId: 'tutorial_cat', choiceIndex: 0 });
      chooseCount++;
      if (chooseCount === 1) await route.fulfill({ status: 503, json: { error: 'Тестовая ошибка связи' } });
      else await route.fulfill({ json: { state: saved } });
    });
    await bootFreshGame(page);
    const card = page.getByRole('region', { name: story.title, exact: true });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', '/art/story-v1/pet.webp');
    await expect(card.getByText('Опыт · JavaScript', { exact: true })).toBeVisible();
    await expect(card.getByText('Опыт · Python', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Купить новую клавиатуру' })).toBeDisabled();
    expect(
      await page.evaluate(() => {
        const area = document.getElementById('game-scroll')!;
        return area.scrollWidth > area.clientWidth;
      })
    ).toBe(false);
    await card.getByRole('button', { name: 'Пустить в кресло помощника' }).click();
    await expect(card.getByRole('alert')).toContainText('Тестовая ошибка связи');
    await card.getByRole('button', { name: 'Пустить в кресло помощника' }).click();
    // The outcome card is the receipt; it waits for a deliberate «Продолжить».
    const outcome = page.getByRole('region', { name: 'Результат: Кот прошёлся по клавиатуре' });
    await expect(outcome).toBeVisible();
    await outcome.getByRole('button', { name: 'Продолжить' }).click();
    await expect(page.locator('.story-card')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Твоя комната' })).toBeVisible();
    expect(chooseCount).toBe(2);
  });
}

test('profile opens from portrait and exposes live stats and goals', async ({ page }) => {
  await bootFreshGame(page);
  await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Профиль персонажа' });
  await expect(profile).toBeVisible();
  await expect(profile.getByText('Основной навык', { exact: true })).toBeVisible();
  await expect(profile.getByRole('img', { name: 'Портрет твоего персонажа' })).toBeVisible();
  await page.getByRole('button', { name: 'Цели и достижения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Цели', exact: true })).toBeVisible();
});
