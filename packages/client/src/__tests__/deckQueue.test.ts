import { describe, expect, it } from 'vitest';
import { buildQueue } from '../components/DeckView';

/**
 * Состав стека дня (DESIGN-DECK §3): гарантированные карточки + «сезон»
 * недели (§7.3): зарплата и ревью приходят карточками-событиями, а не
 * невидимыми списаниями в сводке.
 */

const player = (over: Record<string, unknown> = {}) =>
  ({
    currentDay: 1,
    energy: 10,
    money: 50_000,
    motivation: 60,
    job: { position: 'Junior', salary: 90_000 },
    skills: {},
    softSkills: {},
    dailyChallenge: null,
    ...over,
  }) as any;

// firstStepsItems читает steps.* — «всё сделано», чтобы чек-лист не мешал проверкам
const STEPS = { action: true, focus: true } as never;

const kinds = (p: any, onboarded = true) => buildQueue(p, null, STEPS, onboarded).map((s) => s.kind);

describe('buildQueue: сезон недели', () => {
  it('зарплата — карточка дня, кратного семи (работа есть)', () => {
    const q = kinds(player({ currentDay: 7 }));
    expect(q).toContain('payday');
    // порядок: утро → зарплата → … → завершение
    expect(q.indexOf('payday')).toBeGreaterThan(q.indexOf('morning'));
    expect(q.indexOf('payday')).toBeLessThan(q.indexOf('end'));
  });

  it('без работы зарплаты нет; в обычный день — тоже', () => {
    expect(kinds(player({ currentDay: 7, job: null }))).not.toContain('payday');
    expect(kinds(player({ currentDay: 8 }))).not.toContain('payday');
  });

  it('ревью недели — карточка середины недели', () => {
    expect(kinds(player({ currentDay: 3 }))).toContain('weekly_review');
    expect(kinds(player({ currentDay: 4 }))).not.toContain('weekly_review');
    // ревью не зависит от наличия работы
    expect(kinds(player({ currentDay: 10, job: null }))).toContain('weekly_review');
  });

  it('новый день начинается с утра и заканчивается «Завершить день»', () => {
    const q = kinds(player({ currentDay: 5 }));
    expect(q[0]).toBe('morning');
    expect(q[q.length - 1]).toBe('end');
  });

  it('«Мир помнит» — раз в три дня, если есть следы', () => {
    const mem = [{ id: 'm1', day: 1, subject: 'self', kind: 'event', text: 'След' }];
    // day % 3 === 2 → карточка есть
    expect(kinds(player({ currentDay: 5, memories: mem }))).toContain('memory');
    // в другой день — нет
    expect(kinds(player({ currentDay: 6, memories: mem }))).not.toContain('memory');
    // без следов — нет
    expect(kinds(player({ currentDay: 5, memories: [] }))).not.toContain('memory');
  });

  it('соперник: карточка в пятницу или когда опередил', () => {
    const rival = { name: 'Марина', branch: 'main', progress: 25, day: 1 };
    // пятница (day % 7 === 5) при наличии соперника
    expect(kinds(player({ currentDay: 5, rival }))).toContain('rival');
    // соперник опередил (progress 25 > power 14) — карточка в любой день
    expect(kinds(player({ currentDay: 2, rival }))).toContain('rival');
    // соперник позади и не пятница — нет
    expect(
      kinds(
        player({
          currentDay: 2,
          rival: { ...rival, progress: 1 },
          skills: { javascript: { level: 5, xp: 0 } },
        })
      )
    ).not.toContain('rival');
    // без соперника — нет
    expect(kinds(player({ currentDay: 5 }))).not.toContain('rival');
  });

  it('интро — первые карточки только без флага onboarded', () => {
    const fresh = kinds(player({ currentDay: 5 }), false);
    expect(fresh.slice(0, 2)).toEqual(['intro', 'intro']);
    const back = kinds(player({ currentDay: 5 }), true);
    expect(back).not.toContain('intro');
  });
});
