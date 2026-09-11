import { Page } from '@playwright/test';

/**
 * Boot into the game as a fresh player who has already seen first-run
 * onboarding (ONBOARDING_KEY = 'itsim_onboarded_v1' in the client).
 *
 * The product deliberately shows a four-slide tour before day one since
 * 2026-09; specs here exercise in-game behaviour, so they pre-seed the
 * "tour done" flag instead of clicking through slides. The tour itself is
 * covered end-to-end by onboarding.spec.ts.
 *
 * The whole suite shares one DATA_DIR, so the boot also resets the save to
 * a pristine day-1 life (`opts.preserve` opts out — specs that deliberately
 * continue a previous life).
 */
export async function bootFreshGame(page: Page, opts: { preserve?: boolean } = {}): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, '1'), 'itsim_onboarded_v1');
  if (!opts.preserve) {
    await page.request.post('/api/game/reset').catch(() => null);
  }
  await page.goto('/');
}

/**
 * Clear a mid-flight story card, if one is on screen.
 *
 * Any busy day can fire a random event — actions, not only end-of-day. When a
 * spec drives a long sequence (contract bidding, deliveries) the card lands
 * on top of the tab it was exercising, so flows resolve it and keep going.
 * No-op when nothing fired.
 */
export async function resolveStoryCard(page: Page): Promise<void> {
  const card = page.locator('.story-card');
  for (let chain = 0; chain < 8; chain++) {
    if (
      !(await card
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      // A chained card can mount a frame after the previous one unmounts.
      const showedUp = await card
        .first()
        .waitFor({ state: 'visible', timeout: 1500 })
        .then(() => true)
        .catch(() => false);
      if (!showedUp) return;
    }
    // A receipt waits for «Продолжить»; a choice card takes the first enabled choice.
    const done = page.getByRole('button', { name: 'Продолжить' });
    if (await done.isVisible().catch(() => false)) {
      await done.click();
    } else {
      await card.locator('.story-choice:not(:disabled)').first().click();
    }
  }
  throw new Error('story card did not resolve after 8 steps');
}
