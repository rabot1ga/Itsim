#!/usr/bin/env node
/**
 * QA-страж посадки слоёв аватара.
 *
 * Клиент не подгоняет слои: `buildLayerStack()` просто складывает их на канвас
 * 500×760 по zOrder. Значит «сядет» ли арт, целиком определяется сборкой, и
 * глазами это ловится плохо — глаза в 102 px на лице в 90 px выглядят почти
 * правдоподобно, пока не сложишь. Тут — измерения против анатомических
 * лендмарков из avatar-key.mjs (L), а не «нравится / не нравится».
 *
 *   node tools/art/avatar-v2/check-placement.mjs [--layers=<dir>] [--manifest=<path>]
 *   --layers по умолчанию указывает на собранные слои; чтобы проверить то, что
 *   уже лежит в public, передайте --layers=../../../packages/client/public/layers/avatar-v2
 *
 * Выход: 0 — нарушений нет, 1 — есть. В CI пока НЕ подключён: на наборе слоёв
 * из PR #10 он красный по делу (см. docs/ANALYSIS-2026-09-23.md §2.2) и
 * загорится зелёным только после перекалибровки. Подключать в CI надо тем же
 * коммитом, что и готовый арт.
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { L, CW, CH } from '../avatar-key.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const cfg = JSON.parse(await readFile(join(HERE, 'build.config.json'), 'utf-8'));
const LAYERS = resolve(HERE, opt('layers', process.env.AVATAR_LAYERS_DIR ?? cfg.layersDir));
const MANIFEST = resolve(HERE, opt('manifest', join('../../../packages/content/layers/avatar_manifest.json')));

// ── допуски: один файл, чтобы калибровка была видна как набор чисел ──────────
const T = {
  alphaCutoff: 16, // пиксель считается «крытым» выше этой альфы
  eyeWidthVsFace: 1.15, // глаза не могут быть шире лица (с небольшим допуском)
  eyeBand: 16, // серединa глаз — L.eye ± 16
  eyeMaxHeight: 56, // red/legendary/VR рисуются с подсветкой и визором — они выше «нормальных»
  hairTopVsCrown: 22, // причёска начинается не ниже crown+22
  hairMinWidthVsFace: 0.8, // «хохолок» вместо причёски — это провал
  hairMaxWidthVsFace: 1.7,
  beardTopVsMouth: 14, // верх бороды — не выше рта минус 14
  beardMaxDrop: 0.45, // бородa вьётся не дальше 45 % высоты головы за подбородок
  faceAccMaxWidthVsFace: 1.55, // очки/VR/кепки — в пределах головы с запасом
  topWidthVsArms: 0.95, // топ обязан перекрывать разлёт рук тела
  topBottomVsWaistband: 30, // …и доходить хотя бы до пояса
  bottomMaxDropPastAnkle: 18, // штанины не висят ниже щиколотки больше чем на 18
  bottomMinReachToAnkle: 70, // длинные низы обязаны доставать до ног
  shortsMaxBelowCrotch: 110,
  centerOffset: 25, // голова/грудь симметричны: |cx − 250| ≤ 25
};

async function measure(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const mask = new Uint8Array(w * h);
  let x0 = Infinity,
    x1 = -1,
    y0 = Infinity,
    y1 = -1,
    count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= T.alphaCutoff) continue;
      mask[y * w + x] = 1;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { w, h, mask, count, x0, x1, y0, y1 };
}

const rowSpan = (m, w, y) => {
  let a = Infinity,
    b = -1;
  if (y < 0 || y >= m.h) return 0;
  for (let x = 0; x < w; x++) {
    if (!m.mask[y * w + x]) continue;
    if (x < a) a = x;
    if (x > b) b = x;
  }
  return b < 0 ? 0 : b - a + 1;
};
const widestInBand = (m, y0, y1) => {
  let best = 0;
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(m.h - 1, Math.round(y1)); y++) {
    const s = rowSpan(m, m.w, y);
    if (s > best) best = s;
  }
  return best;
};

const layer = (id) => join(LAYERS, `${id}.webp`);
if (!existsSync(layer('body_base'))) {
  console.error(`✗ нет ${layer('body_base')} — соберите слои: npm run avatar:build -w tools/art`);
  process.exit(2);
}

// ── геометрия тела: от неё считаем все «не может быть шире/ниже» ─────────────
const body = await measure(layer('body_base'));
const headH = L.chin - L.crown;
// Лицо = самая широкая строка в полосе брови→кончик носа. Брать шире нельзя:
// ниже (y>150) манекен расширяется шеей, и «лицо» стало бы 119…166 px вместо
// реальных 102 px — все пороги «не шире лица» поехали бы вверх.
const faceW = widestInBand(body, L.brow, L.nose);
const armSpan = widestInBand(body, L.shoulder + 10, L.chest + 40);
const waistW = widestInBand(body, L.waistband - 10, L.waistband + 25);
const legSpan = widestInBand(body, L.crotch + 10, L.ankle - 20);

console.log('\n📐 avatar placement check');
console.log(`   слои:      ${LAYERS}`);
console.log(
  `   тело:      bbox ${body.x1 - body.x0 + 1}×${body.y1 - body.y0 + 1}, лицо ${faceW} px, разлёт рук ${armSpan} px`
);
console.log(
  `   лендмарки: crown ${L.crown} · eye ${L.eye} · mouth ${L.mouth} · chin ${L.chin} · waist ${L.waistband} · ankle ${L.ankle}\n`
);

// ── что проверяем: категория берётся из id слоя ──────────────────────────────
const headAcc = ['acc_glasses', 'acc_vr_headset', 'acc_cap', 'acc_beanie', 'acc_headphones'];
function check(id, m, slot) {
  const problems = [];
  const push = (msg, got, want) => problems.push({ msg, got: String(got), want: String(want) });

  if (m.w !== CW || m.h !== CH) push('канвас не совпадает с манифестом', `${m.w}×${m.h}`, `${CW}×${CH}`);
  if (m.count === 0) push('слой пустой — OVERRIDES не нашёл силуэт', '0 px', '>0 px');

  const wpx = m.x1 - m.x0 + 1;
  const hpx = m.y1 - m.y0 + 1;
  const cx = (m.x0 + m.x1) / 2;
  if (m.count && !id.startsWith('body_') && Math.abs(cx - CW / 2) > T.centerOffset) {
    push('центр слоя уехал от оси тела', `cx ${Math.round(cx)}`, `${CW / 2}±${T.centerOffset}`);
  }
  if (!m.count) return problems;

  if (slot === 'eyes' || id.startsWith('eye_')) {
    if (wpx > faceW * T.eyeWidthVsFace)
      push('глаза шире лица', `${wpx} px`, `≤${Math.round(faceW * T.eyeWidthVsFace)} px`);
    if (hpx > T.eyeMaxHeight) push('глаза слишком высокие для этой головы', `${hpx} px`, `≤${T.eyeMaxHeight} px`);
    const midY = (m.y0 + m.y1) / 2;
    if (Math.abs(midY - L.eye) > T.eyeBand)
      push('середина глаз вне полосы глаз', `y ${Math.round(midY)}`, `${L.eye}±${T.eyeBand}`);
  } else if (slot === 'hair' || id.startsWith('hair_')) {
    if (m.y0 > L.crown + T.hairTopVsCrown)
      push('причёска начинается ниже макушки', `top y ${m.y0}`, `≤${L.crown + T.hairTopVsCrown}`);
    if (wpx < faceW * T.hairMinWidthVsFace)
      push('причёска уже лица — это хохолок', `${wpx} px`, `≥${Math.round(faceW * T.hairMinWidthVsFace)} px`);
    if (wpx > faceW * T.hairMaxWidthVsFace)
      push('причёска шире допустимого объёма', `${wpx} px`, `≤${Math.round(faceW * T.hairMaxWidthVsFace)} px`);
    const bottomLimit = id.includes('long') || id.includes('ponytail') ? L.neck + 40 : L.chin + 12;
    if (m.y1 > bottomLimit) push('причёска свисает ниже подбородка', `bottom y ${m.y1}`, `≤${bottomLimit}`);
  } else if (slot === 'beard' || id.startsWith('beard_')) {
    if (m.y0 < L.mouth - T.beardTopVsMouth)
      push('верх бороды выше рта', `top y ${m.y0}`, `≥${L.mouth - T.beardTopVsMouth}`);
    const maxBottom = L.chin + Math.round(headH * T.beardMaxDrop);
    if (m.y1 > maxBottom) push('борода висит на воротнике', `bottom y ${m.y1}`, `≤${maxBottom}`);
    if (wpx > faceW * 1.25) push('борода шире лица', `${wpx} px`, `≤${Math.round(faceW * 1.25)} px`);
  } else if (headAcc.includes(id)) {
    if (wpx > faceW * T.faceAccMaxWidthVsFace)
      push('аксессуар шире головы', `${wpx} px`, `≤${Math.round(faceW * T.faceAccMaxWidthVsFace)} px`);
    if (id.startsWith('acc_cap') || id.startsWith('acc_beanie') || id.startsWith('acc_headphones')) {
      if (m.y0 > L.crown + T.hairTopVsCrown)
        push('головной убор ниже макушки', `top y ${m.y0}`, `≤${L.crown + T.hairTopVsCrown}`);
      if (m.y1 > L.neck + 10) push('головной убор ушёл на плечи', `bottom y ${m.y1}`, `≤${L.neck + 10}`);
    } else if (m.y0 < L.brow - 18 || m.y1 > L.mouth + 18) {
      push('окулярный аксессуар вне полосы лица', `y ${m.y0}–${m.y1}`, `${L.brow - 18}…${L.mouth + 18}`);
    }
  } else if (id === 'acc_medal') {
    if (m.y0 < L.chest - 45 || m.y1 > L.waistband)
      push('медаль не на груди', `y ${m.y0}–${m.y1}`, `${L.chest - 45}…${L.waistband}`);
  } else if (slot === 'top' || id.startsWith('top_')) {
    const minW = Math.round(armSpan * T.topWidthVsArms);
    if (wpx < minW) push('топ уже разлёта рук — руки торчат из рукавов', `${wpx} px`, `≥${minW} px`);
    if (m.y0 > L.shoulder + 14) push('топ начинается ниже плеч', `top y ${m.y0}`, `≤${L.shoulder + 14}`);
    if (m.y1 < L.waistband - T.topBottomVsWaistband)
      push('топ короче пояса — торчит живот', `bottom y ${m.y1}`, `≥${L.waistband - T.topBottomVsWaistband}`);
  } else if (slot === 'bottom' || id.startsWith('bottom_')) {
    if (m.y0 > L.waistband + 18) push('низ сидит ниже пояса', `top y ${m.y0}`, `≤${L.waistband + 18}`);
    if (id.includes('shorts')) {
      if (m.y1 > L.crotch + T.shortsMaxBelowCrotch)
        push('шорты длиннее, чем шорты', `bottom y ${m.y1}`, `≤${L.crotch + T.shortsMaxBelowCrotch}`);
    } else {
      if (m.y1 < L.ankle - T.bottomMinReachToAnkle)
        push('штанины не доходят до щиколоток', `bottom y ${m.y1}`, `≥${L.ankle - T.bottomMinReachToAnkle}`);
      if (m.y1 > L.ankle + T.bottomMaxDropPastAnkle)
        push('штанины висят ниже щиколоток', `bottom y ${m.y1}`, `≤${L.ankle + T.bottomMaxDropPastAnkle}`);
      if (wpx < legSpan * 0.9) push('низ уже ног', `${wpx} px`, `≥${Math.round(legSpan * 0.9)} px`);
    }
    if (wpx > waistW * 1.6) push('низ шире бёдер', `${wpx} px`, `≤${Math.round(waistW * 1.6)} px`);
  }
  return problems;
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf-8'));
const slotOf = new Map();
const wanted = [];
for (const slot of manifest.slots) {
  for (const entry of slot.entries) {
    if (!entry.file) continue; // «none»-варианты: слоя нет и быть не должно
    slotOf.set(entry.id, slot.id);
    // Ссылку манифеста не используем как путь: в main она ведёт на старые SVG,
    // а соглашение avatar-v2 — <entryId>.webp. Так проверка работает и до, и
    // после переключения манифеста.
    wanted.push(entry.id);
  }
}

let bad = 0;
let checked = 0;
const skipped = [];
for (const id of wanted) {
  const file = layer(id);
  if (!existsSync(file)) {
    skipped.push(id);
    continue;
  }
  const m = await measure(file);
  const problems = check(id, m, slotOf.get(id));
  checked++;
  if (!problems.length) continue;
  bad++;
  console.log(`  ✗ ${id}.webp  [${slotOf.get(id) ?? '?'}]`);
  for (const p of problems) console.log(`      ${p.msg}: ${p.got} (хотим ${p.want})`);
}

if (skipped.length)
  console.log(
    `\n  ⚠ нет ${skipped.length} слоёв в ${LAYERS}: ${skipped.slice(0, 6).join(', ')}${skipped.length > 6 ? ', …' : ''}`
  );
console.log(
  `\n${bad ? '✗' : '✓'} проверено ${checked} слоёв, ${bad} с нарушениями${skipped.length ? `, ${skipped.length} не найдено` : ''}`
);
if (bad) console.log('   Правки — в OVERRIDES (tools/art/avatar-key.mjs) и в мастерах, не в клиенте.');
process.exit(bad ? 1 : 0);
