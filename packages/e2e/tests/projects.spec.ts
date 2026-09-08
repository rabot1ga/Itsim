import { test, expect, Page } from '@playwright/test';

/**
 * Projects with deadlines — the «Работа» screen of reference 1.png.
 *
 * Everything here is played through the real UI against the real server: no
 * injected state, no stubbed responses. A deadline that expires must really
 * cost the player reputation.
 */

const board = (page: Page) => page.getByRole('region', { name: 'Проекты' });

/**
 * Tests share one server DATA_DIR and these scenarios burn game days, so each
 * one starts a fresh life and hands the next spec a day-1 player back.
 */
async function openWork(page: Page): Promise<void> {
  await page.goto('/');
  expect((await page.request.post('/api/game/reset')).ok()).toBe(true);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Работа', exact: true })
    .click();
  await expect(board(page)).toBeVisible();
}

test.afterEach(async ({ request }) => {
  // Leave the shared save on day 1 so later specs are not paying for this one.
  expect((await request.post('/api/game/reset')).ok()).toBe(true);
});

async function endDay(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Завершить день / }).click();
  const card = page.locator('.story-card');
  if (await card.isVisible()) {
    await card.locator('button:not(:disabled)').first().click();
    await expect(card).toHaveCount(0);
  }
}

test('take a project, finish its tasks and deliver it for real money', async ({ page }) => {
  await openWork(page);
  const landing = board(page).getByRole('article', { name: 'Сайт-визитка' });
  await expect(landing).toContainText('Оплата: 35 000 ₽');
  await landing.getByRole('button', { name: 'Взять', exact: true }).click();

  const active = board(page).getByRole('article', { name: 'Активный проект: Сайт-визитка' });
  await expect(active).toBeVisible();
  await expect(active.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(active).toContainText('Дедлайн: день 6');

  // A project cannot be doubled up on while another one is running.
  await expect(
    board(page).getByRole('article', { name: 'Telegram-бот' }).getByRole('button', { name: 'Взять', exact: true })
  ).toBeDisabled();

  const money = async () => {
    const response = await page.request.get('/api/game/state');
    return (await response.json()).state.money as number;
  };

  for (const task of ['Свёрстать первый экран', 'Подключить форму заявки', 'Выкатить на хостинг']) {
    const row = active.getByRole('listitem').filter({ hasText: task });
    await row.getByRole('button').click();
    await expect(row).toContainText('готово');
  }
  await expect(active.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

  const before = await money();
  await active.getByRole('button', { name: /^Сдать за/ }).click();
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toHaveCount(0);
  expect(await money()).toBe(before + 35000);
  await expect(board(page).getByRole('article', { name: 'Сайт-визитка' })).toContainText('Уже сдавался');
  await expect(board(page).getByRole('article', { name: 'Сайт-визитка' }).getByRole('button', { name: 'Взять', exact: true })).toBeEnabled();
});

test('a missed deadline drops the project and costs reputation', async ({ page }) => {
  await openWork(page);
  await board(page)
    .getByRole('article', { name: 'Сайт-визитка' })
    .getByRole('button', { name: 'Взять', exact: true })
    .click();
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toBeVisible();

  const reputation = async () => {
    const response = await page.request.get('/api/game/state');
    return (await response.json()).state.reputation as number;
  };
  const before = await reputation();

  // Deadline is 5 days out; walking past it must expire the contract.
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Главная', exact: true })
    .click();
  for (let day = 0; day < 6; day++) await endDay(page);

  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Работа', exact: true })
    .click();
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toHaveCount(0);
  expect(await reputation()).toBeLessThan(before + 1);
  await expect(
    board(page).getByRole('article', { name: 'Сайт-визитка' }).getByRole('button', { name: 'Взять', exact: true })
  ).toBeEnabled();
});

test('dropping a project frees the board immediately', async ({ page }) => {
  await openWork(page);
  await board(page)
    .getByRole('article', { name: 'Сайт-визитка' })
    .getByRole('button', { name: 'Взять', exact: true })
    .click();
  await board(page).getByRole('button', { name: 'Отказаться', exact: true }).click();
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toHaveCount(0);
  // A contract far above the player's level stays closed with a real reason.
  const platform = board(page).getByRole('article', { name: 'Аналитическая платформа' });
  await expect(platform.getByRole('button', { name: 'Взять', exact: true })).toBeDisabled();
  await expect(platform).toContainText('Нужен уровень основного навыка 25');
});
