/**
 * Покрытие словарей i18n (P2.5). Считает долю клиентских ключей (вызовы t(...))
 * с переводом в каждом словаре, кроме DEFAULT. Выход с кодом 1, если покрытие
 * ниже порога (--min=80).
 *
 *   node tools/i18n-coverage.mjs [--min=80]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../packages/shared/src/i18n/en.ts';

const CYRILLIC = /[А-Яа-яЁё]/;
const args = process.argv.slice(2);
const min = Number((args.find((a) => a.startsWith('--min=')) ?? '--min=80').split('=')[1]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'i18n.ts') {
      out.push(p);
    }
  }
  return out;
}

const keys = new Set();
for (const file of walk('packages/client/src')) {
  const src = readFileSync(file, 'utf-8');
  for (const m of src.matchAll(/\bt\(\s*(['"])((?:[^'"\\]|\\.)*?)\1/g)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1');
    if (CYRILLIC.test(key)) keys.add(key);
  }
}

const dicts = { en };
const lines = [];
let thresholdFailed = false;
for (const [name, dict] of Object.entries(dicts)) {
  const translated = [...keys].filter((k) => dict[k] !== undefined).length;
  const pct = keys.size ? (translated / keys.size) * 100 : 100;
  lines.push(`${name}: ${translated}/${keys.size} (${pct.toFixed(1)}%)`);
  if (pct < min) thresholdFailed = true;
}
console.log(`ключей клиента: ${keys.size}`);
for (const l of lines) console.log(l);
if (thresholdFailed) {
  console.error(`покрытие ниже порога ${min}%`);
  process.exit(1);
}
