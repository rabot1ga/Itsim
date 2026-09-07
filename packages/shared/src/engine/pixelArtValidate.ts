import { PixelArtFile, PixelCategory, PixelGeneratorConfig } from '../types';
import { HEX_ALLOWED_CATEGORIES, luminance, parseHex, resolveColor, noneVariantOf, categoryOrder } from './pixelArt';

/**
 * Validation for the pixel-art content (ТЗ §12). Pure and shared: the CLI runs
 * it, and the server runs it at boot so a broken avatar pack can never ship.
 *
 * Deliberate deviation from the ТЗ: out-of-canvas pixels are an *error*, not a
 * warning — a silently cropped PNG is the kind of bug a human reviewer never
 * catches by eye (docs/pixel-art.md §1.8).
 */

export type IssueLevel = 'error' | 'warn';

export interface PixelIssue {
  level: IssueLevel;
  path: string;
  message: string;
}

export interface PixelValidation {
  ok: boolean;
  issues: PixelIssue[];
  stats: {
    components: number;
    categories: number;
    pixels: number;
    palettes: number;
  };
}

const PALETTE_ROLE_HINT = 'expected "palette#index", "palette#hlt|base|shd|outline" or "#rrggbb"';

export function validatePixelArtFile(file: unknown, config?: PixelGeneratorConfig | null): PixelValidation {
  const issues: PixelIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warn', path, message });

  if (!file || typeof file !== 'object') {
    return { ok: false, issues: [{ level: 'error', path: '', message: 'file is not an object' }], stats: emptyStats() };
  }
  const f = file as Partial<PixelArtFile>;

  // ---- format / canvas ----
  if (f.format === undefined) warn('format', 'missing "format" (assume 1) — pin it, the file will outlive you');
  if (f.format !== undefined && typeof f.format !== 'number') err('format', 'must be a number');
  if (f.canvas && (!Number.isInteger(f.canvas.width) || !Number.isInteger(f.canvas.height))) {
    err('canvas', 'width/height must be integers');
  }
  const W = f.canvas?.width ?? 0;
  const H = f.canvas?.height ?? 0;
  if (W <= 0 || H <= 0) err('canvas', 'canvas.width/height must be positive');

  // ---- layout ----
  if (!f.layout) {
    err('layout', 'missing layout (eyes_y, mouth_y, symmetry_axis_x)');
  } else {
    for (const key of ['eyes_y', 'mouth_y', 'symmetry_axis_x'] as const) {
      const v = f.layout[key];
      if (typeof v !== 'number') err(`layout.${key}`, 'must be a number');
      else if ((key === 'symmetry_axis_x' ? v > W : v >= H) || v < 0) err(`layout.${key}`, `${v} is outside the canvas`);
    }
    if (typeof f.layout.eyes_y === 'number' && typeof f.layout.mouth_y === 'number') {
      if (f.layout.eyes_y >= f.layout.mouth_y) err('layout', 'eyes_y must be above mouth_y');
    }
  }

  // ---- palettes ----
  const palettes = f.palettes ?? {};
  const paletteNames = Object.keys(palettes);
  if (paletteNames.length === 0) err('palettes', 'no palettes defined');
  for (const [name, colors] of Object.entries(palettes)) {
    const path = `palettes.${name}`;
    if (!Array.isArray(colors) || colors.length < 2 || colors.length > 8) {
      err(path, 'palette must hold 2–8 colors (ТЗ §4)');
      continue;
    }
    colors.forEach((hex, i) => {
      const rgba = parseHex(hex);
      if (!rgba) err(`${path}[${i}]`, `"${hex}" is not #rrggbb`);
    });
    // ТЗ requires light → dark; keep it a warning (a deliberate inversion is possible)
    // role slots are the first four (hlt/base/shd/outline); extras are free accents
    const lums = colors.slice(0, 4).map((hex) => luminance(parseHex(hex) ?? { r: 0, g: 0, b: 0, a: 255 }));
    for (let i = 1; i < lums.length; i++) {
      if (lums[i] > lums[i - 1] + 12) {
        warn(path, `colors are not ordered light→dark (${i-1}→${i} brightens by ${Math.round(lums[i] - lums[i - 1])})`);
        break;
      }
    }
  }

  // ---- layer_order / categories ----
  const order = (f.layer_order ?? []) as PixelCategory[];
  if (order.length === 0) err('layer_order', 'missing layer_order');
  const dupes = order.filter((c, i) => order.indexOf(c) !== i);
  if (dupes.length) err('layer_order', `duplicate categories: ${dupes.join(', ')}`);
  for (const c of order) {
    if (!PALETTE_CATEGORIES.includes(c)) err('layer_order', `unknown category "${c}"`);
  }
  for (const c of REQUIRED_CATEGORIES) {
    if (!order.includes(c)) err('layer_order', `required category "${c}" is not in layer_order`);
  }

  // ---- components ----
  const components = f.components ?? {};
  const ids = Object.keys(components);
  if (ids.length === 0) err('components', 'no components');

  const byCategory = new Map<PixelCategory, string[]>();
  let pixelCount = 0;

  for (const id of ids) {
    const comp = components[id];
    const path = `components.${id}`;
    if (!comp || typeof comp !== 'object') {
      err(path, 'component is not an object');
      continue;
    }
    if (!comp.category || !order.includes(comp.category)) err(`${path}.category`, `"${comp.category}" not in layer_order`);
    if (!comp.label) warn(`${path}.label`, 'missing label (vitrina/inspector will show the raw id)');

    // id convention: "<category>_<variant>"
    if (comp.category && !id.startsWith(`${comp.category}_`)) {
      warn(path, `id "${id}" does not follow "<category>_<variant>"`);
    }

    byCategory.set(comp.category, [...(byCategory.get(comp.category) ?? []), id]);

    if (comp.anchor && (!Number.isInteger(comp.anchor.x) || !Number.isInteger(comp.anchor.y))) {
      err(`${path}.anchor`, 'anchor must be integer offsets');
    }
    if (!Array.isArray(comp.pixels)) {
      err(`${path}.pixels`, 'pixels must be an array (use [] for *_none)');
      continue;
    }

    const isNone = /_(none|bald)$/.test(id);
    if (isNone && comp.pixels.length > 0) {
      err(`${path}.pixels`, `"${id}" looks like a none-variant but has ${comp.pixels.length} pixels`);
    }

    for (const [i, p] of comp.pixels.entries()) {
      pixelCount++;
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
        err(`${path}.pixels[${i}]`, 'x/y must be integers');
        continue;
      }
      const ax = (comp.anchor?.x ?? 0) + p.x;
      const ay = (comp.anchor?.y ?? 0) + p.y;
      if (ax < 0 || ay < 0 || ax >= W || ay >= H) {
        err(`${path}.pixels[${i}]`, `(${ax},${ay}) is outside the ${W}x${H} canvas after anchor`);
      }
      const color = resolveColor(p.c, palettes);
      if (!color) {
        err(`${path}.pixels[${i}].c`, `"${p.c}" unresolvable — ${PALETTE_ROLE_HINT}`);
      } else if (p.c.startsWith('#')) {
        const allowed = HEX_ALLOWED_CATEGORIES.includes(comp.category as PixelCategory);
        if (!allowed) {
          warn(`${path}.pixels[${i}].c`, `literal hex in "${comp.category}" breaks recoloring (allowed only in ${HEX_ALLOWED_CATEGORIES.join('/')})`);
        }
      }
    }

    // mirrors must stay inside the canvas too
    if (comp.mirror) {
      const axis = f.layout?.symmetry_axis_x ?? (W - 1) / 2;
      for (const [i, p] of comp.pixels.entries()) {
        const ax = (comp.anchor?.x ?? 0) + p.x;
        const mx = Math.round(2 * axis - ax);
        if (mx < 0 || mx >= W) {
          err(`${path}.pixels[${i}]`, `mirror lands on x=${mx}, outside the canvas`);
          break;
        }
      }
    }

    for (const [i, target] of (comp.excludes ?? []).entries()) {
      const path2 = `${path}.excludes[${i}]`;
      if (!order.includes(target)) err(path2, `excludes unknown category "${target}"`);
      if (target === comp.category) err(path2, 'a component cannot exclude its own category');
      const file2 = f as PixelArtFile;
      if (target !== comp.category && noneVariantOf(file2, target, config) === null) {
        err(path2, `category "${target}" has no *_none/*_bald variant to fall back to`);
      }
    }
  }

  // ---- every category in layer_order has at least one component ----
  for (const category of order) {
    const list = byCategory.get(category) ?? [];
    if (list.length === 0) err(`components.${category}`, `category "${category}" has no components`);
  }

  // ---- optional categories must offer a none-variant ----
  for (const category of OPTIONAL_CATEGORIES) {
    const list = byCategory.get(category) ?? [];
    const hasNone = list.some((id) => /_(none|bald)$/.test(id));
    if (!hasNone) err(`components.${category}`, `optional category "${category}" must provide a *_none variant (ТЗ §6)`);
  }

  // ---- fixed feature rows: eyes and mouth must not drift (ТЗ §5) ----
  if (f.layout) {
    for (const category of ['eyes', 'mouth'] as PixelCategory[]) {
      for (const id of byCategory.get(category) ?? []) {
        const comp = components[id];
        if (!comp?.pixels?.length) continue;
        const ys = comp.pixels.map((p) => (comp.anchor?.y ?? 0) + p.y);
        const top = Math.min(...ys);
        const expected = category === 'eyes' ? f.layout.eyes_y : f.layout.mouth_y;
        // eyes carry brows a couple of rows above the eye line, so only the
        // *lowest* painted row is a hard constraint (ТЗ §5 «общие y-координаты»)
        const bottom = Math.max(...ys);
        if (expected !== undefined && (bottom < expected - ROW_TOLERANCE || top > expected + ROW_TOLERANCE)) {
          err(`components.${id}`, `painted rows ${top}–${bottom} are off the ${category} line layout.${category === 'eyes' ? 'eyes_y' : 'mouth_y'}=${expected} — features would drift between variants`);
        }
      }
    }
  }

  // ---- excludes must not be mutual (docs §1.6) ----
  const excludedBy = new Map<PixelCategory, Set<PixelCategory>>();
  for (const id of ids) {
    const comp = components[id];
    for (const target of comp?.excludes ?? []) {
      if (!excludedBy.has(comp.category)) excludedBy.set(comp.category, new Set());
      excludedBy.get(comp.category)!.add(target);
    }
  }
  for (const [from, targets] of excludedBy) {
    for (const target of targets) {
      if (excludedBy.get(target)?.has(from)) {
        err('excludes', `mutual exclusion between "${from}" and "${target}" has no fixed point`);
      }
    }
  }

  // ---- generator_config cross-checks ----
  if (config) {
    for (const cat of config.categories) {
      if (!order.includes(cat.category)) err(`config.${cat.category}`, 'unknown category in generator_config');
      for (const v of cat.variants) {
        const comp = components[v];
        if (!comp) err(`config.${cat.category}.variants`, `"${v}" is not defined in components.json`);
        else if (comp.category !== cat.category) err(`config.${cat.category}.variants`, `"${v}" belongs to "${comp.category}"`);
      }
      if (cat.noneId && !cat.variants.includes(cat.noneId)) {
        warn(`config.${cat.category}.noneId`, 'noneId should be listed among variants');
      }
    }
    for (const scheme of config.colorSchemes) {
      for (const [name, colors] of Object.entries(scheme.palettes)) {
        if (!(name in palettes)) warn(`config.scheme.${scheme.id}`, `palette "${name}" does not exist in components.json`);
        colors.forEach((hex, i) => {
          if (!parseHex(hex)) err(`config.scheme.${scheme.id}.${name}[${i}]`, `"${hex}" is not #rrggbb`);
        });
      }
    }
  }

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    stats: { components: ids.length, categories: order.length, pixels: pixelCount, palettes: paletteNames.length },
  };
}

/** Per-composition validation before rendering (ТЗ §12, second block) */
export function validateComposition(
  file: PixelArtFile,
  combo: Record<string, string | null>,
  config?: PixelGeneratorConfig | null
): PixelIssue[] {
  const issues: PixelIssue[] = [];
  for (const category of categoryOrder(file)) {
    const id = combo[category];
    if (!id) {
      const required = REQUIRED_CATEGORIES.includes(category);
      if (required) issues.push({ level: 'error', path: `combo.${category}`, message: 'required category has no component' });
      continue;
    }
    const comp = file.components[id];
    if (!comp) {
      issues.push({ level: 'error', path: `combo.${category}`, message: `"${id}" is not defined` });
      continue;
    }
    if (comp.category !== category) {
      issues.push({ level: 'error', path: `combo.${category}`, message: `"${id}" belongs to "${comp.category}"` });
    }
    // conflict check: an exclusion source is selected but the target is not emptied
    for (const target of comp.excludes ?? []) {
      const chosenInTarget = combo[target];
      if (!chosenInTarget) continue;
      const none = noneVariantOf(file, target, config);
      if (chosenInTarget !== none) {
        issues.push({
          level: 'error',
          path: `combo.${target}`,
          message: `"${chosenInTarget}" must be "${none}" because "${id}" excludes "${target}"`,
        });
      }
    }
  }
  return issues;
}

export const PALETTE_CATEGORIES: PixelCategory[] = ['face', 'eyes', 'mouth', 'hair', 'hat', 'clothing', 'accessory'];
export const REQUIRED_CATEGORIES: PixelCategory[] = ['face', 'eyes', 'mouth', 'hair', 'clothing'];
export const OPTIONAL_CATEGORIES: PixelCategory[] = ['hat', 'accessory'];
/** rows may be a couple of pixels off from the nominal feature line (eyebrows!) */
export const ROW_TOLERANCE = 4;

function emptyStats() {
  return { components: 0, categories: 0, pixels: 0, palettes: 0 };
}
