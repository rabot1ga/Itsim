import type { PlayerState, Grade } from '../types';
import type { BalanceConfig } from '../schemas';

/**
 * Career endings — проверка того, что игрок достиг одного из финалов.
 *
 * Шесть финалов описаны в ТЗ и в `balance.json` (`endings.*`):
 *   - `cto`        : special-board election (`/api/game/action: cto_elect`)
 *   - `exit`       : стартап ≥ 100 млн (money + reputation + senior+)
 *   - `free_artist`: фриланс (senior+ при деньгах < 1 млн)
 *   - `teacher`    : 50+ джунов на менторстве
 *   - `burnout`    : терминальное — здоровье/мотивация в нуле N дней подряд
 *   - `left_it`    : терминальное — без денег N дней подряд
 *
 * Проверка чистая, без побочных эффектов: тот же движок на сервере (state
 * mutation) и в UI (подсветка «доступен ли финал уже сейчас»).
 */

export type EndingId = 'cto' | 'exit' | 'free_artist' | 'teacher' | 'burnout' | 'left_it';

export interface EndingRequirement {
  /** id финала в `balance.endings` */
  id: EndingId;
  /** глагол для UI-кнопки */
  action: 'claim' | 'restart';
  /** выполняются ли все условия прямо сейчас */
  available: boolean;
  /** причина блокировки (если `available === false`) */
  missing?: string;
  /** заголовок/описание из контента (с дефолтами) */
  title: string;
  description: string;
}

const GRADE_RANK: Record<Grade, number> = {
  unemployed: 0,
  intern: 1,
  junior: 2,
  middle: 3,
  senior: 4,
  teamlead: 5,
  architect: 6,
  cto: 7,
};

function gradeAtLeast(playerGrade: Grade, minGrade: Grade): boolean {
  return GRADE_RANK[playerGrade] >= GRADE_RANK[minGrade];
}

/** Default positive-endings thresholds, used when balance.endings.<id> is missing. */
const DEFAULTS = {
  cto: {
    minReputation: 68,
    minLeadership: 32,
    title: '🏢 Корпоративный бог · CTO',
    description: 'Борд избрал тебя CTO. Корпорация — это ты.',
  },
  exit: {
    minReputation: 80,
    minMoney: 100_000_000,
    minGrade: 'senior' as Grade,
    title: '🚀 Экзит · Стартап-единорог',
    description: 'Ты ушёл в свой проект, и его оценили в 100 млн. Жизнь на своих условиях — самый дорогой приз.',
  },
  free_artist: {
    minReputation: 40,
    maxMoney: 1_000_000,
    minGrade: 'senior' as Grade,
    title: '💻 Свободный художник',
    description: 'Никакого офиса. Только ты, клиенты и код. Меньше денег — больше свободы.',
  },
  teacher: {
    minReputation: 60,
    minMentoredJuniors: 50,
    title: '🎓 Учитель',
    description: '50 джунов выросли под твоим менторством. Их успехи — твои.',
  },
  burnout: {
    title: '🔥 Выгорание',
    description: 'Здоровье и мотивация в нуле. Тело и психика сказали «стоп». Следующая жизнь — с +15% XP.',
  },
  left_it: {
    title: '💀 Ушёл из IT',
    description: 'Денег нет, перспектив тоже. Ты закрыл редактор и пошёл учиться на повара. Следующая жизнь — с чистого листа.',
  },
};

/**
 * Check all six endings against current player state.
 *
 * - `burnout` / `left_it` are always "available" once the trigger fires
 *   (`burnoutDays` / `brokeDaysToQuit`) — they are terminal, not chosen.
 * - `cto` is a "claim" because it comes from a real board election action.
 * - `exit` / `free_artist` / `teacher` are "claim" once thresholds are met.
 */
export function checkEndings(player: PlayerState, balance: BalanceConfig | undefined): EndingRequirement[] {
  const endings = balance?.endings;
  if (!endings) return [];

  const rep = Math.round(player.reputation ?? 0);
  const money = Math.round(player.money ?? 0);
  const grade = (player.grade ?? 'unemployed') as Grade;
  const leadership = Math.round(player.leadership ?? 0);
  const mentored = Math.round(player.mentoredJuniors ?? 0);
  const burnoutDays = Math.round(player.burnoutDays ?? 0);
  const brokeDays = Math.round(player.brokeDays ?? 0);

  const out: EndingRequirement[] = [];

  // ── Positive: CTO (board election)
  const cto = { ...DEFAULTS.cto, ...endings.cto };
  const ctoMet = rep >= cto.minReputation && leadership >= cto.minLeadership;
  out.push({
    id: 'cto',
    action: 'claim',
    available: ctoMet && grade === 'cto',
    missing: !ctoMet
      ? `Нужно: репутация ${cto.minReputation}+, лидерство ${cto.minLeadership}+ (сейчас ${rep}/${leadership})`
      : grade !== 'cto'
        ? 'Сначала стань CTO'
        : undefined,
    title: cto.title,
    description: cto.description,
  });

  // ── Positive: Exit / startup
  const exit = { ...DEFAULTS.exit, ...endings.exit };
  const exitMet = rep >= exit.minReputation && money >= exit.minMoney && gradeAtLeast(grade, exit.minGrade);
  out.push({
    id: 'exit',
    action: 'claim',
    available: exitMet,
    missing: !exitMet
      ? `Нужно: репутация ${exit.minReputation}+, деньги ${formatMoneyShort(exit.minMoney)}+, грейд ${gradeLabel(exit.minGrade)}+ (сейчас ${rep}/${formatMoneyShort(money)}/${gradeLabel(grade)})`
      : undefined,
    title: exit.title,
    description: exit.description,
  });

  // ── Positive: Free artist
  const free = { ...DEFAULTS.free_artist, ...endings.free_artist };
  const freeMet = rep >= free.minReputation && money <= free.maxMoney && gradeAtLeast(grade, free.minGrade);
  out.push({
    id: 'free_artist',
    action: 'claim',
    available: freeMet,
    missing: !freeMet
      ? `Нужно: репутация ${free.minReputation}+, деньги ≤ ${formatMoneyShort(free.maxMoney)}, грейд ${gradeLabel(free.minGrade)}+ (сейчас ${rep}/${formatMoneyShort(money)}/${gradeLabel(grade)})`
      : undefined,
    title: free.title,
    description: free.description,
  });

  // ── Positive: Teacher
  const teacher = { ...DEFAULTS.teacher, ...endings.teacher };
  const teacherMet = rep >= teacher.minReputation && mentored >= teacher.minMentoredJuniors;
  out.push({
    id: 'teacher',
    action: 'claim',
    available: teacherMet,
    missing: !teacherMet
      ? `Нужно: репутация ${teacher.minReputation}+, джунов на менторстве ${teacher.minMentoredJuniors}+ (сейчас ${rep}/${mentored})`
      : undefined,
    title: teacher.title,
    description: teacher.description,
  });

  // ── Terminal: burnout
  const burnout = { ...DEFAULTS.burnout, ...endings.burnout };
  out.push({
    id: 'burnout',
    action: 'restart',
    available: burnoutDays >= endings.burnoutDays,
    title: burnout.title,
    description: burnout.description,
  });

  // ── Terminal: left_it
  const leftIt = { ...DEFAULTS.left_it, ...endings.left_it };
  out.push({
    id: 'left_it',
    action: 'restart',
    available: brokeDays >= endings.brokeDaysToQuit,
    title: leftIt.title,
    description: leftIt.description,
  });

  return out;
}

/** First ending that is currently available, if any. Server uses this in /state. */
export function firstAvailableEnding(player: PlayerState, balance: BalanceConfig | undefined): EndingId | null {
  const list = checkEndings(player, balance);
  return list.find((e) => e.available)?.id ?? null;
}

function formatMoneyShort(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)} млн ₽`;
  if (amount >= 1_000) return `${Math.round(amount / 1000)} тыс ₽`;
  return `${amount} ₽`;
}

function gradeLabel(g: Grade): string {
  const map: Record<Grade, string> = {
    unemployed: 'без работы',
    intern: 'стажёр',
    junior: 'джун',
    middle: 'мидл',
    senior: 'сеньор',
    teamlead: 'тимлид',
    architect: 'архитектор',
    cto: 'CTO',
  };
  return map[g] ?? g;
}
