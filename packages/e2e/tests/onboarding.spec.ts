import { test, expect } from '@playwright/test';

/**
 * First-run onboarding — the inverse of helpers.bootFreshGame: a context with
 * an empty localStorage must see the four-slide tour exactly once, and both
 * exits («Пропустить» on slide one, «Начать жизнь» on slide four) must land
 * in the five-tab game without a reload.
 */

const firstSlide = /Симулятор жизни айтишника/;
const fiveTabs = ['Главная', 'Работа', 'Обучение', 'Отдых', 'Магазин'];

test('brand-new player: skip on the first slide lands in the game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Пропустить' })).toBeVisible();
  await expect(page.getByRole('heading', { name: firstSlide })).toBeVisible();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await expect(nav).toBeVisible();
  expect(await nav.getByRole('button').allTextContents()).toEqual(fiveTabs);
});

test('brand-new player: «Дальше» walks all four slides, then the game', async ({ page }) => {
  await page.goto('/');
  for (const body of [/пустое резюме/, /тратят энергию/, /Повышения, офферы, случайные события/]) {
    await page.getByRole('button', { name: 'Дальше' }).click();
    await expect(page.getByText(body)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Начать жизнь' }).click();
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
});

test('a returning player never sees the tour again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Пропустить' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
});
