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
      if (name === '__tests__' || name === 'node_modules' || name === 'dist' || name === 'generated') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'i18n.ts') {
      out.push(p);
    }
  }
  return out;
}

const keys = new Set();
const roots = ['packages/client/src', 'packages/server/src'];
const files = roots.flatMap((r) => walk(r));
for (const file of files) {
  const src = readFileSync(file, 'utf-8');
  for (const m of src.matchAll(/\bt\(\s*(['"])((?:[^'"\\]|\\.)*?)\1/g)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1');
    if (CYRILLIC.test(key)) keys.add(key);
  }
}

// Контент-ключи (P2.5, этап 3): значения контент-JSON. pixel/ — служебные
// метки пиксель-инструментов (не игроку), из отчёта исключены.
function collectStrings(node, out) {
  if (typeof node === 'string') {
    if (CYRILLIC.test(node)) out.add(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
}
function walkJson(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'i18n' || name === 'node_modules' || name === 'pixel') continue;
      walkJson(p, out);
    } else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}
const contentKeys = new Set();
for (const file of walkJson('packages/content')) {
  collectStrings(JSON.parse(readFileSync(file, 'utf-8')), contentKeys);
}

const dicts = { en };
const lines = [];
let thresholdFailed = false;
for (const [name, dict] of Object.entries(dicts)) {
  const translated = [...keys].filter((k) => dict[k] !== undefined).length;
  const pct = keys.size ? (translated / keys.size) * 100 : 100;
  lines.push(`${name} (код): ${translated}/${keys.size} (${pct.toFixed(1)}%)`);
  const ct = [...contentKeys].filter((k) => dict[k] !== undefined).length;
  const cpct = contentKeys.size ? (ct / contentKeys.size) * 100 : 100;
  lines.push(`${name} (контент): ${ct}/${contentKeys.size} (${cpct.toFixed(1)}%)`);
  if (pct < min) thresholdFailed = true;
}
console.log(`ключей кода (клиент+сервер): ${keys.size}; ключей контента: ${contentKeys.size}`);
for (const l of lines) console.log(l);
if (thresholdFailed) {
  console.error(`покрытие ниже порога ${min}%`);
  process.exit(1);
}
