#!/usr/bin/env node
/**
 * Сборка слоёв аватара из мастеров — один вход на весь набор.
 *
 * Список «мастер → слой» живёт в build.config.json, все пути разрешаются
 * относительно этого файла, поэтому запускать можно из любой директории и на
 * любой машине.
 *
 *   node tools/art/avatar-v2/build.mjs                 # собрать всё в layers/
 *   node tools/art/avatar-v2/build.mjs --only=hair     # только причёски
 *   node tools/art/avatar-v2/build.mjs --publish       # + скопировать в public/
 *
 * Мастеров (PNG-исходники по ~1 МБ) в git нет — они приходят из генерации и
 * кладутся в `masters/` (игнорируется). Расположение переопределяется
 * переменными AVATAR_MASTERS_DIR / AVATAR_LAYERS_DIR.
 *
 * Порядок: сначала тело, потом слои — геометрия тела мерится ОДИН раз и
 * раздаётся всем слоям (из неё растут целевые боксы посадки).
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBody, buildLayer, bodyGeometry } from '../avatar-key.mjs';

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
const master = (p) => join(mastersDir, p);

const only = opt('only', null);
const wantBody = !only || cfg.body.out.includes(only);
const layers = only ? cfg.layers.filter((e) => e.out.includes(only) || e.slot === only) : cfg.layers;
if (only && !wantBody && !layers.length) {
  console.error(`--only=${only}: ни одна запись не подошла`);
  process.exit(1);
}

// ── сначала проверяем исходники, чтобы не падать на середине прогона ─────────
const needed = [cfg.body.master, ...layers.map((e) => e.master)].map(master);
const missing = needed.filter((p) => !existsSync(p));
if (missing.length && !flag('allow-missing')) {
  console.error(`✗ нет ${missing.length} из ${needed.length} мастеров в ${mastersDir}:`);
  for (const p of missing.slice(0, 8)) console.error(`    ${basename(p)}`);
  if (missing.length > 8) console.error(`    … и ещё ${missing.length - 8}`);
  console.error('\n  Мастеры намеренно не в git (40 МБ на набор). Достаньте их из');
  console.error('  архива генерации в mastersDir, либо укажите свой:');
  console.error('    AVATAR_MASTERS_DIR=/путь/к/мастерам npm run avatar:build -w tools/art');
  process.exit(1);
}

await mkdir(layersDir, { recursive: true });
const bodyPath = join(layersDir, cfg.body.out);
console.log(` avatar layers: ${layers.length} + тело`);
console.log(`   masters: ${mastersDir}`);
console.log(`   layers:  ${layersDir}\n`);

const failures = [];
let built = 0;

if (wantBody) {
  try {
    const r = await buildBody(master(cfg.body.master), bodyPath);
    console.log(
      `  ✓ ${cfg.body.out.padEnd(24)} ${(statSync(bodyPath).size / 1024).toFixed(1).padStart(6)} КБ  силуэт ${r.s.w}×${r.s.h} → ${r.canvas.w}×${r.canvas.h}`
    );
    built++;
  } catch (err) {
    failures.push({ out: cfg.body.out, err: err.message });
    console.error(`  ✗ ${cfg.body.out}  ${err.message}`);
  }
}

let geometry = null;
if (existsSync(bodyPath)) {
  geometry = await bodyGeometry(master(cfg.body.master));
  console.log(
    `\n   геометрия тела: лицо ${geometry.faceW} px · разлёт рук ${geometry.armSpan} px · ` +
      `ноги ${geometry.legSpan} px · масштаб мастера ${geometry.scale.toFixed(3)}\n`
  );
}

for (const e of layers) {
  const out = join(layersDir, e.out);
  try {
    const r = await buildLayer(master(e.master), e.slot, out, {
      geometry,
      bodyMaster: master(cfg.body.master),
      strip: e.strip,
      tintable: e.tintable,
      fit: e.fit,
      maxStretch: e.maxStretch,
      faceClearance: e.faceClearance,
    });
    if (r.empty) {
      failures.push({ out: e.out, err: 'слой вышел пустым — в мастере не найдено ничего, кроме фона' });
      console.error(`  ✗ ${e.out.padEnd(24)} ${failures[failures.length - 1].err}`);
      continue;
    }
    const flags = [e.strip ? `strip:${e.strip}` : '', e.tintable ? 'tintable' : ''].filter(Boolean).join(' ');
    const stretch = r.on.distortion && r.on.distortion > 1.02 ? `  перекос ${r.on.distortion}×` : '';
    console.log(
      `  ✓ ${e.out.padEnd(24)} ${(statSync(out).size / 1024).toFixed(1).padStart(6)} КБ  ` +
        `${r.on.w}×${r.on.h} @(${r.on.left},${r.on.top}) ${flags}${stretch}`
    );
    built++;
  } catch (err) {
    failures.push({ out: e.out, err: err.message });
    console.error(`  ✗ ${e.out.padEnd(24)} ${err.message}`);
  }
}

if (flag('publish')) {
  if (!publishDir) {
    console.error('✗ в конфиге нет publishDir — некуда публиковать');
    process.exit(1);
  }
  await mkdir(publishDir, { recursive: true });
  const all = [cfg.body, ...layers];
  for (const e of all) {
    const src = join(layersDir, e.out);
    if (existsSync(src)) await copyFile(src, join(publishDir, e.out));
  }
  console.log(`\n📦 опубликовано ${all.length} слоёв → ${basename(dirname(publishDir))}/${basename(publishDir)}/`);
}

console.log(`\n${failures.length ? '✗' : '✓'} ${built} собрано, ${failures.length} с проблемами`);
for (const f of failures) console.error(`  ✗ ${f.out}: ${f.err}`);
if (failures.length) process.exit(1);
console.log('Дальше: npm run avatar:check -w tools/art (меры) и npm run avatar:preview -w tools/art (глазами).');
