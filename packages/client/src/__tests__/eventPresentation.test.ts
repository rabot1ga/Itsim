import { describe, expect, it } from 'vitest';
import { storyLabel, choiceTone, effectRows, eventArtwork, unmetRequirements } from '../components/eventPresentation';

describe('event presentation', () => {
  it('selects specific art before broad tags', () => {
    expect(eventArtwork(['work', 'code'], 'Кот на клавиатуре', 'tutorial_cat')).toBe('/art/story-v1/pet.webp');
    expect(eventArtwork(['family', 'reward'], 'Посылка от мамы', 'fam_care_package')).toBe('/art/story-v1/parcel.webp');
    expect(eventArtwork(['crisis'], 'Сервер недоступен')).toBe('/art/story-v1/server.webp');
    expect(eventArtwork(['work'], 'Сложный баг')).toBe('/art/story-v1/bug.webp');
    expect(eventArtwork([], 'Предложение о работе')).toBe('/art/story-v1/offer.webp');
    expect(eventArtwork([], 'Похвала в соцсетях')).toBe('/art/story-v1/social.webp');
    expect(eventArtwork([], 'Скидка на технику')).toBe('/art/story-v1/shop.webp');
    expect(eventArtwork([], 'Сломался велосипед')).toBe('/art/story-v1/bicycle.webp');
  });
  it('keeps generic money requests out of the equipment sale scene', () => {
    expect(eventArtwork(['money'], 'Постоянный клиент просит скидку')).not.toBe('/art/story-v1/shop.webp');
  });
  it('gives the freelance loop its own scenes', () => {
    expect(eventArtwork(['money', 'freelance'], 'Постоянный клиент просит скидку')).toBe(
      '/art/story-v1/freelance.webp'
    );
    expect(eventArtwork(['work'], 'Фриланс-заказчик оказался скамом')).toBe('/art/story-v1/freelance.webp');
    expect(eventArtwork(['work'], 'Контракт подписан')).toBe('/art/story-v1/contract.webp');
  });
  it('keeps gains and losses for each skill and NPC separate', () => {
    const rows = effectRows({ skill: { javascript: 5, python: -5 }, relation: { uni_friend: 2, hr_anna: -2 } });
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.text)).toEqual(['+5 XP', '-5 XP', '+2', '-2']);
    expect(rows.map((row) => row.good)).toEqual([true, false, true, false]);
    expect(rows[0]?.label).toBe('Опыт · JavaScript');
    expect(rows[2]?.label).toContain('Саня');
  });
  it('reducing burnout and warnings is a benefit, not a loss', () => {
    const rows = effectRows({ burnoutDays: -2, jobWarnings: 1 });
    expect(rows.map((row) => row.good)).toEqual([true, false]);
  });
  it('ignores zero and nonfinite values', () => {
    expect(effectRows({ energy: 0, health: NaN, money: Infinity })).toEqual([]);
  });
  it('colors choices by costs and benefits, not index', () => {
    expect(choiceTone(effectRows({ energy: 2 }))).toBe('green');
    expect(choiceTone(effectRows({ energy: -2 }))).toBe('red');
    expect(choiceTone(effectRows({ money: -20, health: 2 }))).toBe('amber');
    expect(choiceTone([])).toBe('purple');
  });
  it('reports every unmet requirement using actual saved levels', () => {
    const missing = unmetRequirements(
      { energy: 3, money: 20, skill: { python: 5 }, minRelation: { uni_friend: 10 } },
      { energy: 2, money: 0, skills: { python: { level: 4 } }, relationships: { uni_friend: 2 } }
    );
    expect(missing).toHaveLength(4);
    expect(missing[2]).toBe('Python: уровень 5');
    expect(unmetRequirements({ energy: 2 }, { energy: 2, money: 0 })).toEqual([]);
    expect(unmetRequirements({ energy: 2 })).toEqual([]);
  });
});

it('does not confuse «который» with a cat and removes decorative button emoji', () => {
  expect(eventArtwork(['daily'], 'Закат, который всё расставил по местам')).toBe('/art/story-v1/night.webp');
  expect(storyLabel('Прогнать кота 😤')).toBe('Прогнать кота');
});
