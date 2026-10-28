/**
 * B (аудит 28.10): чек-лист «Первые шаги» — обучение деланием.
 *
 * Флаги живут в localStorage (учебное состояние первых дней, серверу не нужно
 * знать о них): «завершил день» выводится из currentDay, остальное — отмечается
 * реальными обработчиками действий и выбора навыка.
 */
export const FIRST_STEPS_KEY = 'itsim_first_steps_v1';
export interface FirstSteps {
  action: boolean;
  focus: boolean;
}
const EMPTY: FirstSteps = { action: false, focus: false };
export function readFirstSteps(): FirstSteps {
  try {
    const raw = localStorage.getItem(FIRST_STEPS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<FirstSteps>;
    return { action: Boolean(parsed.action), focus: Boolean(parsed.focus) };
  } catch {
    return { ...EMPTY };
  }
}
export function markFirstStep(step: keyof FirstSteps): void {
  try {
    const next = { ...readFirstSteps(), [step]: true };
    localStorage.setItem(FIRST_STEPS_KEY, JSON.stringify(next));
    // событие в той же вкладке — чек-лист перерисовывается сразу
    window.dispatchEvent(new CustomEvent('firststeps'));
  } catch {
    // приватный режим — просто без чек-листа
  }
}
