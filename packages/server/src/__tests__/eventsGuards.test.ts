import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EventsFileSchema } from '@itsim/shared';

/**
 * Инварианты контента событий (25.10.2026, чинка «случайные события
 * нелогичны»): (1) рабочие теги обязаны гейтиться работой — явным
 * `conditions.hasJob: true` либо пометкой `allowWithoutJob`; (2) выбор с
 * «ценой» (глагол покупки + отрицательный эффект) обязан требовать деньги
 * через `requires` — иначе при пустом кошеле покупка становится бесплатной
 * (applyEventEffects клампит деньги в 0).
 */

const EVENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'events');

const WORK_TAGS = new Set(['work', 'office', 'sprint', 'project']);
const PURCHASE_VERBS = /купить|оплат|влож|заплат|потрат|предлож|подар|снять в аренду|аренду|заказать|инвест/i;

function allEvents(): any[] {
  const out: any[] = [];
  for (const name of readdirSync(EVENTS_DIR)) {
    if (!name.endsWith('.json')) continue;
    out.push(...JSON.parse(readFileSync(join(EVENTS_DIR, name), 'utf-8')));
  }
  return out;
}

describe('events content: гейты работы и цен', () => {
  const events = allEvents();

  it('контент парсится строгой схемой', () => {
    expect(() => EventsFileSchema.parse(events)).not.toThrow();
    expect(events.length).toBeGreaterThanOrEqual(200);
  });

  it('рабочие события либо требуют работу, либо явное исключение', () => {
    const offenders = events.filter((e: any) => {
      const workTag = e.tags.some((t: string) => WORK_TAGS.has(t));
      if (!workTag || e.allowWithoutJob) return false;
      return e.conditions?.hasJob !== true;
    });
    expect(
      offenders.map((e: any) => e.id),
      'события с рабочими тегами без hasJob и без allowWithoutJob'
    ).toEqual([]);
  });

  it('покупательные выборы требуют деньги (глагол + трата без requires — дрейф контента)', () => {
    const offenders: string[] = [];
    for (const e of events) {
      for (const ch of e.choices ?? []) {
        const eff = ch.effects ?? {};
        const txt: string = ch.text ?? '';
        if (eff.money < 0 && !ch.requires?.money && PURCHASE_VERBS.test(txt)) {
          offenders.push(`${e.id}: «${txt}»`);
        }
        if (eff.energy < 0 && !ch.requires?.energy && PURCHASE_VERBS.test(txt)) {
          offenders.push(`${e.id}: «${txt}» (энергия)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('requires денег покрывает полную цену (нельзя «заплатить 5000» при 3000)', () => {
    const short: string[] = [];
    for (const e of events) {
      for (const ch of e.choices ?? []) {
        const eff = ch.effects ?? {};
        if (eff.money < 0 && ch.requires?.money && ch.requires.money < Math.abs(eff.money)) {
          short.push(`${e.id}: требует ${ch.requires.money}, трата ${eff.money}`);
        }
      }
    }
    expect(short).toEqual([]);
  });
});
