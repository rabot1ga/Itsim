/**
 * Content validation CLI — the CI gate for `packages/content/**`.
 *
 *   npm run validate -w packages/content            # fails on errors
 *   npm run validate -w packages/content -- --strict  # fails on warnings too
 *   npm run validate -w packages/content -- --json    # machine-readable report
 */

import { loadContentBundle } from './loader.js';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');

const { issues, stats } = loadContentBundle();
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0 && (!strict || warnings.length === 0), stats, issues }, null, 2));
} else {
  console.log('📦 Content validation\n');
  const width = Math.max(...Object.keys(stats).map((k) => k.length));
  for (const [key, value] of Object.entries(stats)) {
    console.log(`  ${key.padEnd(width)}  ${value}`);
  }
  console.log('');

  for (const issue of errors) console.error(`  ✗ ${issue.where}: ${issue.message}`);
  for (const issue of warnings) console.warn(`  ⚠ ${issue.where}: ${issue.message}`);

  if (!issues.length) console.log('  ✓ no issues');
  console.log(
    `\n${errors.length ? '✗' : '✓'} ${errors.length} error(s), ${warnings.length} warning(s)` +
      (strict ? ' (strict mode: warnings are fatal)' : '')
  );
}

if (errors.length || (strict && warnings.length)) process.exit(1);
