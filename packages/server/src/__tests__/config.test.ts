import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Environment configuration.
 *
 * The point of `config.ts` is that a dev default can never reach production
 * unnoticed: `JWT_SECRET=dev-secret` used to be a silent fallback (ANALYSIS §7.2).
 */

const ORIGINAL = { ...process.env };

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ['NODE_ENV', 'BOT_TOKEN', 'JWT_SECRET', 'TELEGRAM_WEBHOOK_SECRET', 'ADMIN_TOKEN', 'ALLOW_MOCK_PAYMENTS']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  return import('../config');
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('config', () => {
  it('reports every dev compromise in development', async () => {
    const { inspectConfig } = await loadConfig({});
    const variables = inspectConfig().map((p) => p.variable);
    expect(variables).toContain('BOT_TOKEN');
    expect(variables).toContain('JWT_SECRET');
    expect(variables).toContain('TELEGRAM_WEBHOOK_SECRET');
  });

  it('does not throw in development, however insecure', async () => {
    const { assertProductionConfig } = await loadConfig({});
    expect(() => assertProductionConfig(() => {})).not.toThrow();
  });

  it('refuses to start in production with the default JWT secret', async () => {
    const { assertProductionConfig } = await loadConfig({
      NODE_ENV: 'production',
      BOT_TOKEN: '123:abc',
      JWT_SECRET: 'dev-secret',
      TELEGRAM_WEBHOOK_SECRET: 'hook',
    });
    expect(() => assertProductionConfig(() => {})).toThrow(/JWT_SECRET/);
  });

  it('refuses to start in production without a bot token', async () => {
    const { assertProductionConfig } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'proper-secret',
      TELEGRAM_WEBHOOK_SECRET: 'hook',
    });
    expect(() => assertProductionConfig(() => {})).toThrow(/BOT_TOKEN/);
  });

  it('refuses to start in production with mock payments enabled', async () => {
    const { assertProductionConfig } = await loadConfig({
      NODE_ENV: 'production',
      BOT_TOKEN: '123:abc',
      JWT_SECRET: 'proper-secret',
      TELEGRAM_WEBHOOK_SECRET: 'hook',
      ALLOW_MOCK_PAYMENTS: 'true',
    });
    expect(() => assertProductionConfig(() => {})).toThrow(/ALLOW_MOCK_PAYMENTS/);
  });

  it('starts in production when everything is configured', async () => {
    const { assertProductionConfig, config } = await loadConfig({
      NODE_ENV: 'production',
      BOT_TOKEN: '123:abc',
      JWT_SECRET: 'proper-secret',
      TELEGRAM_WEBHOOK_SECRET: 'hook',
      ADMIN_TOKEN: 'admin',
      ALLOW_MOCK_PAYMENTS: 'false',
    });
    expect(config.isProduction).toBe(true);
    expect(() => assertProductionConfig(() => {})).not.toThrow();
  });

  it('derives the JWT secret from BOT_TOKEN when JWT_SECRET is absent', async () => {
    const { config } = await loadConfig({ BOT_TOKEN: '123:abc' });
    expect(config.jwtSecret).toBe('123:abc');
  });

  it('keeps mock payments off by default once a bot token exists', async () => {
    const { config } = await loadConfig({ BOT_TOKEN: '123:abc' });
    expect(config.allowMockPayments).toBe(false);
  });
});
