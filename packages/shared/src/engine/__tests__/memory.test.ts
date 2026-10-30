import { describe, expect, it } from 'vitest';
import {
  MAX_MEMORIES,
  bumpCompanyStanding,
  companyStandingOf,
  memoriesOf,
  recentMemories,
  recordMemory,
} from '../memory';

/**
 * Память мира (DESIGN-LIVING-WORLD): значимый акт оставляет след; след
 * возвращается; память видна. Закон 3 здесь — «без скрытых счётчиков»:
 * всё, что накапливо, читаемо через recentMemories/memoriesOf.
 */
describe('recordMemory', () => {
  it('след пишется сверху и помнит день', () => {
    const state: any = { currentDay: 12, memories: [] };
    const rec = recordMemory(state, { subject: 'company:portal_2000', kind: 'application', text: 'Отклик' });
    expect(rec.day).toBe(12);
    expect(state.memories[0]).toBe(rec);
    recordMemory(state, { subject: 'self', kind: 'event', text: 'Что-то' });
    expect(recentMemories(state, 1)[0].text).toBe('Что-то');
  });

  it('память не пухнет: ротация по MAX_MEMORIES', () => {
    const state: any = { currentDay: 1, memories: [] };
    for (let i = 0; i < MAX_MEMORIES + 10; i++) {
      recordMemory(state, { subject: 'self', kind: 'event', text: `След ${i}` });
    }
    expect(state.memories).toHaveLength(MAX_MEMORIES);
    expect(state.memories[0].text).toBe(`След ${MAX_MEMORIES + 9}`);
  });

  it('memoriesOf фильтрует по теме', () => {
    const state: any = {
      currentDay: 3,
      memories: [
        { id: 'a', day: 2, subject: 'company:x', kind: 'hire', text: '1' },
        { id: 'b', day: 1, subject: 'npc:masha', kind: 'friend', text: '2' },
        { id: 'c', day: 0, subject: 'company:x', kind: 'application', text: '3' },
      ],
    };
    expect(memoriesOf(state, 'company:x').map((m) => m.text)).toEqual(['1', '3']);
    expect(memoriesOf(state, 'rival')).toEqual([]);
  });
});

describe('companyStandingOf / bumpCompanyStanding', () => {
  it('пустая запись по умолчанию', () => {
    expect(companyStandingOf({ companyStanding: {} }, 'x')).toEqual({
      applied: 0,
      offers: 0,
      rejections: 0,
      daysWorked: 0,
    });
  });

  it('счётчики копятся, дверь закрывается датой', () => {
    const state: any = { companyStanding: {} };
    bumpCompanyStanding(state, 'portal_2000', 'applied');
    bumpCompanyStanding(state, 'portal_2000', 'applied');
    bumpCompanyStanding(state, 'portal_2000', 'rejections');
    bumpCompanyStanding(state, 'portal_2000', 'closedUntilDay', 30);
    const s = companyStandingOf(state, 'portal_2000');
    expect(s.applied).toBe(2);
    expect(s.rejections).toBe(1);
    expect(s.closedUntilDay).toBe(30);
    // соседняя компания не затронута
    expect(companyStandingOf(state, 'other').applied).toBe(0);
  });
});
