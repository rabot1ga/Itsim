import { describe, it, expect } from 'vitest';
import {
  marketplaceListings,
  marketDay,
  offerPriceBounds,
  isOfferPriceAllowed,
  type MarketItemDef,
  type MarketPoolItem,
} from '../marketplace';

/**
 * Торговая площадка: детерминированная подборка дня (seed = игрок + день),
 * взвешенно без возврата, ровно count позиций.
 */

const items: MarketItemDef[] = [
  { id: 'pet_fox', price: 90_000, rarity: 'rare' },
  { id: 'pet_owl', price: 120_000, rarity: 'rare' },
  { id: 'pet_cat_shadow', price: 400_000, rarity: 'legendary' },
];
const pool: MarketPoolItem[] = [
  { itemId: 'pet_fox', weight: 30 },
  { itemId: 'pet_owl', weight: 30 },
  { itemId: 'pet_cat_shadow', weight: 10 },
];

describe('marketDay: ротация по реальному UTC-дню', () => {
  it('день меняется раз в сутки', () => {
    const day = 20_000;
    expect(marketDay(day * 86_400_000)).toBe(day);
    expect(marketDay(day * 86_400_000 + 86_399_999)).toBe(day);
    expect(marketDay(day * 86_400_000 + 86_400_000)).toBe(day + 1);
  });
});

describe('marketplaceListings', () => {
  it('детерминирована: одинаковый seed — одинаковая витрина', () => {
    const a = marketplaceListings(items, pool, 2, 'u1:20000');
    const b = marketplaceListings(items, pool, 2, 'u1:20000');
    expect(a).toEqual(b);
  });

  it('разные игроки/дни видят разные подборки (обычно)', () => {
    const a = marketplaceListings(items, pool, 2, 'u1:20000').map((l) => l.itemId);
    const b = marketplaceListings(items, pool, 2, 'u2:20000').map((l) => l.itemId);
    const c = marketplaceListings(items, pool, 2, 'u1:20001').map((l) => l.itemId);
    // не строго обязательно различие, но при 3 позициях пула и count=2
    // совпадение двух пар подряд маловероятно; проверяем хотя бы одну разницу
    expect(JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(a) !== JSON.stringify(c)).toBe(true);
  });

  it('без дублей, цены/редкость из определений, уважает count', () => {
    const out = marketplaceListings(items, pool, 3, 'u1:20000');
    expect(out).toHaveLength(3);
    expect(new Set(out.map((l) => l.itemId)).size).toBe(3);
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const l of out) {
      expect(l.price).toBe(byId.get(l.itemId)!.price);
      expect(l.rarity).toBe(byId.get(l.itemId)!.rarity);
    }
    // count больше пула — не больше пула
    expect(marketplaceListings(items, pool, 10, 'u1:20000')).toHaveLength(3);
  });

  it('мусор в пуле и items игнорируется', () => {
    const out = marketplaceListings(items, [...pool, { itemId: 'ghost', weight: 999 }], 3, 'u1:20000');
    expect(out.map((l) => l.itemId)).not.toContain('ghost');
  });
});

describe('P2P: ценовой коридор (антифрод)', () => {
  it('коридор 50–300% базы с шагом 100 ₽', () => {
    expect(offerPriceBounds(90000)).toEqual({ min: 45000, max: 270000 });
    expect(offerPriceBounds(800000)).toEqual({ min: 400000, max: 2400000 });
    // мелкая база: минимум не ниже 100 ₽
    expect(offerPriceBounds(10).min).toBe(100);
  });

  it('цена вне коридора, дробная и неположительная — отказ', () => {
    expect(isOfferPriceAllowed(90000, 45000)).toBe(true);
    expect(isOfferPriceAllowed(90000, 270000)).toBe(true);
    expect(isOfferPriceAllowed(90000, 44999)).toBe(false);
    expect(isOfferPriceAllowed(90000, 270100)).toBe(false);
    expect(isOfferPriceAllowed(90000, 90000.5)).toBe(false);
    expect(isOfferPriceAllowed(90000, 0)).toBe(false);
    expect(isOfferPriceAllowed(90000, -5)).toBe(false);
    expect(isOfferPriceAllowed(90000, Number.NaN)).toBe(false);
  });
});
