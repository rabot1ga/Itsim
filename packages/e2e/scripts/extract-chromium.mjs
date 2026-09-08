/**
 * Extract a usable Chromium for E2E when the Playwright CDN is unreachable
 * (restricted egress — the sandbox can reach the npm registry but not
 * cdn.playwright.dev). @sparticuz/chromium ships a headless Chromium plus the
 * Amazon Linux 2023 shared-library set inside the npm package, so `npm ci`
 * alone is enough to get a browser.
 *
 * We advertise an AL2023 runtime so the package also extracts al2023.tar.br
 * (libnspr4/libnss3/...) and sets LD_LIBRARY_PATH to /tmp/al2023/lib — those
 * libs run fine on Debian 12 (glibc 2.34 vs 2.36).
 *
 * Writes packages/e2e/.chromium-path.json; playwright.config.ts reads it.
 */
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';

const { default: chromium } = await import('@sparticuz/chromium');
const { writeFileSync } = await import('fs');
const { fileURLToPath } = await import('url');

const out = fileURLToPath(new URL('../.chromium-path.json', import.meta.url));
const executablePath = await chromium.executablePath();
writeFileSync(out, JSON.stringify({ executablePath }));
console.log(`chromium ready: ${executablePath}`);
console.log(`LD_LIBRARY_PATH: ${process.env.LD_LIBRARY_PATH ?? '(unset)'}`);
