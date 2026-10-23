import type { PlayerState, Grade } from '../types';
import type { BalanceConfig } from '../schemas';
import { mainSkillLevel } from './skills';

/**
 * Career endings — проверка того, что игрок достиг одного из финалов.
 *
 * Шесть финалов описаны в ТЗ и в `balance.json` (`endings.*`):
 *   - `cto`        : special-board election (`/api/game/action: cto_elect`) +
 *                    удержание поста `endings.cto.minDaysAsCto` дней
 *   - `exit`       : стартап ≥ 100 млн (money + reputation + senior+)
 *   - `free_artist`: фриланс (senior+ при деньгах < 1 млн)
 *   - `teacher`    : репутация наставника + лидерство + глубина основного навыка
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
    minDaysAsCto: 60,
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
    minLeadership: 24,
    minSkillLevel: 62,
    title: '🎓 Учитель',
    description: 'Джуны, которых ты вёл, выросли в сеньоров и архитекторов. Их успехи — твои.',
  },
  burnout: {
    title: '🔥 Выгорание',
    description: 'Здоровье и мотивация в нуле. Тело и психика сказали «стоп». Следующая жизнь — с +15% XP.',
  },
  left_it: {
    title: '💀 Ушёл из IT',
    description:
      'Денег нет, перспектив тоже. Ты закрыл редактор и пошёл учиться на повара. Следующая жизнь — с чистого листа.',
  },
};

/**
 * Лидерство так, как его действительно растит игра.
 *
 * Ловушка, найденная 22.10.2026 при реализации В2: `checkEndings` читал
 * `player.leadership` — поле, которое не записывает НИ ОДИН модуль (проверено
 * grep'ом по server/ и shared/). Игра растит `softSkills.leadership.level`
> (работа middle+, `applySoftXp` в actions.ts), и именно его меряет гейт CTO
 * (`gateProgress` → `gate.leadership`). Пока выборы сами ставили `careerEnding`,
 * расхождение было не видно: ветка `cto` в `checkEndings` просто никогда не
 * открывалась. Теперь, когда финал забирается через `claim_ending`, она обязана
 * открываться — поэтому источник один, и это softSkills.
 *
 * `player.leadership` остаётся прочитанным как фолбэк: поле объявлено в
 * `PlayerState`, и сейв, где его однажды заполнили, не должен терять финал.
 */
export function leadershipLevel(player: PlayerState): number {
  const soft = player.softSkills?.['leadership']?.level;
  if (typeof soft === 'number' && Number.isFinite(soft)) return soft;
  return player.leadership ?? 0;
}

/**
 * Сколько игровых дней игрок непрерывно сидит в кресле CTO.
 *
 * Ноль, если он никогда не избран или уже потерял работу: отсчёт ведётся от
 * `ctoSinceDay`, а его сбрасывает сервер, когда кресло потеряно (увольнение /
 * сокращение). Отрицательным быть не может — сейв «из будущего» или ручная
 * правка дают ноль, а не «−12 дней на посту».
 */
export function ctoTenureDays(player: PlayerState): number {
  const since = player.ctoSinceDay;
  if (typeof since !== 'number' || !Number.isFinite(since)) return 0;
  if (!player.job) return 0;
  return Math.max(0, Math.floor(player.currentDay ?? 0) - Math.floor(since));
}

/**
 * Check all six endings against current player state.
 *
 * - `burnout` / `left_it` are always "available" once the trigger fires
 *   (`burnoutDays` / `brokeDaysToQuit`) — they are terminal, not chosen.
 * - `cto` is a "claim" and it is NOT granted by the election itself: winning the
 *   board vote makes the player a sitting CTO, the ending opens after the post
 *   has been held `endings.cto.minDaysAsCto` days (В2, 22.10.2026). До этого
 *   победа на выборах фиксировала финал в тот же день, и «жизни после CTO» в
 *   сейве не существовало вовсе.
 * - `exit` / `free_artist` / `teacher` are "claim" once thresholds are met.
 */
export function checkEndings(player: PlayerState, balance: BalanceConfig | undefined): EndingRequirement[] {
  const endings = balance?.endings;
  if (!endings) return [];

  const rep = Math.round(player.reputation ?? 0);
  const money = Math.round(player.money ?? 0);
  const grade = (player.grade ?? 'unemployed') as Grade;
  const leadership = Math.round(leadershipLevel(player));
  const mainSkill = Math.round(mainSkillLevel(player));
  const burnoutDays = Math.round(player.burnoutDays ?? 0);
  const brokeDays = Math.round(player.brokeDays ?? 0);

  const out: EndingRequirement[] = [];

  // ── Positive: CTO (board election + удержание поста)
  const cto = { ...DEFAULTS.cto, ...endings.cto };
  const ctoStatsMet = rep >= cto.minReputation && leadership >= cto.minLeadership;
  const tenure = ctoTenureDays(player);
  const ctoMet = ctoStatsMet && tenure >= cto.minDaysAsCto;
  out.push({
    id: 'cto',
    action: 'claim',
    available: ctoMet && grade === 'cto',
    missing: !ctoStatsMet
      ? `Нужно: репутация ${cto.minReputation}+, лидерство ${cto.minLeadership}+ (сейчас ${rep}/${leadership})`
      : grade !== 'cto'
        ? 'Сначала стань CTO'
        : tenure < cto.minDaysAsCto
          ? `Продержись в кресле ${cto.minDaysAsCto} дн. (сейчас ${tenure}) — финал открывается отчётом перед бордом, а не в день выборов`
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

  // ── Positive: Teacher (путь наставника: репутация + лидерство + глубина навыка)
  const teacher = { ...DEFAULTS.teacher, ...endings.teacher };
  const teacherMet =
    rep >= teacher.minReputation && leadership >= teacher.minLeadership && mainSkill >= teacher.minSkillLevel;
  out.push({
    id: 'teacher',
    action: 'claim',
    available: teacherMet,
    missing: !teacherMet
      ? `Нужно: репутация ${teacher.minReputation}+, лидерство ${teacher.minLeadership}+, основной навык ${teacher.minSkillLevel}+ (сейчас ${rep}/${leadership}/${mainSkill})`
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
