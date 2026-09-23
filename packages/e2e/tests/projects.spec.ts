import { test, expect, Page } from '@playwright/test';
import { resolveStory } from './helpers/story';

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

const dayNumber = (page: Page) =>
  page.request.get('/api/game/state').then(async (r) => (await r.json()).state.currentDay as number);

async function endDay(page: Page): Promise<void> {
  // The day-end CTA is docked above the tab bar, so «Работа» can close the day.
  const before = await dayNumber(page);
  await page.getByRole('button', { name: /^Завершить день / }).click();
  // Событие дня прилетает не синхронно с кликом: `isVisible()` без ожидания
  // промахивался по окну, карточка оставалась нерешённой, день не закрывался,
  // и следующая итерация winContract билась в правило «один отклик в день».
  await resolveStory(page, { waitMs: 4_000 });
  // Сервер — источник правды: пока день не сдвинулся, ход не считать сделанным
  await expect.poll(() => dayNumber(page), { timeout: 30_000 }).toBe(before + 1);
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
    const pending = board(page).getByRole('article', { name: 'Отклик отправлен' });
    // Отклик — один в день. Если висящий отклик уже есть (день закрылся позже,
    // чем ждал цикл), клик по «Откликнуться» сервер отвергает и карточка
    // «Отклик отправлен» не появляется — это и был флап спека, а не продукта.
    if ((await pending.count()) === 0) {
      const offer = board(page).getByRole('article', { name: title, exact: true });
      await offer.getByRole('button', { name: 'Откликнуться', exact: true }).click();
      await expect(pending).toBeVisible();
    }
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
