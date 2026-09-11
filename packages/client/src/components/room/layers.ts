import {
  LayerManifest,
  LayerEntry,
  GeneticTraits,
  GeneticsConfig,
  TintPaletteEntry,
  traitTint,
  tintFilter,
} from '@itsim/shared';

/**
 * Layer composition helpers — DESIGN.md section 1-3.
 * Manifest entries are stacked by zOrder; grayscale layers are tinted
 * via CSS filter (the NFT-collection tinting trick).
 */

export interface Composition {
  [slotId: string]: string | null; // chosen entry id per slot (null = none)
}

/** Find an entry in a manifest slot */
export function findEntry(manifest: LayerManifest, slotId: string, entryId: string | null): LayerEntry | null {
  const slot = manifest.slots.find((s) => s.id === slotId);
  if (!slot) return null;
  return slot.entries.find((e) => e.id === entryId) ?? null;
}

/**
 * Check exclusion rules ("slotId.optionId" pairs) against the composition.
 */
export function isExcluded(entry: LayerEntry, composition: Composition): boolean {
  if (!entry.excludeWith || entry.excludeWith.length === 0) return false;
  return entry.excludeWith.some((pair) => {
    const [slotId, optionId] = pair.split('.');
    return composition[slotId] === optionId;
  });
}

export interface StackedLayer {
  slotId: string;
  entryId: string;
  file: string;
  zOrder: number;
  filter?: string;
  required?: boolean;
}

/**
 * Build the ordered layer stack for a manifest + composition.
 * Tints slots that declare `tintSlot` using the player's traits.
 * `tintOverrides` (e.g. wardrobe hex colours via hexToTint) win over genetics.
 */
export function buildLayerStack(
  manifest: LayerManifest,
  composition: Composition,
  traits: GeneticTraits | null,
  geneticsConfig: GeneticsConfig | null,
  tintOverrides?: Record<string, TintPaletteEntry> | null
): StackedLayer[] {
  const layers: StackedLayer[] = [];

  for (const slot of manifest.slots) {
    const entryId = composition[slot.id] ?? null;
    const entry = findEntry(manifest, slot.id, entryId);

    if (!entry || !entry.file || isExcluded(entry, composition)) {
      if (slot.required && slot.entries.length > 0) {
        // Required slot with no match → fall back to the first entry with a file
        const fallback = slot.entries.find((e) => e.file);
        if (fallback?.file) {
          layers.push({
            slotId: slot.id,
            entryId: fallback.id,
            file: `/layers/${fallback.file}`,
            zOrder: slot.zOrder,
            required: true,
          });
        }
      }
      continue;
    }

    let filter: string | undefined;
    if (slot.tintSlot) {
      const override = tintOverrides?.[slot.tintSlot];
      if (override) {
        filter = tintFilter(override);
      } else if (traits && geneticsConfig) {
        const tint = traitTint(slot.tintSlot, traits, geneticsConfig);
        if (tint) filter = tintFilter(tint);
      }
    }

    layers.push({
      slotId: slot.id,
      entryId: entry.id,
      file: `/layers/${entry.file}`,
      zOrder: slot.zOrder,
      filter,
      required: slot.required,
    });
  }

  return layers.sort((a, b) => a.zOrder - b.zOrder);
}
