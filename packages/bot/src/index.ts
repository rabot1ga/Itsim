/**
 * Telegram Bot for IT Life Simulator
 * Handles Mini App deep links, notifications, and data deletion commands
 */

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://itsim.app';

console.log('🤖 IT Life Simulator Bot');
console.log(`Mini App URL: ${MINI_APP_URL}`);

if (!BOT_TOKEN) {
  console.warn('⚠ BOT_TOKEN not set — running in mock mode');
}

// Mock bot server for MVP
import { createServer } from 'http';

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const update = JSON.parse(body);

        if (update.message?.text === '/start') {
          const params = new URLSearchParams({
            startapp: 'ref_' + (update.message.from?.id || ''),
          });
          const reply = {
            method: 'sendMessage',
            chat_id: update.message.chat.id,
            text: '👋 Добро пожаловать в IT Life Simulator!\n\n🎮 Симулятор жизни IT-специалиста.\nНачинай карьеру, качай навыки, избегай выгорания.\n\nНажми кнопку ниже, чтобы начать:',
            reply_markup: {
              inline_keyboard: [[
                {
                  text: '🚀 Играть',
                  web_app: { url: `${MINI_APP_URL}?${params.toString()}` }
                }
              ]]
            }
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reply));
        } else if (update.message?.text === '/delete_my_data') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            method: 'sendMessage',
            chat_id: update.message.chat.id,
            text: '✅ Ваши данные будут удалены в течение 30 дней.',
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            method: 'sendMessage',
            chat_id: update.message.chat.id,
            text: 'Привет! Используй /start чтобы начать игру.',
          }));
        }
      } catch {
        res.writeHead(200);
        res.end('ok');
      }
    });
  } else {
    res.writeHead(200);
    res.end('Bot is running');
  }
});

const PORT = parseInt(process.env.BOT_PORT || '3002', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Bot server listening on port ${PORT}`);
});