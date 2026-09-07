import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * One typed place for every environment variable the server reads.
 *
 * Two rules:
 *  - defaults are *dev* defaults and are announced loudly;
 *  - `assertProductionConfig()` refuses to boot with a dev default when
 *    NODE_ENV=production, so a forgotten JWT_SECRET can never reach prod
 *    (ANALYSIS §7.2).
 *
 * Every variable here must also exist in `.env.example`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = process.env;

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const DEV_JWT_SECRET = 'dev-secret';

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  get isProduction() {
    return this.nodeEnv === 'production';
  },

  port: parseInt(env.PORT || '3001', 10),
  host: env.HOST || '0.0.0.0',

  /** Telegram bot token — enables initData validation and Bot API calls */
  botToken: env.BOT_TOKEN || '',
  /** JWT signing key for /api/auth/telegram sessions */
  jwtSecret: env.JWT_SECRET || env.BOT_TOKEN || DEV_JWT_SECRET,
  jwtTtlSeconds: parseInt(env.JWT_TTL_SECONDS || '3600', 10),

  /** Mini App URL used in deep links / invoices */
  miniAppUrl: env.MINI_APP_URL || 'https://itsim.app',

  /** Where player saves live (JSON files for now) */
  dataDir: env.DATA_DIR || join(__dirname, '..', 'data'),

  /** Secret token Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` */
  telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',

  /** Shared secret for /api/admin/* (bot notifications, GDPR deletion) */
  adminToken: env.ADMIN_TOKEN || '',

  /** Allow the mock Stars flow (dev only): /api/payments/dev-complete */
  allowMockPayments: bool(env.ALLOW_MOCK_PAYMENTS, !env.BOT_TOKEN),

  rateLimitMax: parseInt(env.RATE_LIMIT_MAX || '1000', 10),
  rateLimitWindow: env.RATE_LIMIT_WINDOW || '1 minute',
};

export interface ConfigProblem {
  variable: string;
  message: string;
  fatalInProduction: boolean;
}

/** Everything wrong (or merely dev-ish) about the current environment. */
export function inspectConfig(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  if (!config.botToken) {
    problems.push({
      variable: 'BOT_TOKEN',
      message: 'not set — Telegram initData is NOT validated (dev mode, any client can claim any id)',
      fatalInProduction: true,
    });
  }
  if (config.jwtSecret === DEV_JWT_SECRET) {
    problems.push({
      variable: 'JWT_SECRET',
      message: `falls back to the public default "${DEV_JWT_SECRET}" — anyone can forge a session token`,
      fatalInProduction: true,
    });
  }
  if (!config.telegramWebhookSecret) {
    problems.push({
      variable: 'TELEGRAM_WEBHOOK_SECRET',
      message: 'not set — /api/payments/webhook cannot authenticate Telegram and will reject updates',
      fatalInProduction: true,
    });
  }
  if (!config.adminToken) {
    problems.push({
      variable: 'ADMIN_TOKEN',
      message: 'not set — /api/admin/* is disabled (bot notifications and GDPR deletion will not work)',
      fatalInProduction: false,
    });
  }
  if (config.isProduction && config.allowMockPayments) {
    problems.push({
      variable: 'ALLOW_MOCK_PAYMENTS',
      message: 'mock Stars purchases are enabled in production',
      fatalInProduction: true,
    });
  }

  return problems;
}

/**
 * Log the dev-mode compromises; in production turn the fatal ones into an error.
 */
export function assertProductionConfig(log: (msg: string) => void = console.warn): void {
  const problems = inspectConfig();
  if (!problems.length) return;

  const fatal = config.isProduction ? problems.filter((p) => p.fatalInProduction) : [];

  for (const problem of problems) {
    log(`⚠ ${problem.variable}: ${problem.message}`);
  }

  if (fatal.length) {
    throw new Error(
      'Refusing to start in production with insecure configuration:\n' +
        fatal.map((p) => `  ✗ ${p.variable}: ${p.message}`).join('\n') +
        '\nSee .env.example and docs/deploy.md.'
    );
  }
}
