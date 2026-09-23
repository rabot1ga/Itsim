import { expect, type Page } from '@playwright/test';

/**
 * Сюжет дня (`.story-card`) перекрывает игровой экран: он появляется поверх
 * любой вкладки, и пока выбор не сделан, клики по кнопкам упираются в оверлей.
 * Для Playwright это не «падение на асерте», а 90-секундный таймаут
 * actionability — ровно так краснели `portrait.spec` и `projects.spec`, и
 * ровно так `overflow.spec` оставлял соседнему спекy невзятый сюжет.
 *
 * Общая реализация — не лень, а лечение расхождения: четыре копии этой функции
 * в сьютах отличались только тем, сколько они ждут карточку (`isVisible()` без
 * ожидания пропускал сюжет, который прилетает на сотню позже клика). Отсюда и
 * «флапы», которые на самом деле были гонкой в тестовом хелпере.
 *
 * @param waitMs   сколько ждать саму карточку: после действия сюжет приходит не
 *                 синхронно с кликом, а после конца дня — тем более
 * @param strict   требует, чтобы после «Продолжить» карточка исчезла. Для
 *                 «подмести за собой» (cleanup) ставят false: там отсутствие
 *                 реакции — не дефект продукта.
 */
export async function resolveStory(page: Page, opts: { waitMs?: number; strict?: boolean } = {}): Promise<void> {
  const { waitMs = 1_500, strict = true } = opts;
  const card = page.locator('.story-card');
  const open = await card
    .waitFor({ state: 'visible', timeout: waitMs })
    .then(() => true)
    .catch(() => false);
  if (!open) return;

  const choice = card.locator('.story-choice:not(:disabled)').first();
  if (!(await choice.isVisible().catch(() => false))) {
    if (!strict) return;
    throw new Error('.story-card открыт, но ни один выбор недоступен — играть нечем');
  }
  await choice.click();

  // Выбор сворачивается в чек решения, который ждёт отдельного нажатия.
  const done = page.getByRole('button', { name: 'Продолжить' });
  if (!(await done.isVisible({ timeout: strict ? 15_000 : 1_000 }).catch(() => false))) {
    if (!strict) return;
    throw new Error('«Продолжить» не появился после выбора');
  }
  await done.click();
  if (strict) await expect(card).toHaveCount(0);
}
