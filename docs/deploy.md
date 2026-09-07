# Деплой и эксплуатация

Документ описывает, как поднять IT Life Simulator в проде: переменные окружения,
регистрация бота и webhook'а, проверки перед релизом и то, что нужно знать про
данные игроков.

> Локальный запуск — в [README](../README.md#-быстрый-старт). Здесь только прод.

---

## 1. Что из чего состоит

| Процесс | Порт | Что делает | Обязателен |
|---|---|---|---|
| `@itsim/server` | 3001 | Game API, сервер-авторитет, вебхук платежей | да |
| `@itsim/client` | статика | Mini App (Vite build → `dist/`) | да |
| `@itsim/bot` | 3002 | Telegram-бот: команды, deep links, уведомления | да (иначе игру нельзя открыть из Telegram) |

Клиент — статические файлы; их отдаёт любой CDN/nginx. Запросы `/api/*` должны
проксироваться на Game API, иначе браузер игрока пойдёт мимо сервера.

---

## 2. Переменные окружения

Полный список с комментариями — в [`.env.example`](../.env.example).
Минимум для прода:

```bash
NODE_ENV=production
BOT_TOKEN=123456:AA...              # BotFather
JWT_SECRET=$(openssl rand -hex 32)  # НЕ оставлять пустым
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32) # общий секрет сервера и бота
MINI_APP_URL=https://itsim.example.com
DATA_DIR=/var/lib/itsim/data
ALLOW_MOCK_PAYMENTS=false
```

Сервер **не стартует** в `NODE_ENV=production`, если:

- нет `BOT_TOKEN` (иначе initData не проверяется и любой может представиться кем угодно);
- `JWT_SECRET` равен дефолтному `dev-secret`;
- нет `TELEGRAM_WEBHOOK_SECRET` (вебхук платежей нельзя аутентифицировать);
- включён `ALLOW_MOCK_PAYMENTS`.

Проверка находится в `packages/server/src/config.ts` (`assertProductionConfig`)
и покрыта тестами.

---

## 3. Сборка и запуск

```bash
npm ci
npm run lint          # типы + eslint
npm test              # контент + движок + сервер + бот + симулятор баланса
npm run build         # shared → content → server → client → bot → sim

node packages/server/dist/index.js     # Game API
node packages/bot/dist/index.js        # бот
# packages/client/dist — статика для nginx/CDN
```

Пример systemd-юнита:

```ini
[Unit]
Description=ITSim Game API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/itsim
EnvironmentFile=/etc/itsim/.env
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Пример nginx:

```nginx
server {
  server_name itsim.example.com;

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location / {
    root /opt/itsim/packages/client/dist;
    try_files $uri /index.html;
  }
}
```

---

## 4. Telegram: бот, Mini App, платежи

1. **BotFather:** `/newbot` → `BOT_TOKEN`; `/setmenubutton` → URL мини-аппа;
   `/newapp` для короткой ссылки `t.me/<bot>/app`.
2. **Команды** бот регистрирует сам при старте (`setMyCommands`):
   `/start`, `/play`, `/stats`, `/help`, `/delete_my_data`.
3. **Режим бота:**
   - `BOT_MODE=polling` (по умолчанию) — ничего настраивать не нужно, бот сам
     ходит в `getUpdates`. Подходит для одного инстанса.
   - `BOT_MODE=webhook` — нужен публичный `BOT_WEBHOOK_URL` (HTTPS) и
     `TELEGRAM_WEBHOOK_SECRET`; бот сам вызовет `setWebhook` при старте.
4. **Платежи (Telegram Stars)** идут не в бот, а на игровой сервер:

   ```bash
   curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d url="https://itsim.example.com/api/payments/webhook" \
     -d secret_token="$TELEGRAM_WEBHOOK_SECRET" \
     -d allowed_updates='["pre_checkout_query","message"]'
   ```

   > Если бот работает в режиме webhook, у него и у платежей должен быть **один**
   > публичный вебхук: Telegram позволяет только один URL на бота. Проще держать
   > бота на polling, а вебхук отдать платежам.

   Сервер отвечает на `pre_checkout_query` (без ответа Telegram отменяет
   платёж) и начисляет покупку идемпотентно по `telegram_payment_charge_id`.
   Каталог — `packages/content/monetization.json`, только косметика и дни в банке:
   схема запрещает продавать прогресс.

---

## 5. Данные игроков

- Сохранения: `DATA_DIR/<telegramId>.json`, атомарная запись (tmp + rename).
- Покупки: `DATA_DIR/entitlements.json` (аудит + идемпотентность начислений).
- NFT-мок: `DATA_DIR/nft_registry.json`.

**Бэкап:** достаточно копировать `DATA_DIR` (например, `restic`/`rsync` раз в час).
**Миграции:** при загрузке сейв прогоняется через `migrateState()` и, если
изменился, перезаписывается. Сейв, записанный более новой версией сервера,
не трогается — откат билда не портит данные.

**Удаление данных (GDPR):** игрок пишет боту `/delete_my_data`; бот вызывает
`DELETE /api/admin/users/:id` с заголовком `x-admin-token`. Файл сейва удаляется
немедленно.

---

## 6. Наблюдение за живой системой

```bash
curl https://itsim.example.com/health
# {"status":"ok","version":"2.0.0","mode":"telegram"}
curl http://127.0.0.1:3002/health
# {"status":"ok","mode":"polling","telegram":true,"adminApi":true}
```

`mode: "dev"` в ответе игрового сервера означает, что `BOT_TOKEN` не задан и
авторизация не проверяется — в проде такого быть не должно.

---

## 7. Чек-лист релиза

- [ ] `npm run lint && npm test && npm run build` зелёные (то же гоняет CI);
- [ ] `.env` заполнен, `NODE_ENV=production`, сервер стартует без предупреждений;
- [ ] `setWebhook` для платежей выполнен, `getWebhookInfo` не показывает ошибок;
- [ ] бот отвечает на `/start` и открывает мини-апп;
- [ ] `DATA_DIR` бэкапится и лежит вне репозитория;
- [ ] баланс проверен симулятором: `npm run simulate -- --check`.
