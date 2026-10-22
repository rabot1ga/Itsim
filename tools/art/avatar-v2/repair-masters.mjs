/**
 * Ремонт арт-долгов_avatar-v2 (22.10.2026), воспроизводимый из репозитория.
 *
 * Мастеры намеренно не хранятся в git (40 МБ на набор, решение 23.09), поэтому
 * скрипт не требует «архива генерации» целиком: всё, что нужно, он восстанавливает
 * из того, что в git есть.
 *
 *  1. `recover` — терянный мастер `b9/bottom_chinos.png`. Опубликованный слой
 *     `packages/client/public/layers/avatar-v2/bottom_chinos.webp` — это мастер,
 *     посаженный в слот nearest-масштабом (`placeFit` в avatar-key.mjs:
 *     `kernel: 'nearest'`), значит обратный nearest-апскейл спрайта из слоя
 *     восстанавливает мастер пиксель-в-пиксель с точностью до масштаба сетки.
 *     Конфиг сборки ссылается на `b9/bottom_chinos.png`, которого не было ни в
 *     одном батче git (b5 — ранний черновик с аспектом 0.52 против 0.83 у слота),
 *     из-за чего `avatar:build` падал даже при полном наборе мастеров.
 *
 *  2. `repair` — четыре предупреждения стража (`check-placement.mjs`), которые
 *     лечатся только в мастере:
 *       · acc_cap / acc_beanie: козырёк/отворот нарисован ниже брови, и кромку
 *         по факту резал эйзер сборки (режим 'face') — бровная полоса была
 *         заполнена на 31 % при идеально пустом окне глаз. Скрипт стирает в
 *         мастере пиксели убора, которые после посадки попадают в бровную
 *         полосу и ниже в колонке лица (|x−CW/2| ≤ 36 % faceW): кромка становится
 *         нарисованной линией над бровями, бока над ушами остаются.
 *       · hair_long / hair_ponytail: пряди поверх лица (71 % и 27 % полосы лица
 *         при пороге 5 %). Скрипт стирает в мастере пиксели, попадающие после
 *         посадки в полосу лица (brow+12…chin, |x−CW/2| ≤ 30 % faceW): причёска
 *         начинает обрамлять лицо, а не закрашивать его. Окно глаз не трогаем —
 *         его вычитает эйзер сборки ('eyes').
 *
 * Оригинал каждого правимого мастера копируется в
 * `masters/_backup-2026-10-22/<путь>` (тоже вне git). Повторный запуск идемпотентен:
 * стирать уже прозрачное — no-op, recover детерминирован.
 *
 * Запуск: node tools/art/avatar-v2/repair-masters.mjs [recover|repair|all]
 * Затем:  npm run avatar:build -w tools/art && npm run avatar:check -w tools/art
 */
import sharp from 'sharp';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CW, CH, L, buildLayer, bodyGeometry } from '../avatar-key.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(await readFile(join(HERE, 'build.config.json'), 'utf-8'));
const mastersDir = resolve(HERE, process.env.AVATAR_MASTERS_DIR ?? cfg.mastersDir);
const PUBLIC = resolve(HERE, '../../../packages/client/public/layers/avatar-v2');
const BACKUP = join(mastersDir, '_backup-2026-10-22');

const mode = process.argv[2] ?? 'all';

// ── геометрия: те же числа, что видит сборка и страж ─────────────────────────
const geometry = await bodyGeometry(join(mastersDir, cfg.body.master));
const bodyRaw = await sharp(join(PUBLIC, 'body_base.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// лицо = самая широкая строка в полосе brow…nose (как в check-placement.mjs)
let faceW = 0;
for (let y = L.brow; y <= L.nose; y++) {
  let xs = -1,
    xe = -1;
  for (let x = 0; x < bodyRaw.info.width; x++) {
    if (bodyRaw.data[(y * bodyRaw.info.width + x) * 4 + 3] > 16) {
      if (xs < 0) xs = x;
      xe = x;
    }
  }
  if (xs >= 0) faceW = Math.max(faceW, xe - xs + 1);
}
const FACE_X0 = Math.round(CW / 2 - faceW * 0.3); // полоса лица стража
const FACE_X1 = Math.round(CW / 2 + faceW * 0.3);
const BROW_X0 = Math.round(CW / 2 - faceW * 0.36); // бровная полоса стража
const BROW_X1 = Math.round(CW / 2 + faceW * 0.36);
console.log(`faceW ${faceW} px · полоса лица x ${FACE_X0}…${FACE_X1}, y ${L.brow + 12}…${L.chin} · брови x ${BROW_X0}…${BROW_X1}, y ≥ ${L.brow - 6}`);

async function rawMaster(p) {
  return sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function bboxOf(mask, w, h) {
  let x0 = Infinity,
    x1 = -1,
    y0 = Infinity,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
async function measureLayer(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  return { bb: bboxOf(mask, info.width, info.height), w: info.width, h: info.height };
}

// ── 1. recover: мастер chinos из опубликованного слоя ────────────────────────
async function recoverChinos() {
  const pub = join(PUBLIC, 'bottom_chinos.webp');
  const { data, info } = await sharp(pub).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  const bb = bboxOf(mask, info.width, info.height);
  const SCALE = 2; // сетка мастеров вдвое крупнее канваса (масштаб тела 0.5)
  const sw = bb.w * SCALE,
    sh = bb.h * SCALE;
  const out = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const sx = bb.x0 + Math.floor(x / SCALE),
        sy = bb.y0 + Math.floor(y / SCALE);
      const si = (sy * info.width + sx) * 4,
        di = (y * sw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  const dst = join(mastersDir, 'b9/bottom_chinos.png');
  await mkdir(dirname(dst), { recursive: true });
  await sharp(out, { raw: { width: sw, height: sh, channels: 4 } }).png().toFile(dst);
  console.log(`  ✓ recover: ${dst} (${sw}×${sh}) из опубликованного слоя ${bb.w}×${bb.h}`);
}

// ── 2. repair: стереть в мастере то, что страж считает долгом ─────────────────
const REPAIRS = [
  { out: 'acc_cap.webp', rect: { x0: BROW_X0, x1: BROW_X1, y0: L.brow - 6, y1: CH } },
  { out: 'acc_beanie.webp', rect: { x0: BROW_X0, x1: BROW_X1, y0: L.brow - 6, y1: CH } },
  { out: 'hair_long.webp', rect: { x0: FACE_X0, x1: FACE_X1, y0: L.brow + 12, y1: L.chin } },
  { out: 'hair_ponytail.webp', rect: { x0: FACE_X0, x1: FACE_X1, y0: L.brow + 12, y1: L.chin } },
];

async function repairOne(entry, rect) {
  const mPath = join(mastersDir, entry.master);
  const { data, info } = await rawMaster(mPath);
  const mMask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mMask.length; i++) mMask[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  const mbb = bboxOf(mMask, info.width, info.height);

  // сажаем текущий мастер тем же конвейером, чтобы снять масштаб/офсет посадки
  // Мерим посадку БЕЗ эйзера: с ним bbox слоя уже вырезан и масштаб/офсет
  // снимаются с искажением (кепка: после 'face' остаётся купол до брови).
  const tmp = join(HERE, 'layers', `_measure_${entry.out}`);
  await buildLayer(mPath, entry.slot, tmp, {
    geometry,
    bodyMaster: join(mastersDir, cfg.body.master),
    strip: entry.strip,
    tintable: entry.tintable,
    fit: entry.fit,
    maxStretch: entry.maxStretch,
  });
  const { bb } = await measureLayer(tmp);
  const sx = bb.w / mbb.w,
    sy = bb.h / mbb.h;
  const left = bb.x0,
    top = bb.y0;

  // канвас-прямоугольник долга → прямоугольник в мастере
  const mx0 = Math.max(0, Math.floor((rect.x0 - left) / sx));
  const mx1 = Math.min(info.width - 1, Math.ceil((rect.x1 - left) / sx));
  const my0 = Math.max(0, Math.floor((rect.y0 - top) / sy));
  const my1 = Math.min(info.height - 1, Math.ceil((rect.y1 - top) / sy));

  let erased = 0;
  for (let y = my0; y <= my1; y++)
    for (let x = mx0; x <= mx1; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 0) {
        data[i + 3] = 0;
        erased++;
      }
    }

  const bak = join(BACKUP, entry.master);
  if (!existsSync(bak)) {
    await mkdir(dirname(bak), { recursive: true });
    await copyFile(mPath, bak);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(mPath);
  console.log(
    `  ✓ repair: ${entry.master}: стёрто ${erased} px (мастер-окно ${mx0}…${mx1} × ${my0}…${my1}, посадка s=${sx.toFixed(3)}/${sy.toFixed(3)}, left=${left}, top=${top})`
  );
}

const byOut = Object.fromEntries(cfg.layers.map((e) => [e.out, e]));
if (mode === 'recover' || mode === 'all') await recoverChinos();
if (mode === 'repair' || mode === 'all') {
  for (const r of REPAIRS) await repairOne(byOut[r.out], r.rect);
}
console.log('\nГотово: npm run avatar:build -w tools/art && npm run avatar:check -w tools/art');
