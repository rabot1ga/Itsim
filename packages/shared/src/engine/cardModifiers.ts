/**
 * Модификаторы карт (DESIGN-DECK §5/§7.3, «Механики-дельты»).
 *
 * Перки/предметы открывают НОВЫЕ ВАРИАНТЫ ОТВЕТА на существующих карточках
 * стека — не «+5% к цифре», а новый выбор («Делегировать стажёру» на карточке
 * работы после перка «Наставник»). Прогрессия = глубина колоды.
 *
 * Правила живут здесь (shared), потому что клиент показывает варианты, а
 * сервер в actions.ts проверяет перк/предмет как источник истины.
 */

export interface CardModifierSource {
  kind: 'perk' | 'item';
  id: string;
  /** Имя для бейджа на кнопке варианта (RU — клиент прогоняет через t()) */
  name: string;
}

export interface CardModifier {
  id: string;
  /** id карточки-цели: actionId (work_task, study_book, …) или слот ('morning') */
  targets: string[];
  actionId: string;
  params?: Record<string, unknown>;
  /** Текст кнопки варианта (RU) */
  label: string;
  /** Пояснение последствий (RU) */
  hint: string;
  source: CardModifierSource;
}

export const CARD_MODIFIERS: CardModifier[] = [
  {
    id: 'mod_delegate_task',
    targets: ['work_task'],
    actionId: 'delegate_task',
    label: 'Делегировать стажёру',
    hint: 'Меньше опыта себе, но растёт лидерство и настроение не падает',
    source: { kind: 'perk', id: 'perk_mentor', name: 'Наставник' },
  },
  {
    id: 'mod_express_study',
    targets: ['study_book', 'study_stepik', 'study_course', 'study_advanced_course'],
    actionId: 'express_learn',
    label: 'Экспресс-конспект',
    hint: 'На 50% больше опыта, но −2 к настроению',
    source: { kind: 'perk', id: 'perk_speed_reader', name: 'Скорочтение' },
  },
  {
    id: 'mod_monetize_project',
    targets: ['pet_project'],
    actionId: 'monetize_project',
    label: 'Монетизировать пет-проект',
    hint: 'Деньги вместо части опыта: первый платящий клиент',
    source: { kind: 'perk', id: 'perk_hustler', name: 'Подработчик со стажем' },
  },
  {
    id: 'mod_morning_coffee',
    targets: ['morning'],
    actionId: 'morning_coffee',
    label: 'Начать день с кофе',
    hint: '+3 энергии и +2 настроения раз в день',
    source: { kind: 'item', id: 'coffee_maker', name: 'Кофемашина' },
  },
];

/** Есть ли у игрока источник модификатора (перк или предмет). */
export function hasCardModifierSource(player: { perks?: string[]; items?: string[] }, mod: CardModifier): boolean {
  const bag = mod.source.kind === 'perk' ? player.perks : player.items;
  return Array.isArray(bag) && bag.includes(mod.source.id);
}

/**
 * Модификаторы, доступные игроку на карточке `target` (actionId слоя action
 * или 'morning' для утренней карточки).
 */
export function cardModifiersFor(player: { perks?: string[]; items?: string[] }, target: string): CardModifier[] {
  return CARD_MODIFIERS.filter((m) => m.targets.includes(target) && hasCardModifierSource(player, m));
}
