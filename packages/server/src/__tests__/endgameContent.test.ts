import { describe, it, expect } from 'vitest';
import { loadContentOrThrow } from '@itsim/content';
import { GRADE_ORDER, pickEvent, createNewPlayer } from '@itsim/shared';

/**
 * Эндгейм не должен снова стать пустым (docs/TODO.md §4, P2.3).
 *
 * До 27.09.2026 из 205 событий ни одно не имело порога выше `senior`: архитектор
 * и CTO доживали до того же котла, что и стажёр, — отсюда формулировка плана
 * «трудный, но пустой». Проверки контента такого не ловят: ссылки валидны, схемы
 * целы, просто поздних событий нет. Поэтому здесь проверяется наличие слоя
 * поздней игры и его честность, а не конкретные id.
 */

const { bundle } = loadContentOrThrow();
const LATE_GRADES = ['architect', 'cto'];

const lateEvents = bundle.events.filter((e: any) => LATE_GRADES.includes(e.conditions?.minGrade));

describe('контент поздней игры', () => {
  it('у architect и cto есть собственный пул событий', () => {
    expect(lateEvents.length).toBeGreaterThanOrEqual(6);
    // …и он приходит поздно: «синдром самозванца» в 30 дней на посту CTO — не
    // эндгейм, а баг распределения.
    for (const e of lateEvents) {
      expect(e.minGameDay, `${e.id}.minGameDay`).toBeGreaterThanOrEqual(120);
      // …и не затыкает собой весь пул: вес позднего события обязан быть скромным,
      // иначе редкая ветка становится единственной.
      expect(e.weight, `${e.id}.weight`).toBeLessThanOrEqual(8);
    }
  });

  it('условия по грейду ссылаются на настоящие оценки', () => {
    // `checkConditions` ищет индекс в порядке грейдов; неизвестная строка даёт −1,
    //и «не ниже architect» молча проходит для стажёра. Схема тут не помогает:
    //minGrade — просто z.string().
    for (const e of bundle.events) {
      for (const key of ['minGrade', 'maxGrade'] as const) {
        const grade = e.conditions?.[key];
        if (grade !== undefined) expect(GRADE_ORDER, `${e.id}.conditions.${key}`).toContain(grade);
      }
    }
  });

  it('цепочка позднего события достижима, а не лежит мёртвым грузом', () => {
    const referenced = new Set(
      bundle.events.flatMap((e: any) => (e.choices ?? []).map((c: any) => c.chain?.eventId).filter(Boolean))
    );
    const chainOnly = bundle.events.filter((e: any) => e.chainOnly);
    expect(chainOnly.length).toBeGreaterThan(0);
    for (const e of chainOnly) {
      // В `validate:content` это только warning; здесь — жёстко, потому что
      // «цепочка есть, входа нет» — ровно тот тип молчаливой пустоты, из-за
      // которого эндгейм и опустел.
      expect(referenced.has(e.id), `chainOnly-событие «${e.id}» никто не вызывает`).toBe(true);
    }
  });

  it('оплата поздних проектов растёт вместе с планкой входа', () => {
    const projects = bundle.projects.projects;
    expect(projects.filter((p: any) => p.minSkillLevel >= 35).length).toBeGreaterThanOrEqual(2);
    const byBar = [...projects].sort((a: any, b: any) => a.minSkillLevel - b.minSkillLevel);
    for (let i = 1; i < byBar.length; i++) {
      expect(
        byBar[i].payment,
        `«${byBar[i].id}» требует уровень ${byBar[i].minSkillLevel}, но платит не больше «${byBar[i - 1].id}»`
      ).toBeGreaterThan(byBar[i - 1].payment);
    }
  });

  it('поздние события проходят фильтр пула: их можно встретить, а не только прочитать', () => {
    // Строки в JSON — не гарантия: порог по грейду, minGameDay и кулдаун могут
    // оказаться такими, что событие не выпадет никогда. Прогоняем настоящий
    // `pickEvent` по длинной карьере архитектора и требуем, чтобы каждое
    // позднее событие показалось хотя бы раз.
    const lateIds = lateEvents.map((e: any) => e.id);
    expect(lateIds.length).toBeGreaterThanOrEqual(6);

    const base = {
      ...createNewPlayer(),
      grade: 'architect',
      reputation: 70,
      money: 4_000_000,
      job: { companyId: 'search_everything', grade: 'architect', salaryMonthly: 1_200_000 },
    } as any;

    // Детерминированный LCG: тест не должен зависеть от Math.random.
    let seed = 20260927;
    const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    const seen = new Map<string, number>();
    for (let day = 150; day <= 900; day++) {
      const state = {
        ...base,
        currentDay: day,
        // кулдауны движок считает по истории — ведём её, как это делает день
        eventHistory: Object.fromEntries([...seen.entries()].map(([id, lastDay]) => [id, { lastDay, count: 1 }])),
        recentEventTags: [],
        pendingEvents: [],
      };
      const picked = pickEvent(state, bundle.events, rng);
      if (picked) seen.set(picked.id, day);
    }

    for (const id of lateIds) {
      expect(seen.has(id), `событие «${id}» ни разу не прошло фильтр пула за 750 дней`).toBe(true);
    }
  });

  it('в контенте нет эффектов, которые движок не применяет', () => {
    // 27.09.2026 `speedBonus` и `reputationBonus` убраны из схемы, `items.json`,
    // `balance.json` и подписей магазина: не читались ни одним модулем, но UI
    // уже успел их пообещать. zod молча режет неизвестные ключи, поэтому
    // страховка живёт здесь — на уровне контента, а не валидатора.
    const UNAPPLIED = ['speedBonus', 'reputationBonus'];
    for (const item of bundle.items) {
      for (const key of UNAPPLIED) {
        expect(item.effects ?? {}, `«${item.id}» ссылается на мёртвый ключ ${key}`).not.toHaveProperty(key);
      }
    }
    for (const h of bundle.balance.housing) {
      expect(h, `жильё ${h.level} обещает репутацию, которую никто не начисляет`).not.toHaveProperty('reputationBonus');
    }
  });
});
