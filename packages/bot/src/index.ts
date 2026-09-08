/**
 * IT Life Simulator — Telegram bot.
 *
 * Modes (chosen automatically):
 *
 *   BOT_TOKEN set, BOT_MODE=polling (default) → real long polling against
 *       api.telegram.org: /start, /play, /stats, /help, /delete_my_data,
 *       plus the "your day bank is full" notification job.
 *   BOT_TOKEN set, BOT_MODE=webhook          → registers the webhook and
 *       serves updates over HTTP (same handlers).
 *   BOT_TOKEN missing                        → mock mode: an HTTP endpoint that
 *       accepts an update JSON and answers with what *would* be sent, so the
 *       whole conversation surface stays runnable and testable offline.
 *
 * The previous implementation only ever did the last one, while pretending to
 * be a bot (ANALYSIS §6).
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';

import { TelegramClient, type TelegramUpdate } from './telegramApi.js';
import { GameApiClient } from './gameApi.js';
import { BOT_COMMANDS, handleCommand, parseCommand, nudgeText, playButton, type BotReply } from './commands.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://itsim.app';
const API_URL = process.env.GAME_API_URL || 'http://127.0.0.1:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PORT = parseInt(process.env.BOT_PORT || '3002', 10);
const MODE = (process.env.BOT_MODE || (BOT_TOKEN ? 'polling' : 'mock')).toLowerCase();
const WEBHOOK_URL = process.env.BOT_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const NUDGE_ENABLED = (process.env.BOT_NUDGES ?? 'true') !== 'false';
const NUDGE_INTERVAL_MS = parseInt(process.env.BOT_NUDGE_INTERVAL_MS || `${60 * 60 * 1000}`, 10);
const NUDGE_MIN_BANKED_DAYS = parseInt(process.env.BOT_NUDGE_MIN_BANKED_DAYS || '6', 10);

const tg = new TelegramClient(BOT_TOKEN);
const api = new GameApiClient(API_URL, ADMIN_TOKEN);

console.log('🤖 IT Life Simulator Bot');
console.log(`   mode:        ${MODE}`);
console.log(`   mini app:    ${MINI_APP_URL}`);
console.log(`   game api:    ${API_URL} ${api.available ? '(admin API enabled)' : '(no ADMIN_TOKEN — /stats and /delete_my_data disabled)'}`);
if (!BOT_TOKEN) console.warn('⚠ BOT_TOKEN not set — running in mock mode, no messages are sent to Telegram');

// ---------------------------------------------------------------------------
// Update routing
// ---------------------------------------------------------------------------

interface PlannedReply {
  chatId: number;
  reply: BotReply;
}

/**
 * Turn an update into the message(s) we want to send. Pure — the transport
 * (real API vs. mock response) is the caller's business.
 */
export async function planReply(update: TelegramUpdate): Promise<PlannedReply | null> {
  const message = update.message;
  if (!message?.chat) return null;

  const from = message.from;
  const ctx = {
    userId: from?.id ?? message.chat.id,
    firstName: from?.first_name ?? 'друг',
    miniAppUrl: MINI_APP_URL,
    api,
  };

  // Stars purchases are confirmed by the game server webhook; the bot only
  // acknowledges them in chat if Telegram routes the message here.
  if (message.successful_payment) {
    return {
      chatId: message.chat.id,
      reply: { text: '✅ Оплата получена! Награда уже в игре.', replyMarkup: playButton(MINI_APP_URL) },
    };
  }

  const parsed = parseCommand(message.text);
  if (!parsed) {
    return {
      chatId: message.chat.id,
      reply: {
        text: 'Я бот-лаунчер игры 🙂 Нажми кнопку ниже или отправь /help.',
        replyMarkup: playButton(MINI_APP_URL),
      },
    };
  }

  const reply = await handleCommand({ ...ctx, arg: parsed.arg }, parsed.command);
  return { chatId: message.chat.id, reply };
}

async function deliver(planned: PlannedReply): Promise<void> {
  await tg.sendMessage(planned.chatId, planned.reply.text, {
    ...(planned.reply.replyMarkup ? { reply_markup: planned.reply.replyMarkup } : {}),
  });
}

// ---------------------------------------------------------------------------
// Long polling
// ---------------------------------------------------------------------------

let stopped = false;

async function pollLoop(): Promise<void> {
  await tg.deleteWebhook();
  await tg.setMyCommands(BOT_COMMANDS);
  const me = await tg.getMe();
  if (me.ok) console.log(`✓ Connected as @${me.result?.username}`);
  else console.error('✗ getMe failed — check BOT_TOKEN');

  let offset = 0;
  while (!stopped) {
    const updates = await tg.getUpdates(offset, 30);
    if (!updates.ok || !updates.result?.length) {
      if (!updates.ok) await sleep(3000); // network hiccup — do not hot-loop
      continue;
    }
    for (const update of updates.result) {
      offset = update.update_id + 1;
      try {
        const planned = await planReply(update);
        if (planned) await deliver(planned);
      } catch (err) {
        console.error('update handling failed:', err);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Notifications: "your day bank is full"
// ---------------------------------------------------------------------------

export async function runNudgeJob(): Promise<number> {
  if (!api.available || !tg.configured) return 0;
  const candidates = await api.claimNudges(NUDGE_MIN_BANKED_DAYS);
  let sent = 0;
  for (const candidate of candidates) {
    const result = await tg.sendMessage(candidate.userId, nudgeText(candidate.name, candidate.bankedDays), {
      reply_markup: playButton(MINI_APP_URL),
      disable_notification: true,
    });
    if (result.ok) sent += 1;
    await sleep(50); // stay well under Telegram's 30 msg/s limit
  }
  if (sent) console.log(`✓ sent ${sent} nudge(s)`);
  return sent;
}

// ---------------------------------------------------------------------------
// HTTP surface: webhook endpoint (webhook mode), mock endpoint, health
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mode: MODE, telegram: tg.configured, adminApi: api.available }));
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/webhook' || url.pathname === '/')) {
    // Webhook mode authenticates Telegram by the secret token it echoes back.
    if (MODE === 'webhook' && WEBHOOK_SECRET) {
      const provided = req.headers['x-telegram-bot-api-secret-token'];
      if (provided !== WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid secret token' }));
        return;
      }
    }

    let update: TelegramUpdate;
    try {
      update = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON' }));
      return;
    }

    const planned = await planReply(update).catch((err) => {
      console.error('update handling failed:', err);
      return null;
    });

    if (planned && tg.configured) {
      await deliver(planned);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Mock mode: answer with the message we WOULD have sent (dev-friendly).
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        planned
          ? { ok: true, mock: true, would_send: { chat_id: planned.chatId, ...planned.reply } }
          : { ok: true, ignored: true }
      )
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

async function main() {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Bot HTTP surface on :${PORT} (POST /webhook, GET /health)`);
  });

  if (MODE === 'webhook') {
    if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
      console.error('✗ BOT_MODE=webhook requires BOT_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET');
      process.exit(1);
    }
    await tg.setMyCommands(BOT_COMMANDS);
    const hook = await tg.setWebhook(WEBHOOK_URL, WEBHOOK_SECRET);
    console.log(hook.ok ? `✓ Webhook registered: ${WEBHOOK_URL}` : `✗ setWebhook failed: ${hook.description}`);
  } else if (MODE === 'polling') {
    pollLoop().catch((err) => console.error('polling loop crashed:', err));
  }

  if (NUDGE_ENABLED && tg.configured && api.available) {
    console.log(`✓ Nudge job every ${Math.round(NUDGE_INTERVAL_MS / 60000)} min (bank ≥ ${NUDGE_MIN_BANKED_DAYS} days)`);
    setInterval(() => {
      runNudgeJob().catch((err) => console.error('nudge job failed:', err));
    }, NUDGE_INTERVAL_MS);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopped = true;
    server.close();
    process.exit(0);
  });
}

if (process.env.VITEST !== 'true') {
  main();
}
