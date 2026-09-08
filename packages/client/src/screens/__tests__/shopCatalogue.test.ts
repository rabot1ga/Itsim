import { describe, expect, it } from 'vitest';
import { itemCategory, itemEffects, shopMoney, type ShopItem } from '../shopCatalogue';

const item = (overrides: Partial<ShopItem>): ShopItem => ({
  id: 'desk_plant',
  name: 'Растение',
  type: 'other',
  price: 500,
  description: '',
  ...overrides,
});
describe('shop catalogue presentation', () => {
  it('categorizes equipment, home, pets and courses without dropping unknown types', () => {
    expect(itemCategory(item({ id: 'mining_gpu' }))).toBe('equipment');
    expect(itemCategory(item({ type: 'headphones' }))).toBe('equipment');
    expect(itemCategory(item({ type: 'pet' }))).toBe('pets');
    expect(itemCategory(item({ type: 'course' }))).toBe('courses');
    expect(itemCategory(item({ type: 'future_type' }))).toBe('home');
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
