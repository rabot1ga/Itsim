/**
 * Everything the player can *do* in a day, in one place.
 *
 * The actions used to live inside «Главная» as four stacked grids, which made
 * the home screen a wall of twenty buttons. They are the same actions — only
 * now each one belongs to the tab that owns its topic: study → Обучение,
 * work and gigs → Работа, rest and people → Отдых.
 */
export interface ActionDef {
  id: string;
  emoji: string;
  name: string;
  /** energy the server charges */
  energy: number;
  /** money the server charges (0 = free) */
  cost: number;
  category: 'study' | 'work' | 'rest' | 'social';
  /** the action only exists while employed */
  requiresJob?: boolean;
  /** one short line under the name, when the effect is not obvious */
  hint?: string;
}

export const ACTIONS: ActionDef[] = [
  // ── Учёба ────────────────────────────────────────────────────────────────
  {
    id: 'study_youtube',
    emoji: '📺',
    name: 'YouTube туториалы',
    energy: 2,
    cost: 0,
    category: 'study',
    hint: 'бесплатно, но медленно',
  },
  { id: 'study_book', emoji: '📚', name: 'Читать книгу', energy: 1, cost: 1500, category: 'study' },
  { id: 'study_stepik', emoji: '🎓', name: 'Stepik курс', energy: 2, cost: 2000, category: 'study' },
  {
    id: 'study_course',
    emoji: '💻',
    name: 'Платный курс',
    energy: 3,
    cost: 15000,
    category: 'study',
    hint: 'самый быстрый опыт',
  },
  { id: 'study_english', emoji: '🇬🇧', name: 'Английский', energy: 2, cost: 0, category: 'study' },
  { id: 'study_english_course', emoji: '🗣️', name: 'Курс английского', energy: 3, cost: 3000, category: 'study' },

  // ── Работа ───────────────────────────────────────────────────────────────
  { id: 'work_task', emoji: '💼', name: 'Рабочая задача', energy: 4, cost: 0, category: 'work', requiresJob: true },
  {
    id: 'work_overtime',
    emoji: '🌙',
    name: 'Переработка',
    energy: 5,
    cost: 0,
    category: 'work',
    requiresJob: true,
    hint: 'деньги сейчас — здоровье потом',
  },
  { id: 'pet_project', emoji: '🚀', name: 'Пет-проект', energy: 3, cost: 0, category: 'work' },
  // «Фриланс-заказ» больше не плитка: отклик живёт на бирже заказов (ProjectBoard),
  // потому что тапать «получить деньги» рядом со списком тех же заказов — дубль.

  // ── Отдых ────────────────────────────────────────────────────────────────
  {
    id: 'rest_sleep',
    emoji: '😴',
    name: 'Поспать',
    energy: 0,
    cost: 0,
    category: 'rest',
    hint: 'доступно даже при нуле',
  },
  { id: 'rest_walk', emoji: '🚶', name: 'Прогулка', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_hobby', emoji: '🎲', name: 'Хобби', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_gym', emoji: '🏋️', name: 'Качалка', energy: 2, cost: 3000, category: 'rest' },

  // ── Люди ─────────────────────────────────────────────────────────────────
  { id: 'rest_bar', emoji: '🍻', name: 'Бар с друзьями', energy: 2, cost: 2000, category: 'social' },
  { id: 'networking', emoji: '🤝', name: 'Нетворкинг', energy: 2, cost: 0, category: 'social' },
];

export const actionsOf = (...categories: ActionDef['category'][]): ActionDef[] =>
  ACTIONS.filter((action) => categories.includes(action.category));

export const STUDY_ACTIONS = actionsOf('study');
export const WORK_ACTIONS = actionsOf('work');
/** Отдых и социальное живут вместе: и то и другое лечит настроение. */
export const REST_ACTIONS = actionsOf('rest', 'social');

/** Side gigs keep their own emoji — the chrome speaks emoji everywhere. */
export const SIDE_JOB_EMOJI: Record<string, string> = {
  courier: '📦',
  barista: '☕',
  loader: '🪑',
  night_guard: '🌙',
  taxi: '🚕',
  tutor: '🎓',
  streamer: '🎬',
};

export interface SideJobInfo {
  name: string;
  icon: string;
  energy: number;
  payment: number;
  paymentPerSkill?: number;
  paymentVar?: number;
  health?: number;
  motivation?: number;
  minSkill?: number;
  minDay?: number;
}

export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} млн`;
  if (amount >= 10_000) return `${Math.round(amount / 1000)} тыс`;
  return amount.toLocaleString('ru-RU');
}
