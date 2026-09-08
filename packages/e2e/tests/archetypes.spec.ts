import { test, expect, Page } from '@playwright/test';

/**
 * P1.3 archetype routes — the full choose→highlight→clear loop plus the
 * server-side guards. The completion bonus itself is exercised by unit tests
 * (grinding a skill to level 30 through the UI is not a smoke-run thing); here
 * we prove the wiring: content is served, picking a path lights the golden
 * chain on the map, clearing it switches the map back, and the claim endpoint
 * refuses a route that is not fully walked yet.
 */

async function startFreshGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Начать игру/ })).toBeVisible();
  await page.getByRole('button', { name: /^Начать игру/ }).click();
}

test('archetype routes: choose → gold chain on map → clear → guarded claim', async ({ page, request }) => {
  // ── boot into the game and open the skill map ───────────────────────────
  await startFreshGame(page);
  await expect(page.locator('div[title^="Энергия:"]')).toHaveAttribute('title', /^Энергия: 10\/10$/);

  // ── content endpoint serves the six curated routes ──────────────────────
  const arch = await request.get('/api/content/archetypes');
  expect(arch.ok()).toBeTruthy();
  const body = await arch.json();
  expect(body.archetypes.length).toBe(6);
  expect(body.archetypes[0].id).toBe('frontend');
  expect(body.archetypes[0].nodes.map((n: any) => n.skillId)).toEqual(['javascript', 'typescript', 'react', 'nextjs']);

  await page.getByRole('button', { name: /^Навыки$/ }).click();

  // ── the routes rail renders with progress derived from live levels ──────
  const rail = page.locator('.game-card').filter({ hasText: 'Пути-архетипы' });
  await expect(rail).toBeVisible({ timeout: 15_000 });
  const frontendCard = rail.locator('div.snap-start').filter({ hasText: 'Путь фронтендера' });
  await expect(frontendCard).toBeVisible();
  // fresh player: 0/4 and the first milestone is the next goal
  await expect(frontendCard).toContainText('0/4');

  // ── choosing a path persists it and lights its milestones on the map ────
  await frontendCard.getByRole('button', { name: 'Следовать пути' }).click();
  await expect(frontendCard).toContainText('Снять подсветку');

  const routeNodes = page.getByTitle(/^Веха пути/);
  await expect(routeNodes).toHaveCount(4);

  const st = await request.get('/api/game/state');
  expect(st.ok()).toBeTruthy();
  expect((await st.json()).state.archetypeChosen).toBe('frontend');

  // ── clearing switches the map back to plain state colours ───────────────
  await frontendCard.getByRole('button', { name: 'Снять подсветку' }).click();
  await expect(routeNodes).toHaveCount(0);
  const st2 = await request.get('/api/game/state');
  expect((await st2.json()).state.archetypeChosen).toBeUndefined();

  // ── guards: unknown path and an unfinished route are both refused ───────
  const unknown = await request.post('/api/game/archetype/choose', {
    data: { archetypeId: 'nope' },
  });
  expect(unknown.status()).toBe(400);

  const premature = await request.post('/api/game/archetype/claim', {
    data: { archetypeId: 'frontend' },
  });
  expect(premature.status()).toBe(400);
  expect((await premature.json()).error).toContain('Пройди все шаги');
});
