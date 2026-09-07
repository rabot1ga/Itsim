/**
 * pixelgen — pixel-art avatar pipeline CLI (docs/pixel-art.md, ТЗ этапы 1–4)
 *
 *   compile   authored rows → canonical components.json (+ generator_config.json)
 *   validate  schema + structural + per-composition checks
 *   generate  combinations (enumerate | seeded) → PNGs + manifest.json
 *   render    one composition → PNG + ASCII preview
 *   repro     re-render from manifest and diff the pixels (determinism gate)
 *   prompt    emit the AI master-prompt for a category
 *   audit     CI mode: everything must validate and compile to committed bytes
 *
 * No image library: PNG is encoded/decoded right here (tools/pixelgen/src/png.ts)
 * so the generator can read back its own output.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import {
  type PixelArtFile,
  type PixelColorScheme,
  PixelGeneratorConfig,
  compilePixelArtFile,
  renderPixelArt,
  scaleNearest,
  composeSheet,
  combinationAt,
  combinationFromSeed,
  combinationSpaceSize,
  categoryOrder,
  validatePixelArtFile,
  validateComposition,
  buildManifest,
  comboTags,
  effectivePalettes,
  resolveExcludes,
  PixelIssue,
} from '../../../packages/shared/src/engine/pixelArtBundle';
import { PixelArtFileSchema, PixelArtSourceFileSchema, PixelGeneratorConfigSchema } from '../../../packages/shared/src/schemas/index';
import { asciiPreview, decodePng, encodePng, RawImage } from './png';

const ROOT = process.cwd();
const CONTENT = process.env.PIXEL_CONTENT_DIR ?? join(ROOT, 'packages', 'content', 'pixel');
const OUT_DIR = process.env.PIXEL_OUT_DIR ?? join(ROOT, 'artifacts', 'pixel');

const SOURCE_FILE = 'components.source.json';
const CANON_FILE = 'components.json';
const CONFIG_FILE = 'generator_config.json';
const MANIFEST_FILE = 'manifest.json';

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // `npm run pixelgen:x -- <args>` passes a bare separator
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const value = argv[i + 1];
        if (value === 'true' || value === 'false') flags[a.slice(2)] = value === 'true';
        else flags[a.slice(2)] = value;
        i++;
      } else flags[a.slice(2)] = true;
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

const num = (flags: Args['flags'], key: string, fallback: number): number =>
  flags[key] === undefined ? fallback : Number(flags[key]);
const str = (flags: Args['flags'], key: string, fallback?: string): string | undefined =>
  flags[key] === undefined ? fallback : String(flags[key]);
const bool = (flags: Args['flags'], key: string): boolean => flags[key] === true;

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Idempotent write: keeps `git diff` clean, and --audit turns a diff into a failure */
function writeIfChanged(path: string, content: Buffer | string): 'written' | 'unchanged' {
  mkdirSync(dirname(path), { recursive: true });
  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  if (existsSync(path)) {
    const old = readFileSync(path);
    if (old.equals(buf)) return 'unchanged';
  }
  writeFileSync(path, buf);
  return 'written';
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '.' : path.slice(0, i);
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`missing file: ${relative(ROOT, path)}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`${relative(ROOT, path)}: ${(e as Error).message}`);
  }
}

function report(issues: PixelIssue[], label: string): boolean {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  for (const i of issues) {
    process.stdout.write(`${i.level === 'error' ? '✗' : '!'} ${label}${i.path ? ` ${i.path}` : ''}: ${i.message}\n`);
  }
  if (issues.length === 0) process.stdout.write(`✓ ${label}: no issues\n`);
  else process.stdout.write(`  ${label}: ${errors.length} error(s), ${warns.length} warning(s)\n`);
  return errors.length === 0;
}

function loadCanonical(opts: { allowSource?: boolean } = {}): { file: PixelArtFile; config: PixelGeneratorConfig | null } {
  const canonicalPath = join(CONTENT, CANON_FILE);
  const sourcePath = join(CONTENT, SOURCE_FILE);
  let file: PixelArtFile;
  if (existsSync(canonicalPath)) {
    file = readJson<PixelArtFile>(canonicalPath);
  } else if (opts.allowSource && existsSync(sourcePath)) {
    process.stdout.write('! components.json is missing — compiling from source in memory\n');
    file = compile(readJson(sourcePath));
  } else {
    throw new Error(`no pixel content found in ${relative(ROOT, CONTENT)} — run: npm run pixelgen:compile`);
  }
  const configPath = join(CONTENT, CONFIG_FILE);
  const config = existsSync(configPath) ? readJson<PixelGeneratorConfig>(configPath) : null;
  return { file, config };
}

/** Compile + pin the source checksum; shared by `compile` and `audit` so they can never disagree. */
function compileSourceFile(sourcePath: string): { file: PixelArtFile; json: string } {
  const bytes = readFileSync(sourcePath);
  const file = compile(JSON.parse(bytes.toString('utf8')) as any);
  file.sourceChecksum = sha256(bytes); // drift guard: which source produced this canon
  return { file, json: `${JSON.stringify(file, null, 2)}\n` };
}

function compile(source: any): PixelArtFile {
  const parsed = PixelArtSourceFileSchema.parse(source);
  const built = compilePixelArtFile(parsed as unknown as PixelArtFile, { components: parsed.components as any });
  // strip authored-only shorthand so the canonical file is renderer-ready
  const components: Record<string, unknown> = {};
  for (const [id, comp] of Object.entries(built.components)) {
    const { rows, palettes, ...rest } = comp as unknown as Record<string, unknown>;
    void rows;
    void palettes;
    components[id] = rest;
  }
  return { ...(built as unknown as PixelArtFile), components } as PixelArtFile;
}

/**
 * Keep generator_config in sync with the components that actually exist:
 * `pixelgen import` may add a component, and a variant nobody lists is a
 * variant nobody ever sees. Order and weights are preserved; unknown ids are
 * dropped and new ones appended (so weights stay meaningful for the old ones).
 */
function reconcileConfig(config: PixelGeneratorConfig, file: PixelArtFile): PixelGeneratorConfig {
  const shipped = new Set(Object.keys(file.components).filter((id) => !file.components[id].extended));
  for (const category of categoryOrder(file)) {
    const entry = config.categories.find((c) => c.category === category);
    const available = [...shipped].filter((id) => file.components[id].category === category);
    if (!entry) {
      config.categories.push({ category, required: true, variants: available });
      continue;
    }
    const kept = entry.variants.filter((id) => shipped.has(id) && file.components[id]?.category === category);
    const added = available.filter((id) => !kept.includes(id));
    entry.variants = [...kept, ...added];
    if (added.length) process.stdout.write(`! ${CONFIG_FILE}: +${added.length} variant(s) in ${category} (${added.join(', ')})\n`);
    const removed = entry.variants.filter((id) => !available.includes(id));
    if (removed.length) process.stdout.write(`! ${CONFIG_FILE}: −${removed.length} stale variant(s) in ${category} (${removed.join(', ')})\n`);
    if (entry.weights) entry.weights = Object.fromEntries(Object.entries(entry.weights).filter(([id]) => entry.variants.includes(id)));
    if (entry.noneId && !entry.variants.includes(entry.noneId)) delete entry.noneId;
  }
  return config;
}

function defaultConfig(file: PixelArtFile): PixelGeneratorConfig {
  const categories = categoryOrder(file).map((category) => {
    const variants = Object.keys(file.components).filter((id) => file.components[id].category === category && !file.components[id].extended);
    const noneId = variants.find((id) => /_(none|bald)$/.test(id));
    const required = ['face', 'eyes', 'mouth', 'hair', 'clothing'].includes(category);
    return {
      category,
      required,
      ...(noneId ? { noneId } : {}),
      variants,
      weights: Object.fromEntries(
        variants.map((id) => [id, category === 'hat' && /_none$/.test(id) ? 25 : category === 'accessory' && /_none$/.test(id) ? 30 : 100])
      ),
    };
  });
  const baseSchemes: PixelColorScheme[] = Object.entries(file.palettes).length
    ? [
        { id: 'base', name: 'Базовая палитра', palettes: {} },
        {
          id: 'nocturne',
          name: 'Ноктюрн',
          match: { hairColor: ['hair_black', 'hair_blue'], skinTone: ['skin_dark', 'skin_brown'] },
          palettes: {
            skin: ['#c9a88a', '#a8846a', '#7d5b46', '#3a2619'],
            hair: ['#8f9bb3', '#4c5a75', '#2f3a4e', '#141a26'],
            eyes: ['#bfe9ff', '#48b7d8', '#1f5f78', '#0a1a22'],
            cloth: ['#7f8ca6', '#3f4a63', '#2a3245', '#10151f'],
            hat: ['#9e6f8a', '#5f3f57', '#3d2637', '#180f16'],
            accessory: ['#c9d1dd', '#7b8797', '#4a5462', '#1b202a'],
            mouth: ['#c98d8d', '#96544f', '#5f2f2f', '#28110f'],
          },
        },
        {
          id: 'neon',
          name: 'Неон',
          match: { hairColor: ['hair_blue', 'hair_red'] },
          palettes: {
            skin: ['#ffe2c4', '#f0b48a', '#b9764f', '#4d2a16'],
            hair: ['#9dffb4', '#2fd97a', '#149a56', '#05301d'],
            eyes: ['#ffe98a', '#ff9d2f', '#b35c00', '#3a1d00'],
            cloth: ['#d0a8ff', '#8a4fd8', '#5a2c96', '#20093c'],
            hat: ['#ff9ecb', '#ff3d8b', '#b31463', '#3d0320'],
            accessory: ['#a8f0ff', '#33cfe8', '#128ba0', '#04262e'],
            mouth: ['#ffb3d9', '#d94f8a', '#8a2050', '#2e0a1a'],
          },
        },
        {
          id: 'paper',
          name: 'Крафт',
          match: { skinTone: ['skin_pale'], hairColor: ['hair_gray', 'hair_blond'] },
          palettes: {
            skin: ['#f2e2c8', '#dcc39a', '#b3946a', '#5c452c'],
            hair: ['#d9c39a', '#a3814f', '#6f5430', '#2c1f10'],
            eyes: ['#e8e2d2', '#7d7a6a', '#4a4638', '#1f1c16'],
            cloth: ['#efe6d4', '#c2b191', '#8f7d5f', '#3f3323'],
            hat: ['#e3d3b8', '#b09265', '#7c6039', '#31230f'],
            accessory: ['#e8e0cf', '#a89b83', '#6f6350', '#2b241a'],
            mouth: ['#e0c3a8', '#a87c5c', '#6f4a30', '#2b190f'],
          },
        },
      ]
    : [{ id: 'base', palettes: {} }];
  return { format: 1, categories, colorSchemes: baseSchemes };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdCompile(args: Args): number {
  const sourcePath = join(CONTENT, SOURCE_FILE);
  const { file, json } = compileSourceFile(sourcePath);
  const status = writeIfChanged(join(CONTENT, CANON_FILE), json);
  process.stdout.write(`✓ ${CANON_FILE} ${status} (${Object.keys(file.components).length} components, ${file.canvas.width}x${file.canvas.height})\n`);

  const configPath = join(CONTENT, CONFIG_FILE);
  const config = existsSync(configPath)
    ? reconcileConfig(readJson<PixelGeneratorConfig>(configPath), file)
    : defaultConfig(file);
  const configJson = `${JSON.stringify(config, null, 2)}\n`;
  const cstatus = writeIfChanged(configPath, configJson);
  process.stdout.write(`✓ ${CONFIG_FILE} ${cstatus} (${config.categories.length} categories, ${config.colorSchemes.length} schemes)\n`);

  const validation = validatePixelArtFile(file, config);
  return report(validation.issues, 'compile') ? 0 : 1;
}

function cmdValidate(args: Args): number {
  const { file, config } = loadCanonical({ allowSource: true });
  const sourcePath = join(CONTENT, SOURCE_FILE);
  if (existsSync(sourcePath)) {
    const expected = sha256(readFileSync(sourcePath));
    if (file.sourceChecksum && file.sourceChecksum !== expected) {
      process.stdout.write(`✗ components.json was compiled from a different source\n  source  ${expected.slice(0, 16)}\n  canon   ${file.sourceChecksum.slice(0, 16)}\n  → run: npm run pixelgen:compile\n`);
      return 1;
    }
    if (!file.sourceChecksum) {
      process.stdout.write(`! components.json has no sourceChecksum — recompile to pin it\n`);
    }
  }
  const validation = validatePixelArtFile(file, config);
  const okFile = report(validation.issues, 'components');

  // schema-level check (what the server does at boot)
  let okSchema = true;
  const parsed = PixelArtFileSchema.safeParse(file);
  if (!parsed.success) {
    okSchema = false;
    for (const issue of parsed.error.issues) {
      process.stdout.write(`✗ schema ${issue.path.join('.')}: ${issue.message}\n`);
    }
  } else {
    process.stdout.write(`✓ components.json matches PixelArtFileSchema\n`);
  }
  if (config) {
    const parsedCfg = PixelGeneratorConfigSchema.safeParse(config);
    if (!parsedCfg.success) {
      okSchema = false;
      for (const issue of parsedCfg.error.issues) {
        process.stdout.write(`✗ schema ${issue.path.join('.')}: ${issue.message}\n`);
      }
    } else {
      process.stdout.write(`✓ generator_config.json matches PixelGeneratorConfigSchema\n`);
    }
  }

  process.stdout.write(
    `  stats: ${validation.stats.components} components · ${validation.stats.categories} categories · ${validation.stats.pixels} pixels · ${validation.stats.palettes} palettes\n`
  );

  // every declared variant must render non-empty (except the none-variants)
  let okRender = true;
  for (const cat of config?.categories ?? []) {
    for (const id of cat.variants) {
      const combo = Object.fromEntries(categoryOrder(file).map((c) => [c, c === cat.category ? id : null]));
      const buf = renderPixelArt(file, combo as any, { only: [cat.category] });
      const filled = countOpaque(buf.data);
      const isNone = /_(none|bald)$/.test(id);
      if (isNone && filled > 0) {
        process.stdout.write(`✗ ${id} is a none-variant but paints ${filled} pixels\n`);
        okRender = false;
      }
      if (!isNone && filled === 0) {
        process.stdout.write(`✗ ${id} renders empty\n`);
        okRender = false;
      }
    }
  }
  if (okRender && config) process.stdout.write(`✓ every variant renders as expected\n`);

  // compositions: a random sample must validate
  let okCombo = true;
  if (config) {
    const total = combinationSpaceSize(file, config);
    for (let i = 0; i < Math.min(total, 64); i++) {
      const step = Math.max(1, Math.floor(total / 64));
      const c = combinationAt(file, config, i * step);
      if (!c) continue;
      const issues = validateComposition(file, c.combo as any, config);
      if (issues.length) {
        okCombo = false;
        for (const issue of issues) process.stdout.write(`✗ combo#${i * step} ${issue.path}: ${issue.message}\n`);
      }
    }
    if (okCombo) process.stdout.write(`✓ 64 sampled combinations validate (space = ${total})\n`);
  }

  return okFile && okSchema && okRender && okCombo ? 0 : 1;
}

function countOpaque(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
  return n;
}

function cmdGenerate(args: Args): number {
  const { file, config } = loadCanonical({ allowSource: true });
  const cfg = config ?? defaultConfig(file);
  const flags = args.flags;

  const mode = str(flags, 'mode', 'enumerate') as 'enumerate' | 'seeded';
  const outDir = join(OUT_DIR, str(flags, 'out', 'run') ?? 'run');
  const scale = Math.max(1, num(flags, 'scale', 8));
  const limit = num(flags, 'limit', mode === 'enumerate' ? 128 : 40);
  const dedupe = bool(flags, 'dedupe');

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const total = combinationSpaceSize(file, cfg);
  const combos = [];
  const seen = new Set<string>();
  const seeds = mode === 'seeded' ? generateSeeds(limit, str(flags, 'seed'), dedupe, file, cfg, seen) : null;

  for (let i = 0; i < limit; i++) {
    const c =
      mode === 'seeded' && seeds
        ? seeds[i]
        : combinationAt(file, cfg, ((bool(flags, 'wrap') ? i : i * Math.max(1, Math.floor(total / limit)))) % Math.max(1, total));
    if (!c) break;
    if (mode !== 'seeded' && dedupe) {
      if (seen.has(c.key)) {
        process.stdout.write(`! duplicate skipped: ${c.key}\n`);
        continue;
      }
      seen.add(c.key);
    }
    combos.push(c);
  }

  const checksums = {
    components: sha256(readFileSync(join(CONTENT, CANON_FILE))),
    ...(existsSync(join(CONTENT, CONFIG_FILE)) ? { generatorConfig: sha256(readFileSync(join(CONTENT, CONFIG_FILE))) } : {}),
  };

  const manifest = buildManifest(file, combos, checksums, {
    generatedAt: bool(flags, 'no-timestamp') ? undefined : new Date().toISOString(),
    seedKind: mode === 'seeded' ? 'draw' : 'enumerate',
  });

  const tiles: RawImage[] = [];
  let paintedPixels = 0;
  combos.forEach((c, i) => {
    const buf = renderPixelArt(file, c.combo, { scheme: c.scheme });
    paintedPixels += countOpaque(buf.data);
    const entry = manifest.entries[i];
    if (str(flags, 'format', 'png') === 'png') {
      const big = scaleNearest(buf, scale);
      const png = encodePng(big);
      writeFileSync(join(outDir, entry.file), png);
      if (bool(flags, 'verify-png')) {
        const back = decodePng(png);
        if (back.width !== big.width || back.height !== big.height) {
          process.stdout.write(`✗ ${entry.file}: decoded size mismatch\n`);
        }
      }
      tiles.push({ width: big.width, height: big.height, data: big.data });
    }
    if (bool(flags, 'preview-each')) {
      const raw = renderPixelArt(file, c.combo, { scheme: c.scheme, only: [String(flags.previewEach) as any] });
      process.stdout.write(`\n── ${entry.id} · ${c.combo[flags.previewEach as string] ?? '-'} ──\n${asciiPreview({ width: raw.width, height: raw.height, data: raw.data })}\n`);
    }
    if (bool(flags, 'json-per-file')) {
      writeFileSync(join(outDir, entry.file.replace(/\.png$/, '.json')), `${JSON.stringify({ ...entry, combo: c.combo, key: c.key }, null, 2)}\n`);
    }
  });

  writeFileSync(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `✓ ${combos.length} characters → ${relative(ROOT, outDir)} (mode=${mode}, scale=${scale}x, painted=${paintedPixels} px)\n`
  );
  process.stdout.write(`  space=${total} · checksum components=${checksums.components.slice(0, 12)} config=${(checksums.generatorConfig ?? '-').slice(0, 12)}\n`);

  if (tiles.length && bool(flags, 'sheet')) {
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const sheet = composeSheet(tiles, cols, num(flags, 'pad', 4), parseHexOrNull(str(flags, 'bg')));
    writeFileSync(join(outDir, 'spritesheet.png'), encodePng({ width: sheet.width, height: sheet.height, data: sheet.data }));
    writeFileSync(
      join(outDir, 'spritesheet.json'),
      `${JSON.stringify({ cell: { width: tiles[0].width, height: tiles[0].height }, columns: cols, tileCount: tiles.length, scale }, null, 2)}\n`
    );
    process.stdout.write(`✓ spritesheet.png ${sheet.width}x${sheet.height} (${cols} cols)\n`);
  }
  if (tiles.length && !bool(flags, 'no-gallery')) {
    writeFileSync(join(outDir, 'gallery.html'), galleryHtml(manifest, combos.length, scale));
    process.stdout.write(`✓ gallery.html\n`);
  }
  return 0;
}

function parseHexOrNull(hex?: string): { r: number; g: number; b: number; a: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

function generateSeeds(
  count: number,
  baseSeed: string | undefined,
  dedupe: boolean,
  file: PixelArtFile,
  cfg: PixelGeneratorConfig,
  seen: Set<string>
) {
  const out = [];
  const base = baseSeed ?? 'itsim-pixel';
  let tries = 0;
  while (out.length < count && tries < count * 50) {
    const seed = `${base}#${out.length}`;
    tries++;
    const c = combinationFromSeed(file, cfg, seed);
    if (dedupe) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
    }
    out.push(c);
  }
  return out;
}

function galleryHtml(manifest: any, count: number, scale: number): string {
  const cards = manifest.entries
    .map(
      (e: any) => `<figure>
  <img src="${e.file}" width="${32 * scale}" height="${32 * scale}" alt="${e.id}" loading="lazy">
  <figcaption><b>${e.id}</b><br><span class="s">${e.scheme}</span><br>${Object.entries(e.combo as Record<string, string | null>)
        .filter(([, v]) => v)
        .map(([k, v]) => `<span class="t">${k}:${v}</span>`)
        .join(' ')}<br><code>${e.seed}</code></figcaption>
</figure>`
    )
    .join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>pixelgen gallery — ${count} персонажей</title>
<style>
body{background:#12141a;color:#dfe3ea;font:13px/1.45 ui-monospace,Menlo,monospace;margin:24px}
h1{font-size:16px;font-weight:600}
.meta{color:#8b93a3;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
figure{margin:0;background:#1b1f28;border:1px solid #2a3040;border-radius:8px;padding:10px;text-align:center}
img{image-rendering:pixelated;background:repeating-conic-gradient(#20242e 0% 25%,#191d25 0% 50%) 0/12px 12px}
figcaption{text-align:left;margin-top:8px;color:#aeb6c6}
.s{color:#7fd1ae}.t{display:inline-block;background:#242a38;border-radius:4px;padding:0 4px;margin:1px 0;font-size:11px}
code{color:#6f7788;font-size:10px;word-break:break-all}
</style></head><body>
<h1>pixelgen · ${count} персонажей</h1>
<div class="meta">canvas 32×32 · upscale ×${scale} nearest · checksum ${manifest.checksums.components.slice(0, 16)} · ${manifest.generatedAt ?? '—'}</div>
<div class="grid">${cards}</div>
</body></html>
`;
}

function cmdRender(args: Args): number {
  const { file, config } = loadCanonical({ allowSource: true });
  const cfg = config ?? defaultConfig(file);
  const flags = args.flags;
  const seed = str(flags, 'seed');
  let combo: Record<string, string | null>;
  let schemeId = 'base';

  if (seed) {
    const c = combinationFromSeed(file, cfg, seed);
    combo = c.combo as any;
    schemeId = c.scheme.id;
    process.stdout.write(`seed ${seed} → ${schemeId}\n`);
  } else if (str(flags, 'index') !== undefined) {
    const c = combinationAt(file, cfg, num(flags, 'index', 0))!;
    combo = c.combo as any;
    schemeId = c.scheme.id;
  } else {
    combo = {};
    for (const part of args._.slice(1)) {
      const [cat, id] = part.split('=');
      combo[cat] = id === 'null' ? null : (id ?? cat);
    }
    for (const cat of categoryOrder(file)) if (combo[cat] === undefined) combo[cat] = cfg.categories.find((c) => c.category === cat)?.variants[0] ?? null;
    schemeId = str(flags, 'scheme', 'base')!;
  }

  const issues = validateComposition(file, combo, cfg);
  if (!report(issues, `composition ${schemeId}`) && !bool(flags, 'force')) return 1;

  const scheme = cfg.colorSchemes.find((s) => s.id === schemeId) ?? null;
  const buf = renderPixelArt(file, combo as any, { scheme });
  const scale = Math.max(1, num(flags, 'scale', 8));
  const big = scaleNearest(buf, scale);
  process.stdout.write(`${asciiPreview({ width: buf.width, height: buf.height, data: buf.data })}\n`);
  const out = str(flags, 'out', join(OUT_DIR, 'render', 'preview.png'))!;
  if (str(flags, 'format', 'png') === 'png') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, encodePng({ width: big.width, height: big.height, data: big.data }));
    process.stdout.write(`✓ ${relative(ROOT, out)} (${big.width}x${big.height})\n`);
  }
  if (bool(flags, 'dump-pixels')) {
    process.stdout.write(`${JSON.stringify({ scheme, palettes: effectivePalettes(file, scheme), combo }, null, 2)}\n`);
  }
  return 0;
}

function cmdRepro(args: Args): number {
  const { file, config } = loadCanonical();
  const cfg = config ?? defaultConfig(file);
  const runDir = join(OUT_DIR, str(args.flags, 'run', 'run') ?? 'run');
  const manifest = readJson<any>(join(runDir, MANIFEST_FILE));

  // 1. content must still be the same content
  const currentChecksum = sha256(readFileSync(join(CONTENT, CANON_FILE)));
  if (manifest.checksums?.components && manifest.checksums.components !== currentChecksum) {
    process.stdout.write(`✗ components.json changed since generation:\n  manifest ${manifest.checksums.components.slice(0, 16)}\n  current  ${currentChecksum.slice(0, 16)}\n`);
    return 1;
  }
  process.stdout.write(`✓ checksum components matches (${currentChecksum.slice(0, 16)})\n`);

  // 2. re-render every entry from its seed and diff the PNG bytes
  let bad = 0;
  for (const entry of manifest.entries) {
    const rebuilt =
      entry.seedKind === 'enumerate'
        ? combinationAt(file, cfg, Number(entry.seed.replace(/^enumerate:/, '')))!
        : combinationFromSeed(file, cfg, entry.seed);
    if (!rebuilt) {
      bad++;
      process.stdout.write(`✗ ${entry.id}: seed "${entry.seed}" reproduces nothing
`);
      continue;
    }
    const scheme = cfg.colorSchemes.find((s) => s.id === entry.scheme) ?? null;
    const a = renderPixelArt(file, rebuilt.combo, { scheme });
    const b = renderPixelArt(file, entry.combo as any, { scheme });
    if (Buffer.from(a.data.buffer).compare(Buffer.from(b.data.buffer)) !== 0) {
      bad++;
      process.stdout.write(`✗ ${entry.id}: rebuilt combination differs from manifest combo\n`);
    }
    const pngPath = join(runDir, entry.file);
    if (existsSync(pngPath)) {
      const decoded = decodePng(readFileSync(pngPath));
      const scale = decoded.width / file.canvas.width;
      const scaled = scaleNearest(b, scale);
      if (Buffer.from(scaled.data.buffer).compare(Buffer.from(decoded.data.buffer)) !== 0) {
        bad++;
        process.stdout.write(`✗ ${entry.id}: ${entry.file} pixels differ from a re-render\n`);
      }
    }
  }
  if (bad) {
    process.stdout.write(`✗ repro failed for ${bad} entr(ies)\n`);
    return 1;
  }
  process.stdout.write(`✓ ${manifest.entries.length}/${manifest.entries.length} characters reproduced from seed + checksums\n`);
  return 0;
}

/**
 * Этап 2 ТЗ: the prompt that makes an LLM emit *validator-friendly* pixels.
 * It mirrors docs/pixel-art.md §1 grammar exactly (rows, not pixel arrays).
 */
function cmdPrompt(args: Args): number {
  const { file } = loadCanonical({ allowSource: true });
  const category = args._[1] ?? 'hair';
  const flags = args.flags;
  const palKeys = Object.keys(file.palettes);
  const existing = Object.keys(file.components)
    .filter((id) => file.components[id].category === category)
    .map((id) => `- ${id}: ${file.components[id].label}`)
    .join('\n');

  process.stdout.write(`Ты генерируешь ОДИН компонент пиксельного аватара для игры IT SIM.
Формат — пиксельная JSON-сетка, НЕ изображение. Никогда не описывай цвета словами и не рисуй в SVG/PNG.

КАНВАС: ${file.canvas.width}×${file.canvas.height}, вид строго анфас.
ANCHOR: x/y — смещение левого верхнего угла компонента внутри кадра.
СЛОИ (низ → верх): face, eyes, mouth, clothing, hair, hat, accessory. Позже лежащий слой полностью перекрывает ранний пиксель — не рисуй «прозрачные» пиксели и не дублируй то, что перекроет следующий слой.

ГРАММАТИКА СТРОКИ (rows):
  "."            — пусто (прозрачность = отсутствие пикселя, альфа не используется)
  "0".."7"       — индекс в локальном массиве palettes
  "#rrggbb"      — литеральный цвет; РАЗРЕШЁН только в категориях hat/accessory (блик на металле/стекле)
  "@N" в начале  — первая ячейка строки стоит на смещении N от anchor (экономия)
  строка rows[y]  — это y-смещение от anchor; токен i — x-смещение
СИММЕТРИЯ: "mirror": true рисует левую половину и отражает её по symmetry_axis_x=${file.layout.symmetry_axis_x} (правую половину не рисуй).

ПАЛИТРЫ (индекс 0=highlight, 1=base, 2=shade, 3=outline; всего 2–8 цветов, от светлого к тёмному):
${palKeys.map((k) => `  ${k}: ${file.palettes[k].join(' ')}`).join('\n')}

ЖЁСТКИЕ ПРАВИЛА:
1. Глаза всегда на строке eyes_y=${file.layout.eyes_y}, рот на mouth_y=${file.layout.mouth_y} — не сдвигай их, иначе персонаж выглядит больным.
2. Все пиксели после применения anchor обязаны попасть в 0..${file.canvas.width - 1} / 0..${file.canvas.height - 1}. Выход за кадр = ошибка, не предупреждение.
3. Брови — в категории eyes, цвет = hair#base.
4. Категория "${category}" обязана оставлять читаемым лицо; волосы не закрывают глаза.
5. Если компонент несовместим с категорией — укажи "excludes": ["<category>"] и НЕ рисуй ничего в этой категории. Цели excludes обязаны иметь вариант *_none/*_bald.
6. *_none/*_bald вариант — это пустой pixels/rows.

ФОРМАТ ОТВЕТА — ровно один JSON-объект без markdown и без пояснений:
{"${category}_xxx":{"category":"${category}","label":"<название>","anchor":{"x":0,"y":0},"mirror":true,"palettes":[<список имён палитр>],"rows":["<строка>", ...],"tags":["..."]}}

УЖЕ СУЩЕСТВУЮТ (не повторяй их форму):
${existing || '(нет)'}

ДАЙ: ${str(flags, 'count', '1')} вариант(ов) категории "${category}" в стиле IT SIM (${str(flags, 'mood', 'айтишник, лёгкая ирония, никаких надписей')}).
${bool(flags, 'with-example') ? `ПРИМЕР (короткие строки допустимы благодаря @N):\n${JSON.stringify({ hair_example: { category: 'hair', label: 'Пример', anchor: { x: 0, y: 0 }, mirror: true, palettes: ['skin', 'hair'], rows: ['@10 1 1 1 1', '@9 1 1 1 1 1', '@8 3 1 1'] } }, null, 2)}\n` : ''}`);
  return 0;
}

/** Этап 3 ТЗ: take an AI-emitted components.json and tell the human what's wrong */
function cmdImport(args: Args): number {
  const path = args._[1];
  if (!path) {
    process.stdout.write('usage: pixelgen import <ai-output.json> [--write]\n');
    return 2;
  }
  const { file } = loadCanonical({ allowSource: true });
  const incoming = readJson<Record<string, any>>(isAbsolute(path) ? path : join(ROOT, path));
  const merged = {
    ...file,
    components: {
      ...Object.fromEntries(
        Object.entries(file.components).map(([id, c]) => [
          id,
          { ...c, ...(c.pixels.length ? {} : {}) },
        ])
      ),
    },
  } as PixelArtFile;

  const problems: string[] = [];
  const accepted: Record<string, any> = {};
  for (const [id, raw] of Object.entries(incoming)) {
    const comp = { ...raw } as any;
    comp.category = comp.category ?? id.split('_')[0];
    if (!merged.layer_order.includes(comp.category)) {
      problems.push(`${id}: unknown category "${comp.category}"`);
      continue;
    }
    const localPalettes: string[] = Array.isArray(comp.palettes) ? comp.palettes : Object.keys(file.palettes);
    let pixels;
    try {
      pixels = comp.rows
        ? (compilePixelArtFile(merged, { components: { [id]: { ...comp, palettes: localPalettes } } }).components[id] as any).pixels
        : comp.pixels;
    } catch (e) {
      problems.push(`${id}: ${(e as Error).message}`);
      continue;
    }
    if (!Array.isArray(pixels) || pixels.length === 0) {
      problems.push(`${id}: no pixels after compile`);
      continue;
    }
    accepted[id] = {
      category: comp.category,
      label: comp.label ?? id,
      anchor: comp.anchor ?? { x: 0, y: 0 },
      ...(comp.mirror ? { mirror: true } : {}),
      ...(comp.excludes ? { excludes: comp.excludes } : {}),
      pixels,
      ...(comp.tags ? { tags: comp.tags } : {}),
    };
  }

  const candidate: PixelArtFile = { ...merged, components: { ...merged.components, ...accepted } } as PixelArtFile;
  const validation = validatePixelArtFile(candidate);
  for (const p of problems) process.stdout.write(`✗ import ${p}\n`);
  const ok = report(validation.issues, `import (${Object.keys(accepted).length} accepted)`) && problems.length === 0;
  if (ok && bool(args.flags, 'write')) {
    const sourcePath = join(CONTENT, SOURCE_FILE);
    const source = readJson<any>(sourcePath);
    for (const [id, comp] of Object.entries(accepted)) {
      source.components[id] = { ...comp, rows: undefined };
      delete source.components[id].rows;
    }
    writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
    process.stdout.write(`✓ merged into ${relative(ROOT, sourcePath)} — run: npm run pixelgen:compile\n`);
  }
  return ok ? 0 : 1;
}

/** Этап 4: push canonical content into the game's content dir + DB-friendly export */
function cmdExport(args: Args): number {
  const { file, config } = loadCanonical();
  const runDir = join(OUT_DIR, str(args.flags, 'run', 'run') ?? 'run');
  const manifest = existsSync(join(runDir, MANIFEST_FILE)) ? readJson<any>(join(runDir, MANIFEST_FILE)) : null;

  const rows = manifest?.entries?.map((e: any) => ({
    id: e.id,
    seed: e.seed,
    scheme: e.scheme,
    combo: e.combo,
    tags: comboTags(file, e.combo),
    file: e.file,
  }));
  if (rows) {
    writeFileSync(join(runDir, 'characters.sql'), `${sqlInserts(rows)}\n`);
    process.stdout.write(`✓ characters.sql (${rows.length} rows)\n`);
  }
  // the client reads components.json directly from packages/content/pixel — nothing to copy,
  // but a self-contained payload is handy for tests and for the vitrina export
  writeFileSync(
    join(runDir, 'pixel-pack.json'),
    `${JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        checksums: { components: sha256(readFileSync(join(CONTENT, CANON_FILE))) },
        components: file,
        generatorConfig: config,
        characters: rows ?? [],
      },
      null,
      2
    )}\n`
  );
  process.stdout.write(`✓ pixel-pack.json → ${relative(ROOT, join(runDir, 'pixel-pack.json'))}\n`);
  return 0;
}

function sqlInserts(rows: any[]): string {
  const head = `-- pixel characters (docs/pixel-art.md, Этап 4). Requires a table:
--   create table pixel_characters (id text primary key, seed text, scheme text, combo jsonb, tags text[], file text);
insert into pixel_characters (id, seed, scheme, combo, tags, file) values`;
  const values = rows
    .map((r) => `  ('${r.id}', '${r.seed}', '${r.scheme}', '${JSON.stringify(r.combo).replace(/'/g, "''")}'::jsonb, array[${r.tags.map((t: string) => `'${t}'`).join(', ')}], '${r.file}')`)
    .join(',\n');
  return `${head}\n${values}\non conflict (id) do update set seed = excluded.seed, combo = excluded.combo, tags = excluded.tags;`;
}

function cmdAudit(): number {
  // compile idempotency: regenerating from source must produce the committed bytes
  const sourcePath = join(CONTENT, SOURCE_FILE);
  const canonicalPath = join(CONTENT, CANON_FILE);
  if (!existsSync(sourcePath)) {
    process.stdout.write('✗ components.source.json is missing\n');
    return 1;
  }
  const { json: rebuilt } = compileSourceFile(sourcePath);
  const onDisk = existsSync(canonicalPath) ? readFileSync(canonicalPath, 'utf8') : '';
  if (rebuilt !== onDisk) {
    process.stdout.write('✗ components.json is stale — run: npm run pixelgen:compile\n');
    return 1;
  }
  process.stdout.write('✓ components.json is in sync with components.source.json\n');
  return cmdValidate({ _: ['validate'], flags: {} });
}

function usage(): number {
  process.stdout.write(`pixelgen — pixel-art avatar pipeline (docs/pixel-art.md)

  compile                      source rows → canonical components.json
  validate                     schema + structure + compositions + render sample
  generate [--mode=seeded]     combinations → PNG + manifest.json
           [--limit=N] [--scale=8] [--dedupe] [--seed=s] [--sheet]
           [--preview-each=<category>] [--out=dir] [--no-gallery]
  render [cat=id ...] [--seed]  single character → ASCII + PNG
  repro  [--run=dir]            manifest → re-render → byte diff (must be 0)
  prompt [category] [--count]   emit the AI master-prompt
  import <file> [--write]       validate/merge an AI-emitted components.json
  export [--run=dir]            manifest → SQL + pixel-pack.json
  audit                         CI gate: compile idempotency + full validation

  env: PIXEL_CONTENT_DIR, PIXEL_OUT_DIR
`);
  return 0;
}

const COMMANDS: Record<string, (a: Args) => number> = {
  compile: cmdCompile,
  validate: cmdValidate,
  generate: cmdGenerate,
  render: cmdRender,
  repro: cmdRepro,
  prompt: cmdPrompt,
  import: cmdImport,
  export: cmdExport,
  audit: cmdAudit,
};

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? 'help';
  const fn = COMMANDS[cmd];
  if (!fn) {
    usage();
    process.exit(cmd === 'help' ? 0 : 2);
  }
  try {
    process.exit(fn(args));
  } catch (e) {
    process.stderr.write(`✗ ${cmd}: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

main();
