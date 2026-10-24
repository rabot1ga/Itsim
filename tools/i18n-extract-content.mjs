/**
 * Извлечение строк-ключей из контента (P2.5, этап 3). Контент-JSON — это
 * данные, не код: значения с кириллицей становятся ключами того же gettext-
 * словаря (packages/shared/src/i18n/en.ts), перевод применяется на границе
 * API (server onSend → translateDeep).
 *
 *   node tools/i18n-extract-content.mjs [--exclude=events,interview_questions]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CYRILLIC = /[А-Яа-яЁё]/;
const args = process.argv.slice(2);
const exclude =
  (args.find((a) => a.startsWith('--exclude=')) ?? '--exclude=').split('=')[1]?.split(',').filter(Boolean) ?? [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'i18n' || name === 'node_modules') continue;
      walk(p, out);
    } else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function collectStrings(node, out) {
  if (typeof node === 'string') {
    if (CYRILLIC.test(node)) out.add(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
}

const keys = new Set();
for (const file of walk('packages/content')) {
  const skip = exclude.some((ex) => file.includes(`/${ex}`) || file.includes(`/${ex}.`));
  if (skip) continue;
  collectStrings(JSON.parse(readFileSync(file, 'utf-8')), keys);
}
const sorted = [...keys].sort();
process.stdout.write(JSON.stringify(sorted, null, 0) + '\n');
console.error(`ключей контента: ${sorted.length}`);
