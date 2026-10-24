/**
 * Автопостинг вех (README «В процессе»): лента авто-постов «Стал сеньор за
 * 78 дней!». Сервер зовёт `recordMilestones` при мутациях сейва (day/action),
 * факты детектятся по текущему состоянию и идемпотентны по `id`.
 *
 * Подпись собирается через gettext-ключ + params (`t(key, params)`), числовой
 * оборот «за N дней» — через параметр-слово (`день`/`дня`/`дней`), который t()
 * авто-переводит (3 формы RU → 2 формы EN).
 *
 * Семантика дня: пост пишется мутацией, в которой факт стал верным, —
 * «за N дней» = N-й день пути. Факты, верные до первого запуска фичи,
 * отмечаются сегодняшним днём (ретро-всплеск на старых сейвах).
 */
import type { Milestone, PlayerState } from '../types/index.js';

/** Лента не растёт бесконечно: в профиле видно последнее. */
export const MAX_MILESTONES = 30;

/** Минимальный контур баланса для подписи финала (title из контента). */
export interface MilestoneBalance {
  endings?: Record<string, { title?: string }>;
}

/** Русские формы слова «день»: 1 день, 2 дня, 5 дней. */
export function dayWord(n: number): 'день' | 'дня' | 'дней' {
  const a = Math.abs(Math.trunc(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b === 1) return 'день';
  if (b >= 2 && b <= 4) return 'дня';
  return 'дней';
}

/** Название грейда как ключ словаря (без перевода — для params подписи). */
export function gradeWord(grade: string): string {
  const map: Record<string, string> = {
    unemployed: 'без работы',
    intern: 'стажёр',
    junior: 'джун',
    middle: 'мидл',
    senior: 'сеньор',
    teamlead: 'тимлид',
    architect: 'архитектор',
    cto: 'CTO',
  };
  return map[grade] ?? grade;
}

/** Рабочие грейды карьерной лестницы (без unemployed). */
const WORK_GRADES = new Set(['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto']);

/** Все факты, которые уже верны для состояния (в порядке появления). */
function collectMilestones(state: PlayerState, balance?: MilestoneBalance): Milestone[] {
  const out: Milestone[] = [];
  const day = state.currentDay ?? 1;
  // Грейд постится один раз за жизнь (id-факт): «стал мидлом» — в мутации,
  // где грейд сменился; прыжок через ступени постит только целевой грейд.
  const grade = String(state.grade);
  if (WORK_GRADES.has(grade)) {
    out.push({
      id: `grade:${grade}`,
      day,
      key: 'Стал {p0} за {p1} {p2}!',
      params: { p0: gradeWord(grade), p1: day, p2: dayWord(day) },
    });
  }
  if ((state.money ?? 0) >= 1_000_000) {
    out.push({ id: 'million', day, key: 'Первый миллион на {p1}-й день!', params: { p1: day } });
  }
  if (day >= 365) {
    out.push({ id: 'year', day, key: 'Год в IT — и ты ещё здесь!' });
  }
  if (state.careerEnding) {
    const title = balance?.endings?.[state.careerEnding]?.title ?? state.careerEnding;
    out.push({
      id: `ending:${state.careerEnding}`,
      day,
      key: 'Финал: {p0}',
      params: { p0: title },
    });
  }
  return out;
}

/**
 * Дописать в ленту новые вехи состояния. Идемпотентно: повторный вызов
 * ничего не дублирует (факт = id). Возвращает только свежие посты —
 * для сообщений игроку.
 */
export function recordMilestones(state: PlayerState, balance?: MilestoneBalance): Milestone[] {
  const facts = collectMilestones(state, balance);
  const have = new Set((state.milestones ?? []).map((m) => m.id));
  const fresh = facts.filter((f) => !have.has(f.id));
  if (fresh.length > 0) {
    state.milestones = [...fresh.slice().reverse(), ...(state.milestones ?? [])].slice(0, MAX_MILESTONES);
  }
  return fresh;
}
