import { describe, it, expect } from 'vitest';
import { balanceRng, rngStream, __setRngFactoryForTests } from '../routes/game/shared';
import { migrateState, makeRngSalt } from '@itsim/shared';

/**
 * Серверный RNG баланса (P2.4, docs/PROPOSALS-2026-10-23-rng.md):
 * каждый бросок — seededRng(telegramId:rngSalt:rngSeq++).
 */

function save(overrides: Record<string, unknown> = {}) {
  return { telegramId: '42', rngSalt: 'salt-a', rngSeq: 0, ...overrides } as any;
}

describe('rngStream: детерминизм и соль', () => {
  it('одинаковый сейв → одинаковая последовательность бросков', () => {
    const a = save();
    const b = save();
    const ra = rngStream(a);
    const rb = rngStream(b);
    const seqA = [ra(), ra(), ra()];
    const seqB = [rb(), rb(), rb()];
    expect(seqA).toEqual(seqB);
  });

  it('разная соль → разные броски', () => {
    const ra = rngStream(save({ rngSalt: 'salt-a' }));
    const rb = rngStream(save({ rngSalt: 'salt-b' }));
    expect(ra()).not.toBe(rb());
  });

  it('счётчик монотонен: повтор не «перебрасывает»', () => {
    const state = save();
    const first = rngStream(state)();
    const second = rngStream(state)();
    expect(state.rngSeq).toBe(2);
    expect(first).not.toBe(second);
  });

  it('сейв без полей получает соль и счётчик', () => {
    const state = { telegramId: '1' } as any;
    const r = rngStream(state)();
    expect(state.rngSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(state.rngSeq).toBe(1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });

  it('тестовый сейм подменяет поток целиком', () => {
    try {
      __setRngFactoryForTests(() => () => 0.5);
      expect(balanceRng(save())()).toBe(0.5);
    } finally {
      __setRngFactoryForTests(null);
    }
    // продовая фабрика снова на месте
    expect(balanceRng(save())()).toBe(rngStream(save())());
  });
});

describe('миграция v6_rng_salt', () => {
  it('добавляет поля к старому сейву и не трогает существующую соль', () => {
    const legacy = { version: 5, telegramId: '1', money: 100 } as any;
    const { state, applied } = migrateState<any>(legacy);
    expect(applied).toContain('v6_rng_salt');
    expect(state.rngSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(state.rngSeq).toBe(0);

    const withSalt = { version: 5, telegramId: '1', rngSalt: 'my-salt', rngSeq: 41 } as any;
    const second = migrateState<any>(withSalt);
    expect(second.state.rngSalt).toBe('my-salt');
    expect(second.state.rngSeq).toBe(41);
  });

  it('makeRngSalt даёт 32 hex-символа и разные соли', () => {
    const s1 = makeRngSalt();
    const s2 = makeRngSalt();
    expect(s1).toMatch(/^[0-9a-f]{32}$/);
    expect(s1).not.toBe(s2);
  });
});
