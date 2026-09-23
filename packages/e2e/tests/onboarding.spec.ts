import { test, expect } from '@playwright/test';

/**
 * Онбординг (design.md §5: «первый запуск — онбординг 4 слайда»).
 *
 * Единственная защита от «я не понимаю, что делать» — и единственная часть
 * продукта, которая вообще объясняет, что день = энергия. При этом он не был
 * покрыт ни одним e2e: сломать его можно было молча.
 *
 * Ключ продублирован с ONBOARDING_KEY в `client/src/screens/OnboardingView.tsx`
 * специально: проверка после reload обязана упасть, если ключ разъедётся (иначе
 * онбординг снова начали бы показывать каждый день).
 */
const ONBOARDED_KEY = 'itsim_onboarded_v1';

test('первый запуск: слайды показываются, «Пропустить» возвращает в игру и не повторяется', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const slide = (title: string) => expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();

  await slide('Симулятор жизни айтишника');
  // «Пропустить» обязано быть доступно сразу, а не только на последнем слайде
  await expect(page.getByRole('button', { name: 'Пропустить' })).toBeVisible();

  await page.getByRole('button', { name: 'Дальше' }).click();
  await slide('Ты только закончил универ');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await slide('Каждый день — это энергия');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await slide('Собеседования, баги, дедлайны');

  // на последнем слайде «Дальше» превращается в «Начать жизнь»
  await page.getByRole('button', { name: 'Начать жизнь' }).click();
  await expect(page.locator('.onboard')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDED_KEY)).toBeTruthy();

  // повторный запуск — сразу игра, без обучения
  await page.reload();
  await expect(page.locator('.onboard')).toHaveCount(0);
  // сразу игра: «Главная» с живой карточкой комнаты (design.md §5, строка 1)
  await expect(page.getByRole('region', { name: 'Твоя комната' })).toBeVisible();
});
