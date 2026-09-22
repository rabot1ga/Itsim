#!/usr/bin/env node
/**
 * Сборка слоёв аватара из мастеров — один вход на весь набор.
 *
 * Список «мастер → слой» живёт в build.config.json (не в 38 строках shell'а),
 * все пути разрешаются относительно этого файла, поэтому запускать можно из
 * любой директории и на любой машине.
 *
 *   node tools/art/avatar-v2/build.mjs                 # собрать всё в layers/
 *   node tools/art/avatar-v2/build.mjs --only=hair     # только причёски
 *   node tools/art/avatar-v2/build.mjs --publish       # + скопировать в public/
 *
 * Мастеров (PNG-исходники по ~1 МБ) в git нет — они приходят из генерации и
 * кладутся в `masters/` (игнорируется). Переопределить расположение можно
 * переменными AVATAR_MASTERS_DIR / AVATAR_LAYERS_DIR.
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const cfgPath = resolve(HERE, opt('config', 'build.config.json'));
const cfg = JSON.parse(await readFile(cfgPath, 'utf-8'));
const ROOT = dirname(cfgPath);

const mastersDir = resolve(ROOT, process.env.AVATAR_MASTERS_DIR ?? cfg.mastersDir);
const layersDir = resolve(ROOT, process.env.AVATAR_LAYERS_DIR ?? cfg.layersDir);
const publishDir = cfg.publishDir ? resolve(ROOT, cfg.publishDir) : null;
const engine = resolve(ROOT, '..', 'avatar-key.mjs');

const only = opt('only', null);
const entries = only ? cfg.entries.filter((e) => e.out.includes(only) || e.slot === only) : cfg.entries;
if (!entries.length) {
  console.error(`--only=${only}: ни одна запись не подошла`);
  process.exit(1);
}

// ── сначала проверяем исходники, чтобы не падать на середине прогона ─────────
const missing = entries.filter((e) => !existsSync(join(mastersDir, e.master)));
if (missing.length && !flag('allow-missing')) {
  console.error(`✗ нет ${missing.length} из ${entries.length} мастеров в ${mastersDir}:`);
  for (const e of missing.slice(0, 10)) console.error(`    ${e.master} → ${e.out}`);
  if (missing.length > 10) console.error(`    … и ещё ${missing.length - 10}`);
  console.error('\n  Мастеры намеренно не в git (42 МБ на набор). Достаньте их из');
  console.error('  архива генерации в mastersDir, либо укажите свой:');
  console.error('    AVATAR_MASTERS_DIR=/путь/к/мастерам npm run avatar:build -w tools/art');
  process.exit(1);
}

await mkdir(layersDir, { recursive: true });
console.log(` avatar layers: ${entries.length} из ${cfg.entries.length} записей`);
console.log(`   masters: ${mastersDir}`);
console.log(`   layers:  ${layersDir}\n`);

let built = 0;
const failures = [];
for (const e of entries) {
  const master = join(mastersDir, e.master);
  const out = join(layersDir, e.out);
  const cmd = e.kind === 'body' ? ['body', master, out] : ['layer', master, e.slot ?? 'layer', out];
  const r = spawnSync(process.execPath, [engine, ...cmd], { encoding: 'utf-8' });
  if (r.status !== 0) {
    failures.push({ out: e.out, err: (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ') });
    console.error(`  ✗ ${e.out}  ${failures[failures.length - 1].err}`);
    continue;
  }
  let info = {};
  try {
    info = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    /* движок always prints JSON, but a silent run must not break the loop */
  }
  const size = existsSync(out) ? statSync(out).size : 0;
  const note = info.empty ? 'пустой слой!' : info.s ? `silhouette ${info.s.w}×${info.s.h}` : '';
  console.log(`  ✓ ${e.out.padEnd(24)} ${(size / 1024).toFixed(1).padStart(6)} КБ  ${note}`);
  if (info.empty) failures.push({ out: e.out, err: 'слой вышел пустым — OVERRIDES не нашёл силуэт' });
  built++;
}

if (flag('publish')) {
  if (!publishDir) {
    console.error('✗ в конфиге нет publishDir — некуда публиковать');
    process.exit(1);
  }
  await mkdir(publishDir, { recursive: true });
  for (const e of entries) {
    const src = join(layersDir, e.out);
    if (existsSync(src)) await copyFile(src, join(publishDir, e.out));
  }
  console.log(`\n📦 опубликовано ${built} слоёв → ${basename(dirname(publishDir))}/${basename(publishDir)}/`);
}

console.log(`\n${failures.length ? '✗' : '✓'} ${built} собрано, ${failures.length} с проблемами`);
for (const f of failures) console.error(`  ✗ ${f.out}: ${f.err}`);
if (failures.length) process.exit(1);
console.log('Дальше: npm run avatar:preview -w tools/art (глазами) и npm run avatar:check -w tools/art (меры).');
