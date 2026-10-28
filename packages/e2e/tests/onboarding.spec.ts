import { test, expect } from '@playwright/test';
import { resolveStory } from './helpers/story';

/**
 * Онбординг = первые карточки стека (DESIGN-DECK §7.2, «Колода» B):
 * заставка упразднена — интро живёт внутри дня, его нельзя пропустить мимо.
 *
 * Ключ продублирован с ONBOARDING_KEY в `client/src/lib/firstSteps.ts`
 * специально: проверка после reload обязана упасть, если ключ разъедётся (иначе
 * интро снова начали бы показывать каждый день).
 */
const ONBOARDED_KEY = 'itsim_onboarded_v1';

test('первый запуск: интро-карточки стека, «Пропустить»/«Начать жизнь», без повторов', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // первая карточка стека — интро; заголовок-слайд тот же, что был на заставке
  const intro1 = page.locator('[data-deck-id="intro-1"]');
  await expect(intro1).toBeVisible();
  await expect(intro1.getByRole('heading', { name: 'Симулятор жизни айтишника' })).toBeVisible();
  // «Пропустить» обязано быть доступно сразу, а не только на последнем слайде
  await expect(intro1.getByRole('button', { name: 'Пропустить' })).toBeVisible();

  await intro1.getByRole('button', { name: 'Дальше' }).click();
  const intro2 = page.locator('[data-deck-id="intro-2"]');
  await expect(intro2).toBeVisible();
  await expect(intro2.getByRole('heading', { name: 'Каждый день — это энергия' })).toBeVisible();

  // на последнем слайде «Дальше» превращается в «Начать жизнь»;
  // ждём исчезновения ИМЕННО intro-2 — иначе проверка успеет пройти до
  // 160-мс анимации улёта, когда ключ ещё не записан
  await intro2.getByRole('button', { name: 'Начать жизнь' }).click();
  await expect(intro2).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ONBOARDED_KEY)).toBeTruthy();

  // обучение деланием: чек-лист «Первые шаги» — карточка стека (после «Утро»)
  await page.locator('[data-deck-id="morning"]').getByRole('button', { name: 'Дальше' }).click();
  await expect(page.getByTestId('first-steps')).toBeVisible();

  // повторный запуск — сразу игра, без интро
  await page.reload();
  await expect(page.locator('[data-deck-id="intro-1"]')).toHaveCount(0);
  await expect(page.locator('[data-deck-id="intro-2"]')).toHaveCount(0);
  // сразу игра: «Сегодня» с живой карточкой комнаты (design.md §5, строка 1) —
  // миниатюра тира (HomeRoomCard); действия комнаты — только во вкладке «Дом»
  await expect(page.locator('img.room-thumb')).toBeVisible();

  // Этот спек заводит нового игрока (localStorage чист), а новый день встречает
  // его сюжетом. Если его не закрыть, модалка уедет вместе с сейвом в следующий
  // спек: сервер отвергает действия при открытом событии, и сосед краснеет на
  // «краска не поменялась» / «отклик не отправлен».
  await resolveStory(page, { strict: false });
});

test('«Пропустить» закрывает интро сразу и навсегда', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('[data-deck-id="intro-1"]').getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.locator('[data-deck-id="intro-1"]')).toHaveCount(0);
  await expect(page.locator('[data-deck-id="intro-2"]')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDED_KEY)).toBeTruthy();

  await page.reload();
  await expect(page.locator('[data-deck-id="intro-1"]')).toHaveCount(0);
  await resolveStory(page, { strict: false });
});
