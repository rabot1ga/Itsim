/**
 * Человеческие подписи игрока: название навыка, грейд.
 *
 * Полные каталоги живут в контенте (`/api/content/skills` — 34 навыка) и в
 * серверных ответах; здесь — ровно тот слой, который нужен поверху без
 * дополнительного запроса: тултипы ресурсной панели, «Профиль», подписи
 * эффектов события. Неизвестный id отдаётся как есть — контент всегда шире,
 * чем этот список, и молча пустая строка была бы хуже.
 */

export const SKILL_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  react: 'React',
  nodejs: 'Node.js',
  go: 'Go',
  java: 'Java',
  git: 'Git',
  docker: 'Docker',
  linux: 'Linux',
  english: 'Английский',
  communication: 'Коммуникация',
};

export function skillName(id: string): string {
  return SKILL_NAMES[id] ?? id;
}

export const GRADE_LABELS: Record<string, string> = {
  unemployed: 'В начале пути',
  intern: 'Стажёр',
  junior: 'Junior Developer',
  middle: 'Middle Developer',
  senior: 'Senior Developer',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

export function gradeLabel(grade?: string | null): string {
  if (!grade) return GRADE_LABELS.unemployed;
  return GRADE_LABELS[grade] ?? grade;
}
