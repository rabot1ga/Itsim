import { describe, expect, it } from 'vitest';
import { CARD_MODIFIERS, cardModifiersFor, hasCardModifierSource } from '../cardModifiers';

/**
 * Модификаторы карт (DESIGN-DECK §7.3): перк/предмет открывает НОВЫЙ вариант
 * ответа на существующей карточке — прогрессия = глубина колоды.
 */
describe('cardModifiersFor', () => {
  it('без перков и предметов вариантов нет', () => {
    expect(cardModifiersFor({ perks: [], items: [] }, 'work_task')).toEqual([]);
    expect(cardModifiersFor({}, 'work_task')).toEqual([]);
  });

  it('перк «Наставник» открывает «Делегировать стажёру» на work_task', () => {
    const mods = cardModifiersFor({ perks: ['perk_mentor'], items: [] }, 'work_task');
    expect(mods.map((m) => m.actionId)).toEqual(['delegate_task']);
    expect(mods[0].source).toMatchObject({ kind: 'perk', id: 'perk_mentor' });
  });

  it('модификатор не светится на чужих карточках', () => {
    const player = { perks: ['perk_mentor'], items: [] };
    expect(cardModifiersFor(player, 'networking')).toEqual([]);
    expect(cardModifiersFor(player, 'morning')).toEqual([]);
  });

  it('«Скорочтение» покрывает все карточки учёбы одной веткой', () => {
    const player = { perks: ['perk_speed_reader'], items: [] };
    for (const target of ['study_book', 'study_stepik', 'study_course', 'study_advanced_course']) {
      expect(cardModifiersFor(player, target).map((m) => m.actionId)).toEqual(['express_learn']);
    }
  });

  it('предмет «Кофемашина» открывает утренний кофе', () => {
    const mods = cardModifiersFor({ perks: [], items: ['coffee_maker'] }, 'morning');
    expect(mods.map((m) => m.actionId)).toEqual(['morning_coffee']);
    expect(mods[0].source).toMatchObject({ kind: 'item', id: 'coffee_maker' });
  });

  it('каждый модификатор обязан вести на существующее действие и иметь подсказку', () => {
    for (const m of CARD_MODIFIERS) {
      expect(m.targets.length).toBeGreaterThan(0);
      expect(m.actionId).toMatch(/^[a-z0-9_]+$/);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
      expect(hasCardModifierSource({ perks: [m.source.id], items: [m.source.id] }, m)).toBe(true);
    }
  });
});
