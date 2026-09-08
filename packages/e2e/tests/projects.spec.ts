import { test, expect, Page } from '@playwright/test';

/**
 * Contracts on the board — the «Работа» screen of reference 1.png.
 *
 * A project is no longer handed out on tap: the player answers the ad
 * («Откликнуться», −3 ⚡) and the client replies the next morning — signed,
 * paid test task, or silence. Everything here is played through the real UI
 * against the real server: no injected state, no stubbed responses.
 */

const board = (page: Page) => page.getByRole('region', { name: 'Заказы' });

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
  // The day-end CTA is docked above the tab bar, so «Работа» can close the day.
  await page.getByRole('button', { name: /^Завершить день / }).click();
  const card = page.locator('.story-card');
  if (await card.isVisible()) {
    await card.locator('.story-choice:not(:disabled)').first().click();
    const done = page.getByRole('button', { name: 'Продолжить' });
    await expect(done).toBeVisible({ timeout: 15_000 });
    await done.click();
    await expect(page.locator('.story-card')).toHaveCount(0);
  }
  await expect(board(page)).toBeVisible();
}

/**
 * Bid until the client says yes. The roll is real, so the loop is generous:
 * «Сайт-визитка» sits near a 30% chance for a fresh player, which makes 25
 * attempts a practically certain win without ever faking the outcome.
 */
async function winContract(page: Page, title: string): Promise<void> {
  const active = board(page).getByRole('article', { name: /^Активный проект/ });
  for (let attempt = 0; attempt < 25; attempt++) {
    if ((await active.count()) > 0) return;
    const offer = board(page).getByRole('article', { name: title, exact: true });
    await offer.getByRole('button', { name: 'Откликнуться', exact: true }).click();
    await expect(board(page).getByRole('article', { name: 'Отклик отправлен' })).toBeVisible();
    await endDay(page);
  }
  await expect(active).toBeVisible();
}

test('bid for a contract, finish its tasks and deliver it for real money', async ({ page }) => {
  await openWork(page);
  const landing = board(page).getByRole('article', { name: 'Сайт-визитка', exact: true });
  await expect(landing).toContainText('Оплата: 35 000 ₽');
  await expect(landing).toContainText('Шанс получить');

  // One bid per day, and no second ad while the first client is thinking.
  await landing.getByRole('button', { name: 'Откликнуться', exact: true }).click();
  await expect(board(page).getByRole('article', { name: 'Отклик отправлен' })).toBeVisible();
  await expect(
    board(page)
      .getByRole('article', { name: 'Telegram-бот', exact: true })
      .getByRole('button', { name: 'Откликнуться' })
  ).toBeDisabled();

  await endDay(page);
  await winContract(page, 'Сайт-визитка');

  const active = board(page).getByRole('article', { name: 'Активный проект: Сайт-визитка' });
  await expect(active).toBeVisible();
  await expect(active.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

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
  await expect(board(page).getByRole('article', { name: 'Сайт-визитка', exact: true })).toContainText('Уже сдавался');
});

test('a missed deadline drops the contract and costs reputation', async ({ page }) => {
  await openWork(page);
  await winContract(page, 'Сайт-визитка');
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toBeVisible();

  const reputation = async () => {
    const response = await page.request.get('/api/game/state');
    return (await response.json()).state.reputation as number;
  };
  const before = await reputation();

  // Deadline is 5 days out; walking past it must expire the contract.
  for (let day = 0; day < 6; day++) await endDay(page);

  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toHaveCount(0);
  expect(await reputation()).toBeLessThan(before + 1);
});

test('dropping a contract frees the board immediately', async ({ page }) => {
  await openWork(page);
  await winContract(page, 'Сайт-визитка');
  await board(page).getByRole('button', { name: 'Отказаться', exact: true }).click();
  await expect(board(page).getByRole('article', { name: /^Активный проект/ })).toHaveCount(0);
  // A contract far above the player's level stays closed with a real reason.
  const platform = board(page).getByRole('article', { name: 'Аналитическая платформа', exact: true });
  await expect(platform.getByRole('button', { name: 'Откликнуться', exact: true })).toBeDisabled();
  await expect(platform).toContainText('Нужен уровень основного навыка 25');
});
