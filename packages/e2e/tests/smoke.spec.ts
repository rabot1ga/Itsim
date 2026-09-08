import { test, expect, Page } from '@playwright/test';

/**
 * Smoke run of the whole loop (roadmap P0.5):
 *
 *   fresh player (throwaway DATA_DIR) → start → act → end of day →
 *   next day state → cosmetics purchase → telemetry actually recorded
 *
 * Every step ends on a server-confirmed UI state, never on a fire-and-forget
 * animation, so a green run proves the browser→client→API→storage wiring.
 */

async function startFreshGame(page: Page): Promise<void> {
  await page.goto('/');
}

const energyMeter = (page: Page) => page.locator('div[title^="Энергия:"]');

test('fresh run: three actions → end of day → buy cosmetics → telemetry', async ({ page, request }) => {
  // ── boot into the game ───────────────────────────────────────────────────
  await startFreshGame(page);
  // state loads with the daily check-in (+300 ₽); HUD shows a full battery
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);

  // ── the day's three free-ish actions drain energy ───────────────────────
  await page.getByRole('button', { name: /^YouTube туториалы/ }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 8\/10$/);

  await page.getByRole('button', { name: /^Читать книгу/ }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 7\/10$/);

  await page.getByRole('button', { name: /^Английский/ }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 5\/10$/);

  // ── end of day: server rolls day 1, day 2 opens with a fresh battery ────
  await page.getByRole('button', { name: /^Завершить день / }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);
  await expect(page.getByRole('button', { name: /^Завершить день 2/ })).toBeVisible();

  // ── shop: buy a cheap decor item (Кактус на стол, 500 ₽) ────────────────
  await page.getByRole('button', { name: /^Ещё/ }).click();
  await page
    .getByRole('dialog', { name: 'Ещё', exact: true })
    .getByRole('button', { name: /^Магазин/ })
    .click();
  await page
    .getByRole('group', { name: 'Категории товаров' })
    .getByRole('button', { name: 'Для дома', exact: true })
    .click();
  const plantRow = page.locator('.panel').filter({ hasText: 'Кактус на стол' });
  await expect(plantRow.getByRole('button', { name: /^Купить$/ })).toBeVisible();
  await plantRow.getByRole('button', { name: /^Купить$/ }).click();
  await expect(plantRow).toContainText('куплено', { timeout: 15_000 });

  // ── telemetry: the events the browser fired landed in the log ───────────
  const summary = await request.get('/api/telemetry/summary?hours=24');
  expect(summary.ok()).toBeTruthy();
  const data = await summary.json();
  expect(data.total).toBeGreaterThanOrEqual(1);
  expect(data.events.action).toBeGreaterThanOrEqual(3); // youtube + book + english
  expect(data.events.day_end).toBeGreaterThanOrEqual(1);
  expect(data.events.screen_view).toBeGreaterThanOrEqual(1); // shop tab visit
});
