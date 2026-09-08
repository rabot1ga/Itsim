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

async function resolveStory(page: Page): Promise<void> {
  const card = page.locator('.story-card');
  if (await card.isVisible()) {
    await card.locator('button:not(:disabled)').first().click();
    await expect(card).toHaveCount(0);
  }
}

test('fresh run: three actions → end of day → buy cosmetics → telemetry', async ({ page, request }) => {
  // ── boot into the game ───────────────────────────────────────────────────
  await startFreshGame(page);
  // state loads with the daily check-in (+300 ₽); HUD shows a full battery
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);

  // Real random events may interrupt any action, not only end-of-day.
  for (const [name, energyCost] of [
    ['YouTube туториалы', 2],
    ['Читать книгу', 1],
    ['Английский', 2],
  ] as const) {
    const beforeTitle = await energyMeter(page).getAttribute('title');
    const before = Number(beforeTitle?.match(/Энергия: (\d+)/)?.[1]);
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(energyMeter(page)).toHaveAttribute('title', new RegExp(`^Энергия: ${before - energyCost}/10$`));
    await resolveStory(page);
  }

  // ── end of day: server rolls day 1, day 2 opens with a fresh battery ────
  await page.getByRole('button', { name: /^Завершить день / }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);
  await resolveStory(page);
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
