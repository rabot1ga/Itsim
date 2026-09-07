import {
  GeneticTraits,
  PixelArtFile,
  PixelColorScheme,
  PixelComposition,
  PixelGeneratorConfig,
  buildPixelComposition,
  combinationFromSeed,
  renderPixelArt,
  resolveExcludes,
} from '@itsim/shared';

/**
 * Pixel avatar composition for a player — docs/pixel-art.md.
 *
 * Deliberately *not* an AI call: the player's genotype decides the look, and
 * the shared engine draws it. The result is pure data (ids + palette colors),
 * so it can be cached, hashed into a share card, or re-rendered later.
 */
export interface PixelPack {
  canvas: { width: number; height: number };
  layout: PixelArtFile['layout'];
  layerOrder: PixelArtFile['layer_order'];
  palettes: Record<string, string[]>;
  components: PixelArtFile['components'];
  generatorConfig: PixelGeneratorConfig | null;
}

export interface PixelAvatarData {
  file: PixelArtFile;
  combo: PixelComposition;
  schemeId: string;
  /** resolved recolor (null = base palettes from components.json) */
  scheme: PixelColorScheme | null;
  /** how much of the look came from the genotype vs the seed */
  source: Record<string, 'trait' | 'seed'>;
  /** the player's seed — together with the content checksums it rebuilds this look */
  seed: string;
}

export async function fetchPixelPack(): Promise<PixelPack | null> {
  try {
    const res = await fetch('/api/content/pixel');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.available) return null;
    return {
      canvas: data.canvas,
      layout: data.layout,
      layerOrder: data.layerOrder,
      palettes: data.palettes,
      components: data.components,
      generatorConfig: data.generatorConfig ?? null,
    } as PixelPack;
  } catch {
    return null;
  }
}

export function packToFile(pack: PixelPack): PixelArtFile {
  return {
    format: 1,
    canvas: pack.canvas,
    layout: pack.layout,
    layer_order: pack.layerOrder,
    palettes: pack.palettes,
    components: pack.components,
  } as PixelArtFile;
}

/**
 * Trait-driven slots win; everything else is drawn from the player seed, which
 * keeps the avatar stable across days and reproducible across devices.
 */
export function buildAvatarData(pack: PixelPack, traits: GeneticTraits): PixelAvatarData {
  const file = packToFile(pack);
  const config = pack.generatorConfig ?? { format: 1, categories: [], colorSchemes: [] };
  const seeded = combinationFromSeed(file, config, traits.seed);
  const fromTraits = buildPixelComposition(config, traits);

  const combo: PixelComposition = { ...seeded.combo };
  const source: Record<string, 'trait' | 'seed'> = {};
  for (const category of pack.layerOrder) {
    const traitValue = fromTraits.combo[category];
    if (traitValue) {
      combo[category] = traitValue;
      source[category] = 'trait';
    } else {
      source[category] = 'seed';
    }
  }

  // hat_hood-like rules still apply on top of the trait-derived look
  const { combo: resolved } = resolveExcludes(file, combo, config);
  const schemeId = fromTraits.schemeId ?? seeded.scheme.id;
  const scheme =
    config.colorSchemes.find((s) => s.id === schemeId) ?? seeded.scheme ?? null;
  return { file, combo: resolved, schemeId: scheme?.id ?? 'base', scheme, source, seed: traits.seed };
}
