/**
 * Память мира (DESIGN-LIVING-WORLD §2/§4).
 *
 * Три закона: значимый акт оставляет след; след возвращается; память видна.
 * Здесь — учёт следов (`state.memories`) и стойкости компаний
 * (`state.companyStanding`). Возврат следа (сиквелы, эффекты) — на сервере
 * и в контенте; показ — в «Хронике» и карточке «Мир помнит».
 */

import type { CompanyStanding, MemoryRecord, PlayerState } from '../types';

/** Память не пухнет: ротация старых следов. */
export const MAX_MEMORIES = 60;

let memSeq = 0;

function memoryId(day: number): string {
  memSeq += 1;
  return `mem:${day}:${Date.now().toString(36)}:${memSeq}`;
}

/**
 * Записать след. Возвращает записанный след. Клиент показывает текст как
 * есть (RU — t() на границе рендера).
 */
export function recordMemory(
  state: Pick<PlayerState, 'memories' | 'currentDay'>,
  rec: Omit<MemoryRecord, 'id' | 'day'> & { id?: string; day?: number }
): MemoryRecord {
  const record: MemoryRecord = {
    id: rec.id ?? memoryId(rec.day ?? state.currentDay ?? 1),
    day: rec.day ?? state.currentDay ?? 1,
    subject: rec.subject,
    kind: rec.kind,
    text: rec.text,
  };
  const feed = state.memories ?? [];
  state.memories = [record, ...feed].slice(0, MAX_MEMORIES);
  return record;
}

/** Последние следы (новые сверху). */
export function recentMemories(state: Pick<PlayerState, 'memories'>, limit = 2): MemoryRecord[] {
  return (state.memories ?? []).slice(0, limit);
}

/** Следы по теме: 'company:id' | 'npc:id' | 'rival' | 'self'. */
export function memoriesOf(state: Pick<PlayerState, 'memories'>, subject: string, limit = 5): MemoryRecord[] {
  return (state.memories ?? []).filter((m) => m.subject === subject).slice(0, limit);
}

/** Стойкость компании (пустая запись по умолчанию). */
export function companyStandingOf(state: Pick<PlayerState, 'companyStanding'>, companyId: string): CompanyStanding {
  return (
    state.companyStanding?.[companyId] ?? {
      applied: 0,
      offers: 0,
      rejections: 0,
      daysWorked: 0,
    }
  );
}

/** Изменить стойкость компании (создаёт запись при первом обращении). */
export function bumpCompanyStanding(
  state: Pick<PlayerState, 'companyStanding'>,
  companyId: string,
  field: keyof CompanyStanding,
  by = 1
): void {
  const cur = companyStandingOf(state, companyId);
  const next: CompanyStanding = { ...cur };
  if (field === 'closedUntilDay') {
    next.closedUntilDay = by;
  } else {
    next[field] = (next[field] as number) + by;
  }
  state.companyStanding = { ...(state.companyStanding ?? {}), [companyId]: next };
}
