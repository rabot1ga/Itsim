import { describe, it, expect } from 'vitest';
import { filterBoardOffers, dealCountWord, type BoardOffer } from '../offerBoard';

const offer = (id: string, over: Partial<BoardOffer> = {}): BoardOffer => ({
  id,
  itemId: id,
  name: id,
  description: '',
  rarity: 'rare',
  price: 1000,
  createdAt: 1000,
  ...over,
});

const board: BoardOffer[] = [
  offer('fox', { name: 'Лисёнок Рыжик', description: 'рыжий друг', price: 90000, rarity: 'rare', createdAt: 300 }),
  offer('owl', { name: 'Сова Ночная', description: 'философ', price: 120000, rarity: 'legendary', createdAt: 200 }),
  offer('dragon', {
    name: 'Дракончик',
    description: 'крошка-мечта',
    price: 800000,
    rarity: 'legendary',
    createdAt: 100,
  }),
];

describe('filterBoardOffers: поиск/фильтр/сортировка', () => {
  it('без фильтров — по новизне (createdAt desc)', () => {
    expect(filterBoardOffers(board).map((o) => o.id)).toEqual(['fox', 'owl', 'dragon']);
  });

  it('поиск — подстрока по имени и описанию, без учёта регистра', () => {
    expect(filterBoardOffers(board, { q: 'рыж' }).map((o) => o.id)).toEqual(['fox']);
    expect(filterBoardOffers(board, { q: 'ФИЛОСОФ' }).map((o) => o.id)).toEqual(['owl']);
    expect(filterBoardOffers(board, { q: ' ' })).toHaveLength(3);
  });

  it('фильтр по редкости', () => {
    expect(filterBoardOffers(board, { rarity: 'legendary' }).map((o) => o.id)).toEqual(['owl', 'dragon']);
    expect(filterBoardOffers(board, { rarity: 'all' })).toHaveLength(3);
    expect(filterBoardOffers(board, { rarity: 'mythic' })).toHaveLength(0);
  });

  it('сортировка по цене с тай-брейком по новизне', () => {
    expect(filterBoardOffers(board, { sort: 'price_asc' }).map((o) => o.id)).toEqual(['fox', 'owl', 'dragon']);
    expect(filterBoardOffers(board, { sort: 'price_desc' }).map((o) => o.id)).toEqual(['dragon', 'owl', 'fox']);
    const tied = [offer('a', { price: 100, createdAt: 1 }), offer('b', { price: 100, createdAt: 2 })];
    expect(filterBoardOffers(tied, { sort: 'price_asc' }).map((o) => o.id)).toEqual(['b', 'a']);
    expect(filterBoardOffers(tied, { sort: 'price_desc' }).map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('поиск и сортировка комбинируются', () => {
    const out = filterBoardOffers(board, { q: 'о', rarity: 'legendary', sort: 'price_asc' });
    expect(out.map((o) => o.id)).toEqual(['owl', 'dragon']);
  });
});

describe('dealCountWord: плюрализация «сделок»', () => {
  it('склоняет по числу', () => {
    expect(dealCountWord(0)).toBe('{p0} сделок');
    expect(dealCountWord(1)).toBe('{p0} сделка');
    expect(dealCountWord(2)).toBe('{p0} сделки');
    expect(dealCountWord(4)).toBe('{p0} сделки');
    expect(dealCountWord(5)).toBe('{p0} сделок');
    expect(dealCountWord(11)).toBe('{p0} сделок');
    expect(dealCountWord(21)).toBe('{p0} сделка');
    expect(dealCountWord(102)).toBe('{p0} сделки');
    expect(dealCountWord(114)).toBe('{p0} сделок');
  });
});
