import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  compileRows,
  expandRowPalettes,
  combinationAt,
  combinationFromSeed,
  combinationSpaceSize,
  derivePalette,
  effectivePalettes,
  parseHex,
  renderPixelArt,
  resolveColor,
  resolveExcludes,
  scaleNearest,
  toHex,
  buildPixelComposition,
  pickSchemeId,
  noneVariantOf,
} from '../pixelArt';
import { validateComposition, validatePixelArtFile } from '../pixelArtValidate';
import { PixelArtFile, PixelGeneratorConfig } from '../../types';
import { PixelArtFileSchema, PixelGeneratorConfigSchema } from '../../schemas/index';

const CONTENT = join(__dirname, '..', '..', '..', '..', 'content', 'pixel');
const file = JSON.parse(readFileSync(join(CONTENT, 'components.json'), 'utf-8')) as PixelArtFile;
const config = JSON.parse(readFileSync(join(CONTENT, 'generator_config.json'), 'utf-8')) as PixelGeneratorConfig;

const pixelAt = (buf: { width: number; data: Uint8ClampedArray }, x: number, y: number) => {
  const i = (y * buf.width + x) * 4;
  return { r: buf.data[i], g: buf.data[i + 1], b: buf.data[i + 2], a: buf.data[i + 3] };
};

describe('pixel colors', () => {
  it('parses and re-serializes hex', () => {
    expect(toHex(parseHex('#0a1b2c')!)).toBe('#0a1b2c');
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });

  it('resolves palette by index and by role', () => {
    const palettes = { skin: ['#ffffff', '#808080', '#404040', '#000000'] };
    expect(toHex(resolveColor('skin#0', palettes)!)).toBe('#ffffff');
    expect(toHex(resolveColor('skin#base', palettes)!)).toBe('#808080');
    expect(toHex(resolveColor('skin#outline', palettes)!)).toBe('#000000');
    expect(resolveColor('skin#9', palettes)).toBeNull(); // out of range *and* unresolvable name check
    expect(toHex(resolveColor('#123456', palettes)!)).toBe('#123456');
    expect(resolveColor('nope#0', palettes)).toBeNull();
  });

  it('derives missing palette steps from base instead of failing', () => {
    // a 2-colour scheme must still answer requests for shade/outline
    const two = { skin: ['#123456', '#8ec5ff'] };
    expect(toHex(resolveColor('skin#2', two)!)).toBe(derivePalette(two.skin)[2]);
    expect(toHex(resolveColor('skin#3', two)!)).toBe(derivePalette(two.skin)[3]);
    expect(resolveColor('skin#7', two)).toBeNull();
    const derived = derivePalette(['#ff0000']);
    expect(derived.length).toBe(4);
    expect(derived[1]).toBe('#ff0000');
  });
});

describe('authored rows grammar', () => {
  it('expands dots, digits and the @offset prefix', () => {
    const pixels = compileRows(['1 1', '@4 2 . 3'], ['skin#0', 'skin#1', 'skin#2', 'skin#3']);
    expect(pixels).toEqual([
      { x: 0, y: 0, c: 'skin#1' },
      { x: 1, y: 0, c: 'skin#1' },
      { x: 4, y: 1, c: 'skin#2' },
      { x: 6, y: 1, c: 'skin#3' },
    ]);
  });

  it('keeps blank rows in place (index is the y-offset, gaps are not compressed)', () => {
    // a real regression: the authoring script once dropped empty rows and every
    // sprite silently moved up
    const rows = ['1', '', '', '2'];
    expect(compileRows(rows, ['skin#0', 'skin#1', 'skin#2'])).toEqual([
      { x: 0, y: 0, c: 'skin#1' },
      { x: 0, y: 3, c: 'skin#2' },
    ]);
  });

  it('expands a bare palette name into its role colors', () => {
    const expanded = expandRowPalettes(['skin', 'hair#2'], { skin: ['#a', '#b', '#c', '#d'] });
    expect(expanded).toEqual(['skin#0', 'skin#1', 'skin#2', 'skin#3', 'hair#2']);
    expect(() => expandRowPalettes(['nope'], {})).toThrow(/not defined/);
  });

  it('accepts literal hex and reserved tokens', () => {
    expect(compileRows(['#ff0000'], [])[0]).toEqual({ x: 0, y: 0, c: '#ff0000' });
    expect(compileRows(['w'], [])[0].c).toBe('#ffffff');
  });

  it('rejects a token outside the palette', () => {
    expect(() => compileRows(['7'], ['skin#0', 'skin#1'])).toThrow(/out of range/);
  });
});

describe('renderer', () => {
  it('paints nothing where no component is chosen (transparency = absent pixel)', () => {
    const buf = renderPixelArt(file, {});
    const painted = Array.from(buf.data).filter((_, i) => i % 4 === 3 && buf.data[i] !== 0).length;
    expect(painted).toBe(0);
    expect(buf.width * buf.height).toBe(file.canvas.width * file.canvas.height);
  });

  it('mirrors symmetric components about the axis', () => {
    const buf = renderPixelArt(file, { eyes: 'eyes_normal' }, { only: ['eyes'] });
    for (const p of file.components.eyes_normal.pixels) {
      const x = file.components.eyes_normal.anchor.x + p.x;
      const y = file.components.eyes_normal.anchor.y + p.y;
      const mirrored = Math.round(2 * file.layout.symmetry_axis_x - x);
      expect(pixelAt(buf, mirrored, y).a).toBe(pixelAt(buf, x, y).a);
      expect(toHex(pixelAt(buf, mirrored, y) as any)).toBe(toHex(pixelAt(buf, x, y) as any));
    }
  });

  it('later layers fully overwrite earlier ones (no blending)', () => {
    const both = renderPixelArt(file, { face: 'face_round', hat: 'hat_hood' });
    const onlyHat = renderPixelArt(file, { hat: 'hat_hood' }, { only: ['hat'] });
    // every pixel the hat paints alone must survive untouched on top of the face
    let checked = 0;
    for (let i = 0; i < both.data.length; i += 4) {
      if (onlyHat.data[i + 3] === 0) continue;
      const idx = i / 4;
      const x = idx % both.width;
      const y = Math.floor(idx / both.width);
      expect(toHex(pixelAt(both, x, y))).toBe(toHex(pixelAt(onlyHat, x, y)));
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('a recolor scheme changes the bytes but not the geometry', () => {
    const combo = combinationFromSeed(file, config, 'x').combo;
    const a = renderPixelArt(file, combo);
    const scheme = config.colorSchemes.find((s) => s.id === 'neon')!;
    const b = renderPixelArt(file, combo, { scheme });
    const alphaA = Array.from(a.data).filter((_, i) => i % 4 === 3).join(',');
    const alphaB = Array.from(b.data).filter((_, i) => i % 4 === 3).join(',');
    expect(alphaA).toBe(alphaB); // same silhouette
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false); // different colors
    expect(a.data.filter((_, i) => i % 4 === 3 && a.data[i] !== 0).length).toBeGreaterThan(100);
  });

  it('clips to the canvas instead of throwing', () => {
    const huge = JSON.parse(JSON.stringify(file)) as PixelArtFile;
    huge.components.hat_none = { ...huge.components.hat_none, pixels: [{ x: -5, y: -5, c: '#ffffff' }] };
    expect(() => renderPixelArt(huge, { hat: 'hat_none' })).not.toThrow();
  });

  it('upscales with nearest neighbour only (no anti-aliasing)', () => {
    const buf = renderPixelArt(file, { face: 'face_round' });
    const big = scaleNearest(buf, 4);
    expect(big.width).toBe(buf.width * 4);
    const src = pixelAt(buf, 10, 10);
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 4; dy++) {
        expect(toHex(pixelAt(big, 40 + dx, 40 + dy) as any)).toBe(toHex(src as any));
      }
    }
  });
});

describe('excludes and composition validity', () => {
  it('a hood forces the hair category to its bald fallback', () => {
    const { combo, applied } = resolveExcludes(file, { hair: 'hair_curly', hat: 'hat_hood' }, config);
    expect(combo.hair).toBe(noneVariantOf(file, 'hair', config));
    expect(combo.hair).toBe('hair_bald');
    expect(applied[0].by).toBe('hat_hood');
  });

  it('validates a composition against the excludes rules', () => {
    const good = { hat: 'hat_hood', hair: 'hair_bald' };
    expect(validateComposition(file, good as any, config).filter((i) => i.level === 'error' && i.path === 'combo.hair')).toHaveLength(0);
    const bad = { hat: 'hat_hood', hair: 'hair_short' };
    const issues = validateComposition(file, bad as any, config);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('excludes'))).toBe(true);
  });

  it('none variants render nothing', () => {
    for (const cat of config.categories) {
      if (!cat.noneId) continue;
      const buf = renderPixelArt(file, { [cat.category]: cat.noneId } as any, { only: [cat.category] });
      expect(Array.from(buf.data).some((_, i) => i % 4 === 3 && buf.data[i] !== 0)).toBe(false);
    }
  });
});

describe('combinations', () => {
  it('enumerate is a bijection over the whole space (no duplicates)', () => {
    const total = combinationSpaceSize(file, config);
    expect(total).toBeGreaterThan(1000);
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(combinationAt(file, config, i)!.key);
    expect(keys.size).toBe(200);
    // wrap-around must land on the same characters
    expect(combinationAt(file, config, total + 7)!.key).toBe(combinationAt(file, config, 7)!.key);
  });

  it('is deterministic: same seed → same character, different seed → usually not', () => {
    const a = combinationFromSeed(file, config, 'wallet:111');
    const b = combinationFromSeed(file, config, 'wallet:111');
    const c = combinationFromSeed(file, config, 'wallet:222');
    expect(a.key).toBe(b.key);
    expect(Buffer.from(renderPixelArt(file, a.combo, { scheme: a.scheme }).data).equals(Buffer.from(renderPixelArt(file, b.combo, { scheme: b.scheme }).data))).toBe(true);
    expect(c.key).not.toBe(a.key);
  });

  it('uses every variant of a category given enough draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(String(combinationFromSeed(file, config, `s${i}`).combo.hat));
    expect(seen.size).toBe(config.categories.find((c) => c.category === 'hat')!.variants.length);
  });

  it('weights bias the draw (hat_none is rarer than a hat)', () => {
    const cfg: PixelGeneratorConfig = JSON.parse(JSON.stringify(config));
    const cat = cfg.categories.find((c) => c.category === 'hat')!;
    cat.weights = { hat_none: 1 };
    for (const v of cat.variants) if (v !== 'hat_none') cat.weights[v] = 100;
    let bare = 0;
    for (let i = 0; i < 300; i++) if (combinationFromSeed(file, cfg, `w${i}`).combo.hat === 'hat_none') bare++;
    expect(bare).toBeLessThan(30);
  });
});

describe('genotype → avatar', () => {
  const traits = {
    seed: 'abc',
    skinTone: 'skin_dark',
    eyeShape: 'eye_tired',
    hairStyle: 'hair_buzzcut',
    hairColor: 'hair_black',
    beard: 'beard_none',
    top: 'top_hoodie',
    accessory: 'acc_glasses',
    windowShape: 'win_1',
    wallColor: 'wall_1',
    decor: 'decor_1',
  };

  it('maps genetic traits onto pixel components', () => {
    const { combo, schemeId } = buildPixelComposition(config, traits as any);
    expect(combo.eyes).toBe('eyes_tired');
    expect(combo.hair).toBe('hair_buzz');
    expect(combo.clothing).toBe('clothing_hoodie');
    expect(combo.accessory).toBe('accessory_glasses');
    expect(schemeId).toBe('nocturne');
    expect(pickSchemeId(config, traits as any)).toBe('nocturne');
  });

  it('falls back to the base scheme when nothing matches', () => {
    expect(buildPixelComposition(config, { ...traits, hairColor: 'hair_blond', skinTone: 'skin_olive' } as any).schemeId).toBe('paper');
    expect(buildPixelComposition(config, { ...traits, hairColor: 'zzz', skinTone: 'zzz' } as any).schemeId).toBe('base');
  });

  it('ignores trait mappings for components the pack does not ship', () => {
    const cfg: PixelGeneratorConfig = JSON.parse(JSON.stringify(config));
    cfg.categories.find((c) => c.category === 'eyes')!.variants = ['eyes_normal'];
    // eyes_tired is no longer available → no crash, and the single shipped variant wins
    expect(buildPixelComposition(cfg, traits as any).combo.eyes).toBe('eyes_normal');
    // two candidates → no guessing, the seeded draw fills the slot (null = "not decided by traits")
    cfg.categories.find((c) => c.category === 'eyes')!.variants = ['eyes_wide', 'eyes_normal'];
    expect(buildPixelComposition(cfg, traits as any).combo.eyes).toBeNull();
  });
});

describe('the shipped MVP pack', () => {
  it('matches the schema', () => {
    expect(() => PixelArtFileSchema.parse(file)).not.toThrow();
    expect(() => PixelGeneratorConfigSchema.parse(config)).not.toThrow();
  });

  it('has exactly the ТЗ component counts: 3/5/4/6/5/4/3 = 30', () => {
    const byCat: Record<string, number> = {};
    for (const comp of Object.values(file.components)) byCat[comp.category] = (byCat[comp.category] ?? 0) + 1;
    expect(byCat).toEqual({ face: 3, eyes: 5, mouth: 4, hair: 6, hat: 5, clothing: 4, accessory: 3 });
    expect(Object.keys(file.components)).toHaveLength(30);
  });

  it('declares the none variants the ТЗ requires', () => {
    expect(config.categories.find((c) => c.category === 'hair')!.noneId).toBe('hair_bald');
    expect(config.categories.find((c) => c.category === 'hat')!.noneId).toBe('hat_none');
    expect(config.categories.find((c) => c.category === 'clothing')!.noneId).toBe('clothing_none');
    expect(config.categories.find((c) => c.category === 'accessory')!.noneId).toBe('accessory_none');
  });

  it('has fixed feature rows so variants cannot drift', () => {
    for (const id of Object.keys(file.components)) {
      const comp = file.components[id];
      if (comp.category !== 'eyes' && comp.category !== 'mouth') continue;
      if (!comp.pixels.length) continue;
      const rows = comp.pixels.map((p) => comp.anchor.y + p.y);
      const lo = Math.min(...rows);
      const hi = Math.max(...rows);
      const line = comp.category === 'eyes' ? file.layout.eyes_y : file.layout.mouth_y;
      expect(lo).toBeLessThanOrEqual(line + 4);
      expect(hi).toBeGreaterThanOrEqual(line - 4);
      expect(hi - lo).toBeLessThanOrEqual(5);
    }
  });

  it('passes structural validation with zero errors', () => {
    const v = validatePixelArtFile(file, config);
    expect(v.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(v.stats.components).toBe(30);
    expect(v.stats.pixels).toBeGreaterThan(1000);
  });

  it('keeps every pixel inside the canvas', () => {
    for (const comp of Object.values(file.components)) {
      for (const p of comp.pixels) {
        const x = comp.anchor.x + p.x;
        const y = comp.anchor.y + p.y;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(file.canvas.width);
        expect(y).toBeLessThan(file.canvas.height);
      }
    }
  });

  it('tints brows with the hair palette and nothing else leaks hex', () => {
    const eyes = file.components.eyes_normal;
    expect(eyes.pixels.some((p) => p.c.startsWith('hair#'))).toBe(true);
    const recolored = effectivePalettes(file, config.colorSchemes.find((s) => s.id === 'neon')!);
    expect(recolored.skin).not.toEqual(file.palettes.skin);
    expect(recolored.accessory).toEqual(expect.any(Array));
  });

  it('rejects a component painted outside the canvas', () => {
    const broken = JSON.parse(JSON.stringify(file)) as PixelArtFile;
    broken.components.hair_buzz.pixels.push({ x: 40, y: 40, c: 'hair#1' });
    const v = validatePixelArtFile(broken, config);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.level === 'error' && /outside the 32x32 canvas/.test(i.message))).toBe(true);
  });

  it('rejects an exclude whose target has no none variant', () => {
    const broken = JSON.parse(JSON.stringify(file)) as PixelArtFile;
    broken.components.hair_buzz.excludes = ['mouth'];
    const v = validatePixelArtFile(broken, config);
    expect(v.issues.some((i) => i.level === 'error' && /no \*_none/.test(i.message))).toBe(true);
  });

  it('rejects mutual excludes', () => {
    const broken = JSON.parse(JSON.stringify(file)) as PixelArtFile;
    broken.components.hat_hood.excludes = ['hair'];
    broken.components.hair_short.excludes = ['hat'];
    const v = validatePixelArtFile(broken, config);
    expect(v.issues.some((i) => /mutual exclusion/.test(i.message))).toBe(true);
  });

  it('rejects unknown palette references', () => {
    const broken = JSON.parse(JSON.stringify(file)) as PixelArtFile;
    broken.components.hair_buzz.pixels[0].c = 'nosuchpalette#1';
    const v = validatePixelArtFile(broken, config);
    expect(v.issues.some((i) => i.level === 'error' && /unresolvable/.test(i.message))).toBe(true);
  });
});
