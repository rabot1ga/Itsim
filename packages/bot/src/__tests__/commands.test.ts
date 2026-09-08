import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  handleCommand,
  formatSummary,
  nudgeText,
  playButton,
  plural,
  escapeHtml,
  type GameApi,
  type PlayerSummary,
} from '../commands';

/**
 * Bot conversation surface. The handlers are pure, so the whole command set is
 * covered without touching api.telegram.org.
 */

const SUMMARY: PlayerSummary = {
  name: 'Тестер',
  day: 42,
  grade: 'middle',
  money: 180000,
  rating: 512,
  bankedDays: 3,
  energy: '7/11',
  health: 66,
  motivation: 51,
  achievements: 5,
};

function api(overrides: Partial<GameApi> = {}): GameApi {
  return {
    available: true,
    getSummary: async () => SUMMARY,
    deleteUser: async () => true,
    ...overrides,
  } as GameApi;
}

const ctx = (over: Partial<Parameters<typeof handleCommand>[0]> = {}) => ({
  userId: 4242,
  firstName: 'Тестер',
  miniAppUrl: 'https://itsim.app',
  api: api(),
  ...over,
});

describe('parseCommand', () => {
  it('parses a plain command', () => {
    expect(parseCommand('/start')).toEqual({ command: 'start', arg: undefined });
  });

  it('parses a command with an argument', () => {
    expect(parseCommand('/start ref_777')).toEqual({ command: 'start', arg: 'ref_777' });
  });

  it('strips the @BotName suffix used in groups', () => {
    expect(parseCommand('/stats@ITSimBot')?.command).toBe('stats');
  });

  it('ignores ordinary messages', () => {
    expect(parseCommand('привет')).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
});

describe('/start', () => {
  it('greets by name and offers the Mini App button', async () => {
    const reply = await handleCommand(ctx(), 'start');
    expect(reply.text).toContain('Тестер');
    expect(reply.replyMarkup?.inline_keyboard[0][0].web_app.url).toBe('https://itsim.app');
  });

  it('carries a referral deep link into the Mini App URL', async () => {
    const reply = await handleCommand(ctx({ arg: 'ref_777' }), 'start');
    expect(reply.text).toContain('приглашению');
    expect(reply.replyMarkup?.inline_keyboard[0][0].web_app.url).toContain('startapp=ref_777');
  });

  it('ignores a non-referral argument', async () => {
    const reply = await handleCommand(ctx({ arg: 'junk' }), 'start');
    expect(reply.replyMarkup?.inline_keyboard[0][0].web_app.url).toBe('https://itsim.app');
  });
});

describe('/stats', () => {
  it('renders the player summary', async () => {
    const reply = await handleCommand(ctx(), 'stats');
    expect(reply.text).toContain('день 42');
    expect(reply.text).toContain('Middle');
    expect(reply.text).toContain('512');
  });

  it('invites a player without a save to start', async () => {
    const reply = await handleCommand(ctx({ api: api({ getSummary: async () => null }) }), 'stats');
    expect(reply.text).toContain('не начинал');
  });

  it('degrades gracefully when the game API is unavailable', async () => {
    const reply = await handleCommand(ctx({ api: api({ available: false }) }), 'stats');
    expect(reply.text).toContain('недоступна');
  });
});

describe('/delete_my_data', () => {
  it('confirms deletion', async () => {
    const reply = await handleCommand(ctx(), 'delete_my_data');
    expect(reply.text).toContain('удалены');
  });

  it('says there was nothing to delete', async () => {
    const reply = await handleCommand(ctx({ api: api({ deleteUser: async () => false }) }), 'delete_my_data');
    expect(reply.text).toContain('нечего');
  });

  it('does not promise deletion when the API is down', async () => {
    const reply = await handleCommand(ctx({ api: api({ available: false }) }), 'delete_my_data');
    expect(reply.text).toContain('недоступно');
    expect(reply.text).not.toContain('Готово');
  });
});

describe('other commands', () => {
  it('/help explains the day bank', async () => {
    const reply = await handleCommand(ctx(), 'help');
    expect(reply.text).toContain('3.5');
  });

  it('/play just opens the app', async () => {
    const reply = await handleCommand(ctx(), 'play');
    expect(reply.replyMarkup?.inline_keyboard).toBeTruthy();
  });

  it('unknown commands suggest the real ones', async () => {
    const reply = await handleCommand(ctx(), 'dance');
    expect(reply.text).toContain('/help');
  });
});

describe('formatting helpers', () => {
  it('mentions banked days when there are any', () => {
    expect(formatSummary(SUMMARY)).toContain('3 дня');
    expect(formatSummary({ ...SUMMARY, bankedDays: 0 })).not.toContain('в банке');
  });

  it('shows the ending for a finished run', () => {
    expect(formatSummary({ ...SUMMARY, careerEnding: 'burnout' })).toContain('Финал');
  });

  it('nudges harder when the bank is overflowing', () => {
    expect(nudgeText('Тестер', 7)).toContain('переполнен');
    expect(nudgeText('Тестер', 6)).toContain('6 дней');
  });

  it('pluralises Russian day counts', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня');
    expect(plural(5, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(11, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(21, 'день', 'дня', 'дней')).toBe('день');
  });

  it('escapes HTML in user-controlled names', () => {
    expect(escapeHtml('<b>hack</b>')).toBe('&lt;b&gt;hack&lt;/b&gt;');
    expect(nudgeText('<script>', 7)).not.toContain('<script>');
  });

  it('appends startapp to a URL that already has a query string', () => {
    const markup = playButton('https://itsim.app?v=2', 'ref_1');
    expect(markup.inline_keyboard[0][0].web_app.url).toBe('https://itsim.app?v=2&startapp=ref_1');
  });
});
