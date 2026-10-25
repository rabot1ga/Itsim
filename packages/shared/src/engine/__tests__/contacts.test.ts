import { describe, it, expect } from 'vitest';
import {
  addContacts,
  spendContacts,
  contactsOf,
  CONTACTS_CAP,
  RECOMMENDATION_COST,
  FREELANCE_LEAD_COST,
  P2P_DISCOUNT_COST,
} from '../contacts';
import { migrateState } from '../migrations';
import type { PlayerState } from '../types';

/** D2 «Связи как ресурс» (25.10.2026). */

function state(over: Partial<PlayerState> = {}): PlayerState {
  return { contacts: 0, ...over } as PlayerState;
}

describe('contacts: начисление и кап', () => {
  it('addContacts копит и упирается в кап', () => {
    const p = state({ contacts: 18 });
    addContacts(p, 5);
    expect(p.contacts).toBe(CONTACTS_CAP); // 23 → 20
  });

  it('не уходит в минус', () => {
    const p = state({ contacts: 2 });
    addContacts(p, -10);
    expect(p.contacts).toBe(0);
  });

  it('contactsOf округляет и клампит кривые значения', () => {
    expect(contactsOf({ contacts: 7.6 } as PlayerState)).toBe(8);
    expect(contactsOf({} as PlayerState)).toBe(0);
    expect(contactsOf({ contacts: 999 } as PlayerState)).toBe(CONTACTS_CAP);
  });
});

describe('contacts: траты', () => {
  it('spendContacts списывает при хватке', () => {
    const p = state({ contacts: RECOMMENDATION_COST });
    expect(spendContacts(p, RECOMMENDATION_COST)).toBe(true);
    expect(p.contacts).toBe(0);
  });

  it('spendContacts не трогает стат при нехватке', () => {
    const p = state({ contacts: RECOMMENDATION_COST - 1 });
    expect(spendContacts(p, RECOMMENDATION_COST)).toBe(false);
    expect(p.contacts).toBe(RECOMMENDATION_COST - 1);
  });

  it('стоимости трат упорядочены: рекомендация > лид > скидка', () => {
    expect(RECOMMENDATION_COST).toBeGreaterThan(FREELANCE_LEAD_COST);
    expect(FREELANCE_LEAD_COST).toBeGreaterThan(P2P_DISCOUNT_COST);
  });
});

describe('contacts: миграция старых сейвов', () => {
  it('normalizeState доставляет contacts=0 и клампит кривые', () => {
    const clean = migrateState({ version: 9 } as never);
    expect(clean.state.contacts).toBe(0);

    const wild = migrateState({ version: 9, contacts: 42 } as never);
    expect(wild.state.contacts).toBe(CONTACTS_CAP);
  });
});
