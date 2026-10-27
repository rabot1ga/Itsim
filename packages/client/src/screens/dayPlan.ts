import { t } from '../lib/i18n';
import { ACTIONS, type ActionDef } from './actionCatalogue';

/**
 * План дня (UX-пакет B, 28.10.2026): детерминированный подбор 3–4 быстрых
 * действий прямо на «Сегодня».
 *
 * Правила — простые и тестируемые, без «интеллекта»:
 *   1. Незакрытое задание дня → его действие первым.
 *   2. Энергии ≤ 2 → восстановление (сон + прогулка), остальное не предлагаем.
 *   3. Дальше по одному из колеи: карьера (work_task при работе, pet_project
 *      без работы), учёба (по кошельку: платный курс → Stepik → бесплатный
 *      YouTube), люди (при низком настроении — бар, иначе нетворкинг).
 *   4. Дубли убираем, максимум 4 плитки.
 */

/** Действие-подсказка для задания дня: прямое действие или переход на экран. */
export type ChallengeDelegate =
  { kind: 'action'; action: ActionDef; label: string } | { kind: 'view'; view: string; label: string };

const byId = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);

/**
 * Куда ведёт клик по заданию дня. `action` из challenges.json может требовать
 * параметров или жить на другом экране (покупка, кормление) — тогда делегат
 * открывает нужный экран.
 */
export function challengeDelegate(
  ch: { action: string; match?: string } | null | undefined,
  money = 0
): ChallengeDelegate | null {
  if (!ch) return null;
  switch (ch.action) {
    case 'study_': {
      // Любое учёба: самое дешёвое по кошельку
      const pick = money >= 1500 ? byId('study_book') : byId('study_youtube');
      return pick ? { kind: 'action', action: pick, label: t('Выполнить') } : null;
    }
    case 'rest_':
      return { kind: 'action', action: byId('rest_walk')!, label: t('Выполнить') };
    case 'work_task':
    case 'pet_project':
    case 'networking':
    case 'study_english':
    case 'rest_bar':
    case 'rest_gym':
    case 'rest_walk': {
      const action = byId(ch.action);
      return action ? { kind: 'action', action, label: t('Выполнить') } : null;
    }
    case 'freelance':
      return { kind: 'view', view: 'career', label: t('Открыть биржу') };
    case 'side_job':
      return { kind: 'view', view: 'career', label: t('Выбрать подработку') };
    case 'buy_item':
      return { kind: 'view', view: 'shop', label: t('В магазин') };
    case 'feed_pet':
      return { kind: 'view', view: 'pet', label: t('К питомцу') };
    default:
      return null;
  }
}

export function pickDayPlan(player: any): ActionDef[] {
  const energy: number = player?.energy ?? 0;
  const money: number = player?.money ?? 0;
  const motivation: number = player?.motivation ?? 50;
  const hasJob = Boolean(player?.job);
  const challenge = player?.dailyChallenge;

  const plan: ActionDef[] = [];
  const push = (a: ActionDef | undefined) => {
    if (a && !plan.some((x) => x.id === a.id)) plan.push(a);
  };

  // 1. Задание дня
  if (challenge && !challenge.done) {
    const delegate = challengeDelegate({ action: challenge.action ?? '', match: challenge.match }, money);
    if (delegate?.kind === 'action') push(delegate.action);
  }

  // 2. Энергия на исходе — только восстановление
  if (energy <= 2) {
    push(byId('rest_sleep'));
    push(byId('rest_walk'));
    return plan.slice(0, 4);
  }

  // 3. Карьера
  push(hasJob ? byId('work_task') : byId('pet_project'));

  // 4. Учёба по кошельку
  if (money >= 15000) push(byId('study_course'));
  else if (money >= 2000) push(byId('study_stepik'));
  else if (money >= 1500) push(byId('study_book'));
  else push(byId('study_youtube'));

  // 5. Люди
  if (motivation < 40 && money >= 2000) push(byId('rest_bar'));
  else push(byId('networking'));

  return plan.slice(0, 4);
}
