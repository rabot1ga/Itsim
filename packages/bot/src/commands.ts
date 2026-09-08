/**
 * Bot command handling — pure functions, so the whole conversation surface is
 * unit-testable without a network (see src/__tests__/commands.test.ts).
 *
 * A handler receives the parsed command and a `GameApi` port; it returns the
 * reply to send. Nothing here talks to Telegram directly.
 */

export interface PlayerSummary {
  name: string;
  day: number;
  grade: string;
  money: number;
  rating: number;
  bankedDays: number;
  energy: string;
  health: number;
  motivation: number;
  achievements: number;
  careerEnding?: string | null;
  purchases?: number;
}

export interface GameApi {
  /** GET /api/admin/users/:id/summary */
  getSummary(userId: string): Promise<PlayerSummary | null>;
  /** DELETE /api/admin/users/:id */
  deleteUser(userId: string): Promise<boolean>;
  /** whether the admin API is usable at all */
  readonly available: boolean;
}

export interface BotReply {
  text: string;
  replyMarkup?: Record<string, any>;
}

export interface CommandContext {
  userId: number;
  firstName: string;
  /** payload after /start (deep link `?start=` parameter) */
  arg?: string;
  miniAppUrl: string;
  api: GameApi;
}

export const GRADE_LABELS: Record<string, string> = {
  unemployed: 'Безработный',
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

export const BOT_COMMANDS = [
  { command: 'start', description: 'Начать игру' },
  { command: 'play', description: 'Открыть Mini App' },
  { command: 'stats', description: 'Мой прогресс' },
  { command: 'help', description: 'Как играть' },
  { command: 'delete_my_data', description: 'Удалить все мои данные' },
];

/** Mini App button — the only supported way to open a TMA from a chat. */
export function playButton(miniAppUrl: string, startapp?: string): Record<string, any> {
  const url = startapp ? `${miniAppUrl}${miniAppUrl.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(startapp)}` : miniAppUrl;
  return { inline_keyboard: [[{ text: '🚀 Играть', web_app: { url } }]] };
}

export function parseCommand(text: string | undefined): { command: string; arg?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const [head, ...rest] = trimmed.split(/\s+/);
  // /command@BotName → /command
  const command = head.slice(1).split('@')[0].toLowerCase();
  return { command, arg: rest.length ? rest.join(' ') : undefined };
}

const HELP = [
  '📖 <b>Как играть</b>',
  '',
  '1 игровой день = 3.5 реальных часа. Пока тебя нет, дни копятся в банке (максимум 7) — заходи хотя бы раз в сутки, иначе банк переполнится и прогресс встанет.',
  '',
  '• Учись, работай, отдыхай и ходи на собеседования — всё тратит энергию.',
  '• Выбери <b>основной навык</b>: именно его глубину проверяют на повышении.',
  '• Следи за деньгами: день стоит денег даже когда ты просто спишь.',
  '• Выгорание и «ушёл из IT» — настоящие финалы, а не декорация.',
  '',
  'Команды: /play, /stats, /delete_my_data',
].join('\n');

export async function handleCommand(ctx: CommandContext, command: string): Promise<BotReply> {
  switch (command) {
    case 'start': {
      const referral = ctx.arg?.startsWith('ref_') ? ctx.arg : undefined;
      return {
        text: [
          `👋 Привет, ${escapeHtml(ctx.firstName)}!`,
          '',
          '💻 <b>IT Life Simulator</b> — симулятор жизни айтишника.',
          'Ты вышел из института с 10 000 ₽ и без работы. Дальше — как получится:',
          'навыки, собеседования, повышения, аренда, выгорание и, если повезёт, кресло CTO.',
          '',
          referral ? '🎁 Ты пришёл по приглашению — оно засчитано.' : 'Жми кнопку ниже 👇',
        ].join('\n'),
        replyMarkup: playButton(ctx.miniAppUrl, referral),
      };
    }

    case 'play':
      return { text: '🎮 Погнали!', replyMarkup: playButton(ctx.miniAppUrl) };

    case 'help':
      return { text: HELP, replyMarkup: playButton(ctx.miniAppUrl) };

    case 'stats': {
      if (!ctx.api.available) {
        return { text: '⚠️ Статистика временно недоступна (сервер игры не отвечает).' };
      }
      const summary = await ctx.api.getSummary(String(ctx.userId));
      if (!summary) {
        return {
          text: 'Ты ещё не начинал игру — сохранения нет. Открой Mini App и сыграй первый день!',
          replyMarkup: playButton(ctx.miniAppUrl),
        };
      }
      return { text: formatSummary(summary), replyMarkup: playButton(ctx.miniAppUrl) };
    }

    case 'delete_my_data': {
      if (!ctx.api.available) {
        return { text: '⚠️ Удаление временно недоступно, попробуй позже.' };
      }
      const deleted = await ctx.api.deleteUser(String(ctx.userId));
      return {
        text: deleted
          ? '🗑 Готово. Все игровые данные удалены безвозвратно: прогресс, покупки-косметика и позиция в лидерборде.\nНачать заново можно в любой момент — просто открой Mini App.'
          : 'Данных о тебе и так нет — удалять нечего.',
      };
    }

    default:
      return {
        text: 'Не знаю такой команды 🤔\nПопробуй /play, /stats или /help.',
        replyMarkup: playButton(ctx.miniAppUrl),
      };
  }
}

export function formatSummary(s: PlayerSummary): string {
  const lines = [
    `📊 <b>${escapeHtml(s.name)}</b> — день ${s.day}`,
    '',
    `💼 Грейд: <b>${GRADE_LABELS[s.grade] ?? s.grade}</b>`,
    `💰 Деньги: ${s.money.toLocaleString('ru-RU')} ₽`,
    `🏆 Рейтинг: ${s.rating}`,
    `❤️ Здоровье: ${s.health} · 🔥 Мотивация: ${s.motivation}`,
    `⚡ Энергия: ${s.energy}`,
    `🏅 Ачивок: ${s.achievements}`,
  ];
  if (s.bankedDays > 0) {
    lines.push('', `🗓 В банке ${s.bankedDays} ${plural(s.bankedDays, 'день', 'дня', 'дней')} — их можно потратить прямо сейчас.`);
  }
  if (s.careerEnding) {
    lines.push('', `🏁 Финал: <b>${s.careerEnding}</b>`);
  }
  return lines.join('\n');
}

/** «У тебя 7 дней в банке» — nudge text for the notification job. */
export function nudgeText(name: string, bankedDays: number): string {
  if (bankedDays >= 7) {
    return `⏰ ${escapeHtml(name)}, банк дней переполнен (${bankedDays}/7) — время выше не растёт, ты просто теряешь прогресс. Загляни в игру!`;
  }
  return `🗓 ${escapeHtml(name)}, у тебя ${bankedDays} ${plural(bankedDays, 'день', 'дня', 'дней')} в банке. Отличный момент прожить их разом.`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
