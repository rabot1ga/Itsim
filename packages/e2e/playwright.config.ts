import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * E2E topology (roadmap P0.5):
 *
 *   chromium ── http://127.0.0.1:5174 (vite, isolated instance)
 *                  └─ /api → http://127.0.0.1:3005 (API, isolated DATA_DIR)
 *
 * Two dev servers already run in the sandbox on :5173/:3001; the E2E pair
 * uses different ports and a throwaway DATA_DIR (mkdtemp) so a smoke run can
 * never touch real player saves or the dev telemetry log.
 */

const API_PORT = 3005;
const WEB_PORT = 5174;

// Browser: prefer a cached @sparticuz/chromium extraction (sandbox-friendly,
// see scripts/extract-chromium.mjs); fall back to Playwright's bundled
// Chromium (CI with `npx playwright install chromium`).
let executablePath: string | undefined;
const marker = join(import.meta.dirname, '.chromium-path.json');
if (existsSync(marker)) {
  const cached = JSON.parse(readFileSync(marker, 'utf8')).executablePath as string;
  if (cached && existsSync(cached)) executablePath = cached;
}
if (!executablePath && !process.env.CI) {
  execSync('node scripts/extract-chromium.mjs', { cwd: import.meta.dirname, stdio: 'inherit' });
  executablePath = JSON.parse(readFileSync(marker, 'utf8')).executablePath as string;
}
// @sparticuz/chromium on an AL2023 run puts its shared libs in /tmp/al2023/lib;
// the browser process inherits LD_LIBRARY_PATH, so make it visible here too.
const al2023Lib = '/tmp/al2023/lib';
if (existsSync(al2023Lib)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH ? `${al2023Lib}:${process.env.LD_LIBRARY_PATH}` : al2023Lib;
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Chained story cards settle one render frame apart; a rare 20s expect can
  // catch that gap. One local retry / two in CI keeps the suite signal green
  // while still failing loudly on real regressions.
  retries: process.env.CI ? 2 : 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: executablePath ? ['--no-sandbox', '--disable-dev-shm-usage'] : undefined,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: join(import.meta.dirname, '..', 'server'),
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        BOT_TOKEN: '',
        DATA_DIR: mkdtempSync(join(tmpdir(), 'itsim-e2e-')),
      },
      stdout: 'pipe',
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: join(import.meta.dirname, '..', 'client'),
      port: WEB_PORT,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_PROXY: `http://127.0.0.1:${API_PORT}`,
      },
      stdout: 'pipe',
    },
  ],
});
