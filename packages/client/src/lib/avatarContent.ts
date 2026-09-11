import type { GeneticsConfig, LayerManifest } from '@itsim/shared';

/**
 * Avatar content (genetics palettes + layered SVG manifest) fetched once per
 * session. The portrait, wardrobe and room all read the same pair; a shared
 * module cache keeps them from racing duplicate requests on every mount.
 */

export interface AvatarContent {
  genetics: GeneticsConfig | null;
  avatar: LayerManifest | null;
}

let cache: AvatarContent | null = null;
let inflight: Promise<AvatarContent> | null = null;

export function fetchAvatarContent(): Promise<AvatarContent> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = Promise.all([
      fetch('/api/content/genetics')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/content/layers')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([g, l]) => {
      cache = { genetics: g?.genetics ?? null, avatar: l?.avatar ?? null };
      return cache;
    });
  }
  return inflight;
}
