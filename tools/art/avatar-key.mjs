#!/usr/bin/env node
/**
 * Avatar-layer builder — chroma-key extraction of layered avatar sprites.
 *
 * Мастер-файлы (см. tools/art/avatar-v2/README.md) — это ПРЕДМЕТ на пурпурном
 * фоне: парик, футболка, глаза. Не «фигура в предмете». Поэтому масштаб нельзя
 * взять из самого мастера, и в прошлой версии каждого слоя сидела ручная
 * константа (`scale: 0.10` для hair_short и т. п.) — 38 штук, каждая со своей
 * ошибкой. Здесь масштаб выводится из геометрии ТЕЛА:
 *
 *   1. тело меряется по манекену (`bodyGeometry`) → лицо, разлёт рук, бёдра,
 *      ноги — уже в координатах канваса 500×760;
 *   2. слот получает целевой бокс от этих чисел (`SLOT_TARGETS`);
 *   3. предмет вписывается в бокс с сохранением аспекта и выравниванием
 *      (верх/центр/низ) — mode 'fit'.
 *
 * Смысл: сменить тело или перерисовать мастера — и все слои пересчитываются
 * сами; править 38 магических чисел больше не нужно. Посадка проверяется
 * `avatar-v2/check-placement.mjs`, которое меряет ровно те же величины.
 *
 * Клиент слои не подгоняет: `buildLayerStack()`
 * (packages/client/src/components/room/layers.ts) просто складывает
 * /layers/<file> по zOrder — значит вся геометрия решается здесь.
 *
 * Использование (обычно через avatar-v2/build.mjs):
 *   node tools/art/avatar-key.mjs body  <master.png> <out.webp>
 *   node tools/art/avatar-key.mjs layer <master.png> <slot> <out.webp> \
 *        --body-master=<mannequin.png> [--strip=color] [--tintable] [--fit-w=110]
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const TOL = 72;
/** Потолок анизотропии для fit:'box' — дальше это уже не «подгонка», а порченый арт. */
const MAX_STRETCH = 1.5;
export const CW = 500,
  CH = 760;
export const BODY = { top: 30, height: 690, cx: 250 };
/** Анатомические лендмарки канваса — единый источник правды для билда и QA-стража. */
export const L = {
  crown: 30,
  hairline: 52,
  brow: 70,
  eye: 95,
  nose: 128,
  mouth: 150,
  chin: 168,
  neck: 182,
  shoulder: 192,
  armpit: 212,
  chest: 270,
  waist: 350,
  navel: 385,
  waistband: 430,
  crotch: 465,
  ankle: 720,
  ear: 85,
};

// ---------- low-level pixel ops ----------

async function loadRaw(p) {
  const r = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const copy = Buffer.alloc(r.data.length);
  r.data.copy(copy);
  return { data: copy, info: r.info };
}

function keyMg(src, w, h) {
  // Только детект пурпура, без dilate/erode: эрозия съедала мелкие спрайты
  // (глаза, шапки) целиком — в маленьком спрайте каждый пиксель граничит с
  // прозрачным фоном.
  const m = new Uint8Array(w * h);
  const N = w * h * 4;
  for (let i = 0, p = 0; i < N; i += 4, p++) {
    const r = src[i],
      g = src[i + 1],
      b = src[i + 2];
    m[p] = Math.max(Math.abs(r - 255), Math.abs(g), Math.abs(b - 255)) <= TOL ? 0 : 1;
  }
  return m;
}

function bbox(m, w, h) {
  let x1 = w,
    y1 = h,
    x2 = -1,
    y2 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      if (x < x1) x1 = x;
      if (y < y1) y1 = y;
      if (x > x2) x2 = x;
      if (y > y2) y2 = y;
    }
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

function denoise(m, w, h) {
  // Выкидываем одиночные пиксели-крапинки. Пиксель на краю канваса одиночным не
  // считается: манекен доходит до нижней границы.
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!m[p]) continue;
      let adj = false;
      for (let dy = -1; dy <= 1 && !adj; dy++)
        for (let dx = -1; dx <= 1 && !adj; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            adj = true;
            break;
          }
          if (m[ny * w + nx]) adj = true;
        }
      if (adj) o[p] = 1;
    }
  return o;
}

function components(m, w, h) {
  const c = new Int32Array(w * h),
    szs = [];
  let id = 0;
  const st = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!m[p] || c[p]) continue;
      id++;
      let n = 0;
      st.length = 0;
      st.push(p);
      c[p] = id;
      while (st.length) {
        const q = st.pop();
        n++;
        const qx = q % w;
        const nb = [q - w, q + w];
        if (qx > 0) nb.push(q - 1);
        if (qx < w - 1) nb.push(q + 1);
        for (const nn of nb)
          if (m[nn] && !c[nn]) {
            c[nn] = id;
            st.push(nn);
          }
      }
      szs.push({ id, n });
    }
  return { c, szs };
}

function keepBig(m, w, h, rat = 0.08) {
  const { c, szs } = components(m, w, h);
  if (!szs.length) return m;
  szs.sort((a, b) => b.n - a.n);
  const mn = szs[0].n;
  const keep = new Set(szs.filter((s) => s.n >= mn * rat).map((s) => s.id));
  const o = new Uint8Array(w * h);
  for (let p = 0; p < o.length; p++) if (keep.has(c[p])) o[p] = 1;
  return o;
}

// Generic "colored item" mask: выкидывает пурпурный фон, серый манекен и кожу.
// Оставляет всё цветное (включая тёмные контуры). Нужен, когда в мастере предмета
// нарисовано лицо (причёски b3, бороды) — иначе «предмет» включил бы голову.
function coloredPix(mask, data, w, h) {
  const o = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (!mask[p]) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const sp = Math.max(r, g, b) - Math.min(r, g, b),
      lum = (r + g + b) / 3;
    if (sp < 25 && lum > 60 && lum < 220) continue; // серый манекен
    if (r > 180 && g > 130 && b > 100 && r > g + 5 && g > b + 5) continue; // кожа
    o[p] = 1;
  }
  return o;
}

function extBuf(data, w, h, box) {
  const x = Math.max(0, Math.min(w - 1, box.x));
  const y = Math.max(0, Math.min(h - 1, box.y));
  const bw = Math.max(1, Math.min(box.w, w - x));
  const bh = Math.max(1, Math.min(box.h, h - y));
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x, top: y, width: bw, height: bh })
    .png()
    .toBuffer();
}

function blank(alpha = 0) {
  return sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha } } });
}

/** Тело рисуется серым манекеном: приводим к шкале серого в узком коридоре. */
function toGray(img, lo = 0.36, hi = 0.82) {
  return img.greyscale().linear(hi - lo, lo * 255);
}

function rowSpan(mask, w, y) {
  let a = -1,
    b = -1;
  for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (a < 0) a = x;
    b = x;
  }
  return b < 0 ? { min: 0, max: 0, width: 0 } : { min: a, max: b, width: b - a + 1 };
}

// ---------- геометрия тела ----------

/**
 * Меряет манекена и переводит меры в координаты канваса тем же аффинным
 * преобразованием, каким `buildBody` кладёт тело на 500×760.
 */
export async function bodyGeometry(mannequinPath) {
  const { data, info } = await loadRaw(mannequinPath);
  const w = info.width,
    h = info.height;
  const m = keepBig(denoise(keyMg(data, w, h), w, h), w, h);
  const s = bbox(m, w, h);
  if (s.w <= 0 || s.h <= 0) throw new Error('mannequin silhouette is empty');
  const sc = BODY.height / s.h;
  const rowToCanvas = (y) => BODY.top + (y - s.y) * sc;
  const widestIn = (c0, c1) => {
    let best = 0;
    for (let y = s.y; y < s.y + s.h; y++) {
      const cy = rowToCanvas(y);
      if (cy < c0 || cy > c1) continue;
      const width = rowSpan(m, w, y).width * sc;
      if (width > best) best = width;
    }
    return Math.round(best);
  };
  return {
    scale: sc,
    /** самая широкая строка лица в полосе брови→кончик носа */
    faceW: widestIn(L.brow, L.nose),
    /** разлёт плеч+рук — топы обязаны быть не уже */
    armSpan: widestIn(L.shoulder + 10, L.chest + 40),
    waistW: widestIn(L.waistband - 10, L.waistband + 25),
    /** разлёт ног в полосе пах→щиколотки — низы обязаны его накрывать */
    legSpan: widestIn(L.crotch + 10, L.ankle - 20),
    headH: L.chin - L.crown,
  };
}

/** Целевые боксы слотов — все выведены из геометрии тела и лендмарков. */
export function slotTargets(G) {
  const cx = BODY.cx;
  return {
    eyes: { w: Math.round(G.faceW * 1.0), h: 36, cx, cy: L.eye, align: 'center' },
    // Волосы: от макушки до строки глаз — НИЖЕ нельзя, иначе чёлка закрывает
    // глаза (ровно это и ловит проверка «лицо не закрыто»). Низкий бокс + fit:'box',
    // потому что мастера причёсок приходят с произвольным аспектом.
    // Волосы — объёмный предмет, сплющивать его нельзя: масштаб строго ПО
    // ШИРИНЕ головы (fit:'width' — анизотропии нет вовсе), верх на макушке, h у
    // бокса не задаём: высота следует из аспекта мастера. То, что причёска не
    // съест лицо, обеспечивает faceClearance (окно глаз), а проверяет — страж.
    //
    // Известный долг арт-набора: hair_long/hair_ponytail нарисованы короткими
    // (до челюсти), а не «до плеч» — без перерисовки мастера это не исправить,
    // растягивать нельзя (см. MAX_STRETCH).
    hair: { w: Math.round(G.faceW * 1.18), cx, top: L.crown - 12, align: 'top', fit: 'width' },
    hair_long: { w: Math.round(G.faceW * 1.3), cx, top: L.crown - 12, align: 'top', fit: 'width' },
    beard: { w: Math.round(G.faceW * 0.92), h: Math.round(G.headH * 0.78), cx, top: L.nose - 4, align: 'top' },
    // усы — не «борода с верхом у носа»: они центрируются на рту, иначе 22-px
    // полоса уезжает на нос
    beard_mustache: { w: Math.round(G.faceW * 0.72), cx, cy: L.mouth + 4, align: 'center' },
    top: { w: Math.round(G.armSpan), cx, top: L.shoulder - 4, align: 'top', fit: 'width' },
    // Низы обязаны и дотянуть до щиколоток, и накрыть ноги по ширине — бокс
    // заполняется целиком (fit:'box'), перекос сверх MAX_STRETCH — ошибка сборки.
    bottom: {
      w: Math.round(G.legSpan * 1.15),
      h: L.ankle + 8 - (L.waistband - 5),
      cx,
      top: L.waistband - 5,
      align: 'top',
      fit: 'box',
    },
    // Шорты: тот же пояс, но тянуть их до щиколотки нельзя — высота до колена.
    bottom_shorts: {
      w: Math.round(G.legSpan * 1.05),
      h: L.crotch + 90 - (L.waistband - 5),
      cx,
      top: L.waistband - 5,
      align: 'top',
    },
    acc_face: { w: Math.round(G.faceW * 1.05), cx, cy: L.eye + 8, align: 'center' },
    acc_vr: { w: Math.round(G.faceW * 1.3), cx, cy: L.eye + 5, align: 'center' },
    // Кепка/бини — по ширине головы (иначе «contain» по высоте делает из неё
    // конфетку на макушке), сверху с запасом на объём.
    acc_head: {
      w: Math.round(G.faceW * 1.15),
      h: Math.round(G.headH * 1.1),
      cx,
      top: L.crown - 6,
      align: 'top',
      fit: 'width',
    },
    acc_ears: { w: Math.round(G.faceW * 1.35), cx, cy: L.ear + 8, align: 'center' },
    acc_chest: { w: 64, cx, cy: L.chest + 50, align: 'center' },
  };
}

// ---------- builders ----------

export async function buildBody(inp, out) {
  const { data: rawData, info } = await loadRaw(inp);
  const w = info.width,
    h = info.height;
  let m = keyMg(rawData, w, h);
  m = denoise(m, w, h);
  m = keepBig(m, w, h);
  const s = bbox(m, w, h);
  if (s.w <= 0 || s.h <= 0) throw new Error('body empty');
  const outData = Buffer.alloc(rawData.length);
  rawData.copy(outData);
  for (let p = 0; p < m.length; p++) if (!m[p]) outData[p * 4 + 3] = 0;
  const buf = await extBuf(outData, w, h, s);
  const sc = BODY.height / s.h;
  let tw = Math.round(s.w * sc),
    th = BODY.height;
  if (tw > CW || th > CH) {
    const fit = Math.min(CW / tw, CH / th);
    tw = Math.round(tw * fit);
    th = Math.round(th * fit);
  }
  const rz = await toGray(sharp(buf)).resize(tw, th, { kernel: 'nearest' }).png().toBuffer();
  const cv = blank().composite([{ input: rz, left: Math.round((CW - tw) / 2), top: BODY.top }]);
  await mkdir(dirname(out), { recursive: true });
  await cv.webp({ quality: 92 }).toFile(out);
  return { out, s: { w: s.w, h: s.h }, canvas: { w: tw, h: th } };
}

/**
 * Вписывает предмет в целевой бокс слота с сохранением аспекта.
 * `align`: 'top' — верх бокса = верх предмета; 'bottom' — низ = низ;
 * 'center' — центрирование по обеим осям.
 */
async function placeFit(itemBufP, iw, ih, target, maxStretch = MAX_STRETCH) {
  const itemBuf = await itemBufP;
  let sx, sy;
  if (target.fit === 'box') {
    sx = target.w / iw;
    sy = target.h / ih;
    const stretch = Math.max(sx / sy, sy / sx);
    if (stretch > maxStretch) {
      throw new Error(
        `мастер не влезает в бокс слота без деформации: аспект предмета ${(iw / ih).toFixed(2)} против ` +
          `${(target.w / target.h).toFixed(2)} у слота (перекос ${stretch.toFixed(2)}× > ${maxStretch}×) — перерисуйте мастер`
      );
    }
  } else {
    const scale =
      target.fit === 'width'
        ? target.w / iw
        : target.fit === 'height'
          ? target.h / ih
          : target.h
            ? Math.min(target.w / iw, target.h / ih)
            : target.w / iw;
    sx = sy = scale;
  }
  let tw = Math.max(1, Math.round(iw * sx));
  let th = Math.max(1, Math.round(ih * sy));
  const distortion = Number(Math.max(sx / sy, sy / sx).toFixed(2));
  const fit = Math.min(1, (CW - 4) / tw, (CH - 4) / th);
  if (fit < 1) {
    tw = Math.max(1, Math.round(tw * fit));
    th = Math.max(1, Math.round(th * fit));
  }
  const rz = await sharp(itemBuf).resize(tw, th, { kernel: 'nearest' }).png().toBuffer();
  const left = Math.round((target.cx ?? CW / 2) - tw / 2);
  let top;
  if (target.align === 'top') top = Math.round(target.top);
  else if (target.align === 'bottom') top = Math.round(target.bottom - th);
  else top = Math.round((target.cy ?? CH / 2) - th / 2);
  return {
    rz,
    left: Math.max(-tw + 2, Math.min(CW - 2, left)),
    top: Math.max(-th + 2, Math.min(CH - 2, top)),
    tw,
    th,
    distortion,
  };
}

export async function buildLayer(inp, slot, out, opts = {}) {
  const { data: rawData, info } = await loadRaw(inp);
  const w = info.width,
    h = info.height;
  let m = keyMg(rawData, w, h);
  m = denoise(m, w, h);
  m = keepBig(m, w, h);
  const outData = Buffer.alloc(rawData.length);
  rawData.copy(outData);
  for (let p = 0; p < m.length; p++) if (!m[p]) outData[p * 4 + 3] = 0;
  let s = bbox(m, w, h);
  await mkdir(dirname(out), { recursive: true });
  if (s.w <= 0 || s.h <= 0) {
    await blank().webp({ quality: 92 }).toFile(out);
    return { out, empty: true };
  }

  // В мастере предмета может быть нарисовано лицо (причёски/бороды batches b3/b5) —
  // тогда в «предмет» оставляем только цветные пиксели, иначе bbox посчитает голову.
  let mask = m;
  let data = outData;
  if (opts.strip === 'color') {
    const cm = keepBig(denoise(coloredPix(m, rawData, w, h), w, h), w, h, 0.05);
    const cb = bbox(cm, w, h);
    if (cb.w > 0) {
      mask = cm;
      data = Buffer.from(rawData);
      for (let p = 0; p < mask.length; p++)
        if (!mask[p]) data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = data[p * 4 + 3] = 0;
      s = cb;
    }
  }

  const G = opts.geometry ?? (await bodyGeometry(opts.bodyMaster));
  const target = { ...slotTargets(G)[slot], ...(opts.fit ?? {}) };
  if (!target.w) throw new Error(`slot "${slot}" не описан в slotTargets`);
  const placed = await placeFit(extBuf(data, w, h, s), s.w, s.h, target, opts.maxStretch ?? MAX_STRETCH);

  // tintable: слой отдаётся шкалой серого, чтобы CSS-фильтр из tintSlot
  // (sepia→saturate→hue-rotate) красил его цветом из генетики. Цветной вход
  // этот фильтр сломает — отсюда greyscale здесь, а не в клиенте.
  const layerBuf = opts.tintable ? await sharp(placed.rz).greyscale().png().toBuffer() : placed.rz;

  // Слой кладём на канвас сразу: «окно лица» вычитается уже в координатах
  // канваса, где мы точно знаем строку глаз.
  let onCanvas = await blank()
    .composite([{ input: layerBuf, left: placed.left, top: placed.top }])
    .png()
    .toBuffer();

  // Что вычитаем из слоя, чтобы он не съел лицо. Два режима — по природе
  // дефекта, оба «дыра» в самом слое: клиент слой не масштабирует и не режет.
  //   'eyes' — причёски: мастер это силуэт головы с закрашенным лицом, на
  //            канвасе он работает маской и съедает глаза (болезнь PR #10).
  //            Вычитаем только полосу глаз: брови, чёлка и объём по бокам
  //            остаются как нарисованы.
  //   'face' — головные уборы: мастер нарисован НА голове, и вместе с шапкой в
  //            слой попала сама голова. Вычитаем лицо от брови до подбородка —
  //            шапка остаётся куполом на макушке. Цена: если у кепки козырёк
  //            нарисован ниже брови (а у наших мастеров именно так), он
  //            подрежется — но альтернатива хуже: козырёк на глазах.
  const clearance = opts.faceClearance === true ? 'eyes' : opts.faceClearance;
  if (clearance === 'eyes' || clearance === 'face') {
    const box =
      clearance === 'eyes'
        ? { x: Math.round(G.faceW * 0.72), y: 24, left: BODY.cx - Math.round(G.faceW * 0.72) / 2, top: L.eye - 12 }
        : {
            x: Math.round(G.faceW * 1.02),
            y: L.chin + 2 - (L.brow - 2),
            left: BODY.cx - Math.round(G.faceW * 1.02) / 2,
            top: L.brow - 2,
          };
    const eraser = await blank()
      .composite([
        {
          input: await sharp({
            create: {
              width: Math.round(box.x),
              height: Math.round(box.y),
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          left: Math.round(box.left),
          top: Math.round(box.top),
        },
      ])
      .png()
      .toBuffer();
    onCanvas = await sharp(onCanvas)
      .composite([{ input: eraser, left: 0, top: 0, blend: 'dest-out' }])
      .png()
      .toBuffer();
  }

  await sharp(onCanvas).webp({ quality: 92 }).toFile(out);
  return {
    out,
    slot,
    src: { w: s.w, h: s.h },
    on: { w: placed.tw, h: placed.th, left: placed.left, top: placed.top, distortion: placed.distortion },
    target,
    tintable: !!opts.tintable,
  };
}

// ---------- CLI ----------

function parseFlags(args) {
  const flags = {};
  for (const a of args) {
    if (!a.startsWith('--')) continue;
    const [k, ...rest] = a.slice(2).split('=');
    flags[k] = rest.length ? rest.join('=') : true;
  }
  return flags;
}

// Модуль импортируют (QA-страж, build.mjs), поэтому CLI живёт только при прямом запуске.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const raw = process.argv.slice(2);
  const positional = raw.filter((a) => !a.startsWith('--'));
  const flags = parseFlags(raw);
  const [cmd, ...args] = positional;
  const here = dirname(fileURLToPath(import.meta.url));
  const defaultBody = resolve(here, 'avatar-v2/masters/mannequin-v1.png');
  const bodyMaster = flags['body-master'] ?? (existsSync(defaultBody) ? defaultBody : null);
  try {
    if (cmd === 'body') {
      const [i, o] = args;
      console.log(JSON.stringify(await buildBody(i, o)));
    } else if (cmd === 'layer') {
      const [i, slot, o] = args;
      const opts = {
        bodyMaster,
        strip: flags.strip,
        tintable: !!flags.tintable,
        fit: flags['fit-w'] || flags['fit-cy'] || flags['fit-top'] ? {} : null,
      };
      if (opts.fit) {
        if (flags['fit-w']) opts.fit.w = Number(flags['fit-w']);
        if (flags['fit-h']) opts.fit.h = Number(flags['fit-h']);
        if (flags['fit-cy']) opts.fit.cy = Number(flags['fit-cy']);
        if (flags['fit-top']) opts.fit.top = Number(flags['fit-top']);
        if (flags['fit-align']) opts.fit.align = flags['fit-align'];
      }
      console.log(JSON.stringify(await buildLayer(i, slot, o, opts)));
    } else {
      console.error('bad cmd', cmd);
      console.error(
        'usage: avatar-key.mjs body <master> <out> | layer <master> <slot> <out> [--body-master=…] [--strip=color] [--tintable]'
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
