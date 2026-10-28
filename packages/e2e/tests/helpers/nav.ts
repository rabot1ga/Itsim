import type { Page } from '@playwright/test';

/**
 * Навигация IA «Колода» (DESIGN-DECK §2): нижняя панель — «Сегодня» (стек)
 * и «Архив» (шторка со всеми экранами). Таббар упразднён — все спеки ходят
 * по экранам через `openView`.
 */
export async function openView(page: Page, name: string | RegExp): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Архив', exact: true }).click();
  await page.getByRole('navigation', { name: 'Архив' }).getByRole('button', { name }).click();
}

export async function goToday(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Сегодня', exact: true }).click();
}
