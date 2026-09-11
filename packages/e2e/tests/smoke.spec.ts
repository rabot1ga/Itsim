import { test, expect, Page } from '@playwright/test';
import { bootFreshGame } from './helpers';

/**
 * Smoke run of the whole loop (roadmap P0.5):
 *
 *   fresh player (throwaway DATA_DIR) → start → act → end of day →
 *   next day state → cosmetics purchase → telemetry actually recorded
 *
 * Every step ends on a server-confirmed UI state, never on a fire-and-forget
 * animation, so a green run proves the browser→client→API→storage wiring.
 */


const energyMeter = (page: Page) => page.locator('[title^="Энергия:"]').first();

async function resolveStory(page: Page): Promise<void> {
  const card = page.locator('.story-card');
  if (await card.isVisible()) {
    await card.locator('.story-choice:not(:disabled)').first().click();
    // The choice collapses into a result card that waits for a deliberate tap.
    const done = page.getByRole('button', { name: 'Продолжить' });
    await expect(done).toBeVisible({ timeout: 15_000 });
    await done.click();
    await expect(page.locator('.story-card')).toHaveCount(0);
  }
}

test('fresh run: three actions → end of day → buy cosmetics → telemetry', async ({ page, request }) => {
  // ── boot into the game ───────────────────────────────────────────────────
  await bootFreshGame(page);
  // state loads with the daily check-in (+300 ₽); HUD shows a full battery
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);

  // Study actions moved from «Главная» to the «Обучение» tab.
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Обучение', exact: true }).click();

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

  // ── end of day: the CTA is docked above the nav, so it works from any
  //    working tab without scrolling to the bottom of «Главная» ────────────
  await expect(page.getByRole('button', { name: /^Завершить день / })).toBeVisible();
  await page.getByRole('button', { name: /^Завершить день / }).click();
  await expect(energyMeter(page)).toHaveAttribute('title', /^Энергия: 10\/10$/);
  await resolveStory(page);
  await expect(page.getByRole('button', { name: /^Завершить день 2/ })).toBeVisible();

  // ── shop: buy a cheap decor item (Кактус на стол, 500 ₽) ────────────────
  await nav.getByRole('button', { name: 'Магазин', exact: true }).click();
  await page
    .getByRole('group', { name: 'Категории товаров' })
    .getByRole('button', { name: 'Для дома', exact: true })
    .click();
  const plantRow = page.locator('.card').filter({ hasText: 'Кактус на стол' });
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
