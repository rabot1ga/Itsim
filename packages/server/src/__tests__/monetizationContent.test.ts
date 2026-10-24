import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MonetizationSchema } from '@itsim/shared';

/**
 * Реальный `content/monetization.json` против схемы и политики «никакого
 * pay-to-win»: гранты — только косметика, банк дней и значки; сезонные
 * наборы — комплекты косметики со скидкой за сборку.
 */

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content');

function raw(): any {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'monetization.json'), 'utf-8'));
}

const GRANT_KEYS = new Set(['bankedDays', 'bankSlots', 'cosmetics', 'badge']);

describe('monetization.json: каталог Stars', () => {
  it('проходит строгую схему (и повторный парсинг ничего не теряет)', () => {
    const parsed = MonetizationSchema.parse(raw());
    expect(parsed.products.length).toBeGreaterThanOrEqual(9);
    expect(parsed.currency).toBe('XTR');
    expect(parsed.policy).toContain('pay-to-win');
  });

  it('id уникальны, метки витрины валидны у всех позиций', () => {
    const parsed = MonetizationSchema.parse(raw());
    const ids = parsed.products.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of parsed.products) {
      expect(['support', 'utility', 'cosmetic', 'seasonal']).toContain(p.tag);
    }
  });

  it('гранты — только косметика/банк/значки (политика без pay-to-win)', () => {
    for (const p of raw().products) {
      for (const key of Object.keys(p.grants ?? {})) {
        expect(GRANT_KEYS, `product ${p.id} grant «${key}» запрещён политикой`).toContain(key);
      }
    }
  });

  it('сезонные наборы — комплект ≥3 косметик со скидкой против поштучных 75⭐', () => {
    const parsed = MonetizationSchema.parse(raw());
    const seasonal = parsed.products.filter((p: any) => p.tag === 'seasonal');
    expect(seasonal.length).toBeGreaterThanOrEqual(2);
    for (const pack of seasonal) {
      expect(pack.grants.cosmetics.length).toBeGreaterThanOrEqual(3);
      expect(pack.grants.badge).toBeTruthy();
      expect(pack.repeatable).toBe(false);
      // 3 × 75⭐ (поштучный стандарт паков) = 225 — набор дешевле
      expect(pack.stars).toBeLessThan(pack.grants.cosmetics.length * 75);
    }
  });

  it('новые позиции на месте: поддержка ×2 и наборы ×2', () => {
    const byId = new Map(MonetizationSchema.parse(raw()).products.map((p: any) => [p.id, p]));
    expect(byId.get('support_lunch')).toMatchObject({ stars: 100, tag: 'support', repeatable: true });
    expect(byId.get('support_patron')).toMatchObject({ stars: 500, tag: 'support', repeatable: true });
    expect(byId.get('winter_pack')?.grants.cosmetics).toEqual(['pet_santa', 'pet_mitten', 'pet_snowflake']);
    expect(byId.get('summer_pack')?.grants.cosmetics).toEqual(['pet_flower', 'pet_icecream', 'pet_sun']);
  });
});
