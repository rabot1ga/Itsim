import {
  GeneticTraits,
  PixelArtFile,
  PixelCategory,
  PixelColorScheme,
  PixelComponent,
  PixelComposition,
  PixelDef,
  PixelGeneratorConfig,
  PixelManifest,
  PixelManifestEntry,
  PaletteRole,
} from '../types';
import { seededRng } from './genetics';

/**
 * Pixel-art avatar engine — docs/pixel-art.md (ТЗ «Процедурная генерация
 * пиксельных персонажей»), реализация этапов 1–4.
 *
 * The AI never draws images: it emits pixel *descriptions* (offset + palette
 * link), this module turns them into RGBA. Everything that must be identical
 * in the CLI generator and in the browser lives here — one renderer, not two.
 */

export const PIXEL_ART_FORMAT = 1;
/** Palettes that may carry literal hex colors (metal, glass, lenses) */
export const HEX_ALLOWED_CATEGORIES: PixelCategory[] = ['hat', 'accessory'];

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const EMPTY_PIXEL: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseHex(hex: string): Rgba | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

export function toHex(c: Rgba): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Perceptual-ish luminance, used for role resolution and auto-sort warnings */
export function luminance(c: Rgba): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Derive the missing tail of a palette from `base` (docs/pixel-art.md §1.4):
 * when a recolor scheme provides fewer colors than a component references,
 * we synthesize highlight/shade/outline instead of picking something random.
 */
export function derivePalette(colors: string[]): string[] {
  const out = [...colors];
  const base = parseHex(out[1] ?? out[0] ?? '#808080') ?? { r: 128, g: 128, b: 128, a: 255 };
  const lighten = (k: number): string =>
    toHex({ r: base.r + (255 - base.r) * k, g: base.g + (255 - base.g) * k, b: base.b + (255 - base.b) * k, a: 255 });
  const darken = (k: number): string => toHex({ r: base.r * (1 - k), g: base.g * (1 - k), b: base.b * (1 - k), a: 255 });

  if (out.length === 0) out.push(lighten(0.5), '#808080', darken(0.35), darken(0.6));
  if (out.length === 1) out.push(out[0], darken(0.35), darken(0.6));
  if (out.length === 2) out.push(darken(0.35));
  if (out.length === 3) out.push(darken(0.6));
  return out;
}

const ROLE_INDEX: Record<PaletteRole, number> = { hlt: 0, base: 1, shd: 2, outline: 3 };

/**
 * Resolve a pixel color reference.
 *   "hair#2"    → palette index
 *   "hair#base" → palette role (robust to palette length)
 *   "#ff00aa"   → literal (hat/accessory only, see validator)
 */
export function resolveColor(ref: string, palettes: Record<string, string[]>): Rgba | null {
  if (ref.startsWith('#')) return parseHex(ref);
  const [name, idxRaw] = ref.split('#');
  if (!name || idxRaw === undefined) return null;
  const palette = palettes[name];
  if (!palette || palette.length === 0) return null;

  const numeric = Number(idxRaw);
  let index: number;
  if (Number.isInteger(numeric)) {
    index = numeric;
    if (index >= palette.length) {
      // Palette shorter than the reference: derive the standard 4-step tail so a
      // 2-colour recolor still fills hlt/base/shd/outline instead of dropping pixels.
      const derived = derivePalette(palette);
      if (index >= derived.length) return null; // nonsense index: refuse, don't paint black
      return parseHex(derived[index]);
    }
  } else {
    const role = idxRaw as PaletteRole;
    if (role in ROLE_INDEX) {
      index = ROLE_INDEX[role];
      if (index >= palette.length) {
        // role fallback: nearest by luminance among available colors
        const wanted = [250, 170, 90, 30][ROLE_INDEX[role]];
        let best = 0;
        let bestDiff = Infinity;
        palette.forEach((hex, i) => {
          const lum = luminance(parseHex(hex) ?? EMPTY_PIXEL);
          const diff = Math.abs(lum - wanted);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = i;
          }
        });
        return parseHex(palette[best]);
      }
    } else {
      return null;
    }
  }
  return parseHex(palette[index]);
}

/** HSL-реколор (Этап 5 из ТЗ: «реколор через HSL-сдвиг вместо фиксированных палитр») */
export function hslShift(colors: string[], hueDeg: number, satMult = 1, lightAdd = 0): string[] {
  return colors.map((hex) => {
    const c = parseHex(hex) ?? EMPTY_PIXEL;
    const { h, s, l } = rgbToHsl(c);
    const next = hslToRgb((h + hueDeg / 360 + 1) % 1, Math.min(1, s * satMult), Math.max(0, Math.min(1, l + lightAdd / 100)));
    return toHex(next);
  });
}

function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgba {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: 255 };
}

// ---------------------------------------------------------------------------
// Palettes: scheme override
// ---------------------------------------------------------------------------

/**
 * Merge a color scheme onto the base palettes (ТЗ §4 «замена массива палитры
 * целиком меняет внешность»). Unspecified palettes keep their base colors.
 */
export function effectivePalettes(
  file: PixelArtFile,
  scheme?: PixelColorScheme | null,
  opts: { derive?: boolean } = {}
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, colors] of Object.entries(file.palettes)) out[name] = [...colors];
  if (scheme) {
    for (const [name, colors] of Object.entries(scheme.palettes)) {
      if (colors && colors.length > 0) out[name] = [...colors];
    }
  }
  if (opts.derive !== false) {
    for (const name of Object.keys(out)) out[name] = derivePalette(out[name]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authored rows → pixels
// ---------------------------------------------------------------------------

/**
 * Expand a component's local palette list. An entry may be
 *   • a color ref ("hair#1", "#rrggbb") — used as-is;
 *   • a bare palette name ("hair") — expands to that palette's colors, so the
 *     authored rows keep the ТЗ's "0=highlight … 3=outline" indexing without
 *     the model enumerating hex refs by hand.
 */
export function expandRowPalettes(palettes: string[], filePalettes: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const entry of palettes) {
    if (entry.includes('#')) {
      out.push(entry);
      continue;
    }
    const named = filePalettes[entry];
    if (!named || named.length === 0) throw new Error(`palette "${entry}" is not defined in components.json`);
    named.forEach((_, i) => out.push(`${entry}#${i}`));
  }
  return out;
}

/**
 * Compile a component's `rows` shorthand into explicit `pixels`.
 * Token grammar: '.' = empty, digit N = palettes[N], '#rrggbb' = literal.
 * Rows are y-offsets from the anchor; tokens are x-offsets from the anchor.
 */
/** Reserved authored-only tokens for the few colours that must not recolour */
export const RESERVED_ROW_TOKENS: Record<string, string> = {
  w: '#ffffff', // sclera / teeth
  k: '#101014', // pupil
  l: '#39506b', // lens glass
  m: '#9aa4b2', // metal frame
  r: '#ff5d5d', // bloodshot
  e: '#c23b3b', // bloodshot, dark
  t: '#c0392b', // tie
  d: '#d9b64a', // medal gold
};

export function compileRows(rows: string[], palettes: string[]): PixelDef[] {
  const out: PixelDef[] = [];
  rows.forEach((row, y) => {
    let tokens = row.trim().split(/\s+/).filter((t) => t.length > 0);
    // authored-only "@N" prefix: the first token sits at x-offset N (keeps rows short)
    let xOffset = 0;
    if (tokens.length > 0 && /^@\d+$/.test(tokens[0])) {
      xOffset = Number(tokens[0].slice(1));
      tokens = tokens.slice(1);
    }
    tokens.forEach((tok, i) => {
      const x = i + xOffset;
      if (tok === '.') return;
      if (tok.startsWith('#')) {
        out.push({ x, y, c: tok });
        return;
      }
      if (tok.length === 1 && RESERVED_ROW_TOKENS[tok]) {
        out.push({ x, y, c: RESERVED_ROW_TOKENS[tok] });
        return;
      }
      const idx = Number(tok);
      if (!Number.isInteger(idx) || idx < 0 || idx >= palettes.length) {
        throw new Error(`row token "${tok}" is out of range for ${palettes.length} palettes (y=${y}, x=${x})`);
      }
      out.push({ x, y, c: palettes[idx] });
    });
  });
  return out;
}

/** Expand every authored component and drop the `rows` shorthand (canonical file). */
export function compilePixelArtFile(file: PixelArtFile, source: { components: Record<string, Partial<PixelComponent> & { rows?: string[]; palettes?: string[] }> }): PixelArtFile {
  const components: Record<string, PixelComponent> = {};
  for (const [id, raw] of Object.entries(source.components)) {
    const { rows, palettes: localPalettes, ...rest } = raw as PixelComponent & { rows?: string[]; palettes?: string[] };
    const base = rest as PixelComponent;
    if (rows && rows.length > 0) {
      if (!localPalettes || localPalettes.length === 0) {
        throw new Error(`component "${id}" uses rows but has no "palettes" list`);
      }
      base.pixels = compileRows(rows, expandRowPalettes(localPalettes, file.palettes ?? {}));
    }
    if (!Array.isArray(base.pixels)) base.pixels = [];
    components[id] = base;
  }
  return { ...file, components };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export interface RenderBuffer {
  width: number;
  height: number;
  /** RGBA, row-major, length = width*height*4 */
  data: Uint8ClampedArray;
}

export interface RenderOptions {
  scheme?: PixelColorScheme | null;
  /** skip categories not present in the composition (default: draw everything given) */
  only?: PixelCategory[];
}

/**
 * ТЗ §8 — the whole render pipeline, minus file IO.
 * Deterministic and side-effect free: the same inputs always give the same bytes.
 */
export function renderPixelArt(file: PixelArtFile, composition: PixelComposition, opts: RenderOptions = {}): RenderBuffer {
  const { width, height } = file.canvas;
  const data = new Uint8ClampedArray(width * height * 4);
  const palettes = effectivePalettes(file, opts.scheme);
  const axis = file.layout?.symmetry_axis_x ?? (width - 1) / 2;

  const put = (x: number, y: number, color: Rgba) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return; // canvas edges may be crossed by mirrored parts
    const i = (y * width + x) * 4;
    data[i] = color.r;
    data[i + 1] = color.g;
    data[i + 2] = color.b;
    data[i + 3] = color.a;
  };

  for (const category of file.layer_order) {
    if (opts.only && !opts.only.includes(category)) continue;
    const id = composition[category];
    if (!id) continue;
    const comp = file.components[id];
    if (!comp || comp.pixels.length === 0) continue; // *_none lives here

    for (const p of comp.pixels) {
      const color = resolveColor(p.c, palettes);
      if (!color) continue;
      const x = comp.anchor.x + p.x;
      const y = comp.anchor.y + p.y;
      put(x, y, color);
      if (comp.mirror) {
        // docs/pixel-art.md: reflection of a coordinate c is round(2·axis − c)
        const mx = Math.round(2 * axis - x);
        if (mx !== x) put(mx, y, color);
      }
    }
  }

  return { width, height, data };
}

/** Nearest-neighbor upscale (the only allowed scaling — ТЗ §8 п.5) */
export function scaleNearest(src: RenderBuffer, factor: number): RenderBuffer {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return src;
  const out = new Uint8ClampedArray(src.width * f * src.height * f * 4);
  for (let y = 0; y < src.height * f; y++) {
    for (let x = 0; x < src.width * f; x++) {
      const si = (Math.floor(y / f) * src.width + Math.floor(x / f)) * 4;
      const di = (y * src.width * f + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: src.width * f, height: src.height * f, data: out };
}

/** Compose a spritesheet out of rendered tiles (ТЗ §10) */
export function composeSheet(tiles: RenderBuffer[], columns: number, cellPadding = 0, background: Rgba | null = null): RenderBuffer {
  if (tiles.length === 0) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  const cellW = tiles[0].width + cellPadding * 2;
  const cellH = tiles[0].height + cellPadding * 2;
  const rows = Math.ceil(tiles.length / columns);
  const width = cellW * columns;
  const height = cellH * rows;
  const data = new Uint8ClampedArray(width * height * 4);
  if (background) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = background.r;
      data[i + 1] = background.g;
      data[i + 2] = background.b;
      data[i + 3] = background.a;
    }
  }
  tiles.forEach((tile, n) => {
    const col = n % columns;
    const row = Math.floor(n / columns);
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const si = (y * tile.width + x) * 4;
        if (tile.data[si + 3] === 0) continue;
        const di = ((row * cellH + cellPadding + y) * width + col * cellW + cellPadding + x) * 4;
        data[di] = tile.data[si];
        data[di + 1] = tile.data[si + 1];
        data[di + 2] = tile.data[si + 2];
        data[di + 3] = tile.data[si + 3];
      }
    }
  });
  return { width, height, data };
}

// ---------------------------------------------------------------------------
// Combinations: uniqueness + seed reproducibility
// ---------------------------------------------------------------------------

/** Categories in the order the engine resolves them */
export function categoryOrder(file: PixelArtFile): PixelCategory[] {
  return [...file.layer_order];
}

/** `*_none` / `*_bald` fallback id for a category (docs §1.3, §1.6) */
export function noneVariantOf(file: PixelArtFile, category: PixelCategory, config?: PixelGeneratorConfig | null): string | null {
  const fromConfig = config?.categories.find((c) => c.category === category)?.noneId;
  if (fromConfig) return fromConfig;
  const candidate = Object.keys(file.components).find(
    (id) => file.components[id].category === category && /_(none|bald)$/.test(id)
  );
  return candidate ?? null;
}

/**
 * Apply the excludes rule (ТЗ §7): every chosen component with `excludes`
 * force-sets the target category to its none/bald variant.
 */
export function resolveExcludes(
  file: PixelArtFile,
  chosen: PixelComposition,
  config?: PixelGeneratorConfig | null
): { combo: PixelComposition; applied: Array<{ by: string; category: PixelCategory; to: string | null }> } {
  const combo: PixelComposition = { ...chosen };
  const applied: Array<{ by: string; category: PixelCategory; to: string | null }> = [];

  // Deterministic resolution: walk categories in layer order, once each
  for (const category of categoryOrder(file)) {
    const id = combo[category];
    if (!id) continue;
    const comp = file.components[id];
    if (!comp?.excludes?.length) continue;
    for (const target of comp.excludes) {
      const none = noneVariantOf(file, target, config);
      combo[target] = none ?? null;
      applied.push({ by: id, category: target, to: none ?? null });
    }
  }
  return { combo, applied };
}

/** Unique key of a character: category-ordered ids + scheme (docs §1.7) */
export function comboKey(file: PixelArtFile, combo: PixelComposition, schemeId: string): string {
  const parts = categoryOrder(file).map((c) => `${c}:${combo[c] ?? '-'}`);
  return `${parts.join('|')}#${schemeId}`;
}

export interface CombinationResult {
  combo: PixelComposition;
  applied: Array<{ by: string; category: PixelCategory; to: string | null }>;
  scheme: PixelColorScheme;
  seed: string;
  key: string;
}

/**
 * Enumerated party (docs §1.7): a bijection from `index` to the cartesian
 * product of allowed variants × color schemes. No collisions by construction.
 */
export function combinationAt(
  file: PixelArtFile,
  config: PixelGeneratorConfig,
  index: number
): CombinationResult | null {
  const cats = categoryOrder(file)
    .map((category) => config.categories.find((c) => c.category === category))
    .filter((c): c is NonNullable<typeof c> => !!c && c.variants.length > 0);
  if (cats.length === 0) return null;

  const schemes = config.colorSchemes.length ? config.colorSchemes : [{ id: 'base', palettes: {} }];
  const sizes = cats.map((c) => c.variants.length);
  const geoCount = sizes.reduce((a, b) => a * b, 1);
  const total = geoCount * schemes.length;
  if (total <= 0) return null;

  const flat = ((index % total) + total) % total;
  const scheme = schemes[Math.floor(flat / geoCount)];
  let rest = flat % geoCount;

  const chosen: PixelComposition = {};
  cats.forEach((c, i) => {
    const size = sizes[i];
    const pick = rest % size;
    rest = Math.floor(rest / size);
    chosen[c.category] = c.variants[pick];
  });

  const { combo, applied } = resolveExcludes(file, chosen, config);
  return {
    combo,
    applied,
    scheme,
    seed: `enumerate:${flat}`,
    key: comboKey(file, combo, scheme.id),
  };
}

export function combinationSpaceSize(file: PixelArtFile, config: PixelGeneratorConfig): number {
  const cats = categoryOrder(file)
    .map((category) => config.categories.find((c) => c.category === category))
    .filter((c): c is NonNullable<typeof c> => !!c && c.variants.length > 0);
  const schemes = Math.max(1, config.colorSchemes.length);
  return cats.reduce((acc, c) => acc * c.variants.length, 1) * schemes;
}

/**
 * Seeded draw — the *same* code path the game uses for a player's genotype
 * (docs §1.5): per-category salted weighted pick + palette salt.
 */
export function combinationFromSeed(
  file: PixelArtFile,
  config: PixelGeneratorConfig,
  seed: string
): CombinationResult {
  const rng = seededRng(seed);
  const chosen: PixelComposition = {};

  for (const category of categoryOrder(file)) {
    const cfg = config.categories.find((c) => c.category === category);
    const variants = cfg?.variants?.length ? cfg.variants : [];
    if (variants.length === 0) continue;
    const weights = variants.map((id) => Math.max(1, cfg?.weights?.[id] ?? 100));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    let picked = variants[variants.length - 1];
    for (let i = 0; i < variants.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        picked = variants[i];
        break;
      }
    }
    chosen[category] = picked;
  }

  const { combo, applied } = resolveExcludes(file, chosen, config);
  const schemes = config.colorSchemes.length ? config.colorSchemes : [{ id: 'base', palettes: {} }];
  const scheme = schemes[Math.floor(seededRng(`${seed}:palette`)() * schemes.length) % schemes.length];

  return { combo, applied, scheme, seed, key: comboKey(file, combo, scheme.id) };
}

/**
 * Reproducibility check (ТЗ §11): seed + components.json + generator_config.json
 * must rebuild the exact same combination.
 */
export function isReproducible(
  file: PixelArtFile,
  config: PixelGeneratorConfig,
  entry: Pick<PixelManifestEntry, 'seed' | 'scheme' | 'combo'>
): boolean {
  const rebuilt = combinationFromSeed(file, config, entry.seed);
  const a = categoryOrder(file).map((c) => `${c}:${rebuilt.combo[c] ?? '-'}`).join(',');
  const b = categoryOrder(file).map((c) => `${c}:${entry.combo[c] ?? '-'}`).join(',');
  return a === b && rebuilt.scheme.id === entry.scheme;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function buildManifest(
  file: PixelArtFile,
  combos: CombinationResult[],
  checksums: { components: string; generatorConfig?: string },
  opts: { generatedAt?: string; canvas?: { width: number; height: number }; seedKind?: 'draw' | 'enumerate' } = {}
): PixelManifest {
  const seedKind = opts.seedKind ?? 'draw';
  const entries: PixelManifestEntry[] = combos.map((c, i) => ({
    id: `char-${String(i + 1).padStart(4, '0')}`,
    file: `char-${String(i + 1).padStart(4, '0')}.png`,
    seed: c.seed,
    seedKind,
    scheme: c.scheme.id,
    combo: Object.fromEntries(categoryOrder(file).map((cat) => [cat, c.combo[cat] ?? null])),
    palettes: effectivePalettes(file, c.scheme),
    tags: [c.scheme.id, ...categoryOrder(file).flatMap((cat) => file.components[(c.combo[cat] ?? '') as string]?.tags ?? [])],
  }));

  return {
    format: PIXEL_ART_FORMAT,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    checksums,
    canvas: opts.canvas ?? file.canvas,
    count: entries.length,
    entries,
  };
}

/** Unique tags of every component in a combo (for the vitrina search) */
export function comboTags(file: PixelArtFile, combo: PixelComposition): string[] {
  const set = new Set<string>();
  for (const category of categoryOrder(file)) {
    const id = combo[category];
    if (!id) continue;
    for (const t of file.components[id]?.tags ?? []) set.add(t);
    set.add(category);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// In-game look: derive a character from the player's genotype
// ---------------------------------------------------------------------------

/**
 * Genetic trait id → pixel component id. The genotype vocabulary is wider than
 * the MVP component set (10 hairstyles vs 6 hair components), so this maps
 * several traits onto one sprite instead of inventing new components.
 * Keeping it here (not in the client) means the CLI and the game agree.
 */
export const TRAIT_COMPONENT_MAP: Record<string, Record<string, string>> = {
  hair: {
    hair_buzzcut: 'hair_buzz',
    hair_short: 'hair_short',
    hair_messy: 'hair_curly',
    hair_spiky: 'hair_curly',
    hair_undercut: 'hair_short',
    hair_long: 'hair_long',
    hair_ponytail: 'hair_manbun',
    hair_manbun: 'hair_manbun',
    hair_curly: 'hair_curly',
    hair_bald: 'hair_bald',
  },
  eyes: {
    eye_normal: 'eyes_normal',
    eye_tired: 'eyes_tired',
    eye_closed: 'eyes_closed',
    eye_vr: 'eyes_closed',
    eye_red: 'eyes_red',
    eye_legendary: 'eyes_wide',
  },
  top: {
    top_hoodie: 'clothing_hoodie',
    top_tshirt: 'clothing_tshirt',
    top_shirt: 'clothing_shirt',
    top_corporate: 'clothing_shirt',
    top_none: 'clothing_none',
  },
  accessory: {
    acc_glasses: 'accessory_glasses',
    acc_headphones: 'accessory_headphones',
    acc_none: 'accessory_none',
  },
};

/** A candidate id is only used if the content actually ships it */
function usable(config: PixelGeneratorConfig, category: string, id: string | undefined): string | null {
  if (!id) return null;
  const cat = config.categories.find((c) => c.category === category);
  return cat?.variants.includes(id) ? id : null;
}

/**
 * One character per genotype: the pixel avatar and the layered SVG avatar are
 * two renderings of the same genes, so the seed stays the reproducibility key.
 * Categories the genotype has no opinion about fall back to the seeded draw.
 */
export function buildPixelComposition(
  config: PixelGeneratorConfig,
  traits: GeneticTraits,
  opts: { schemeId?: string } = {}
): { combo: PixelComposition; schemeId: string } {
  const pick = (mapKey: string, category: string, traitId: string | undefined): string | null => {
    const mapped = usable(config, category, TRAIT_COMPONENT_MAP[mapKey]?.[traitId ?? ''] ?? undefined);
    if (mapped) return mapped;
    // content ships fewer variants than the genotype vocabulary: a category with
    // exactly one variant has no wrong answer, so keep the trait look
    const variants = config.categories.find((c) => c.category === category)?.variants ?? [];
    return variants.length === 1 ? variants[0] : null;
  };
  const combo: PixelComposition = {
    eyes: pick('eyes', 'eyes', traits.eyeShape),
    hair: pick('hair', 'hair', traits.hairStyle),
    // the genotype slot names and the pixel categories are not the same vocabulary
    clothing: pick('top', 'clothing', traits.top),
    accessory: pick('accessory', 'accessory', traits.accessory),
  };
  const schemeId = opts.schemeId ?? pickSchemeId(config, traits);
  return { combo, schemeId };
}

export function pickSchemeId(config: PixelGeneratorConfig, traits: GeneticTraits): string {
  const hit = config.colorSchemes.find((s) => {
    const m = s.match;
    if (!m) return false;
    if (m.hairColor?.includes(traits.hairColor)) return true;
    if (m.skinTone?.includes(traits.skinTone)) return true;
    return false;
  });
  return hit?.id ?? 'base';
}
