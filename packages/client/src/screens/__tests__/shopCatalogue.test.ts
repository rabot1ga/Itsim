import { describe, expect, it } from 'vitest';
import {
  itemEffects,
  itemInCategory,
  shopCategoriesFromBalance,
  shopMoney,
  type ShopCategoryDef,
  type ShopItem,
} from '../shopCatalogue';

const item = (overrides: Partial<ShopItem>): ShopItem => ({
  id: 'desk_plant',
  name: 'Растение',
  type: 'other',
  price: 500,
  description: '',
  ...overrides,
});

const FALLBACK_CATALOGUE: ShopCategoryDef[] = [
  { id: 'equipment', label: 'Техника', match: ['pc', 'headphones'], matchIds: ['mechanical_keyboard', 'solar_panel'], matchPrefixes: ['mining_'] },
  { id: 'home', label: 'Для дома', match: ['housing', 'chair', 'coffee', 'other'] },
  { id: 'pets', label: 'Питомцы', match: ['pet'] },
  { id: 'courses', label: 'Курсы', match: ['course'] },
];

describe('shop catalogue presentation', () => {
  it('matches equipment, home, pets and courses via content-driven catalogue', () => {
    expect(itemInCategory(item({ id: 'mining_gpu' }), 'equipment', FALLBACK_CATALOGUE)).toBe(true);
    expect(itemInCategory(item({ type: 'headphones' }), 'equipment', FALLBACK_CATALOGUE)).toBe(true);
    expect(itemInCategory(item({ type: 'pet' }), 'pets', FALLBACK_CATALOGUE)).toBe(true);
    expect(itemInCategory(item({ type: 'course' }), 'courses', FALLBACK_CATALOGUE)).toBe(true);
    // 'other' is the explicit "home" catch-all in the content catalogue
    expect(itemInCategory(item({ type: 'other' }), 'home', FALLBACK_CATALOGUE)).toBe(true);
    expect(itemInCategory(item({ type: 'other' }), 'equipment', FALLBACK_CATALOGUE)).toBe(false);
  });
  it('falls back to the heuristic when no content catalogue is provided', () => {
    expect(itemInCategory(item({ id: 'mining_gpu' }), 'equipment', undefined)).toBe(true);
    expect(itemInCategory(item({ type: 'pet' }), 'pets', undefined)).toBe(true);
    expect(itemInCategory(item({ type: 'course' }), 'courses', undefined)).toBe(true);
    expect(itemInCategory(item({ type: 'future_type' }), 'home', undefined)).toBe(true);
  });
  it('flattens balance.shop.categories to the {id,label} tab strip', () => {
    const tabs = shopCategoriesFromBalance([
      { id: 'all', label: 'Все', match: 'all' },
      { id: 'gear', label: 'Gear', match: ['pc'] },
    ]);
    expect(tabs.map((t) => t.id)).toEqual(['all', 'gear']);
    expect(shopCategoriesFromBalance(undefined).map((t) => t.id)).toEqual(
      expect.arrayContaining(['all', 'equipment', 'home', 'pets', 'courses'])
    );
  });
  it('formats content-driven percentages and absolute bonuses', () => {
    expect(itemEffects(item({ effects: { xpBonus: 0.05, energyBonus: 2 } }))).toBe('+5% опыт · +2 энергия');
    expect(itemEffects(item({ effects: { healthBonus: -1 } }))).toBe('-1 здоровье');
  });
  it('does not invent bonuses for empty, unknown or malformed effects', () => {
    expect(itemEffects(item({}))).toBe('Без пассивного бонуса');
    expect(itemEffects(item({ effects: { xpBonus: 0, energyBonus: NaN, future: 5 } }))).toBe('Без пассивного бонуса');
  });
  it('never rounds a purchase price to thousands', () => {
    expect(shopMoney(1550)).toBe('1\u00a0550 ₽');
    expect(shopMoney(500)).toBe('500 ₽');
  });
});
