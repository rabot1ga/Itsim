import { useEffect, useMemo, useState } from 'react';
import { DrawCall, SpriteMeta } from './geometry';
import { recolourSprite, variantKey } from './recolor';

/**
 * Iso-манифест: список спрайтов и их цветовых ролей (`/iso/manifest.json`).
 *
 * Живёт отдельным модулем с тех пор, как комната игрока переехала на плоский
 * слоистый рендер (`RoomRenderer`): сами спрайты по-прежнему нужны офису
 * (`IsoOffice`), HUD-портрету (`PlayerPortrait`) и карточке шеринга
 * (`canvas.drawIsoRoom`), а React-компонент iso-комнаты остался без mount-точек.
 */

export interface IsoManifest {
  tile: { w: number; h: number; wallH: number };
  sprites: Record<string, SpriteMeta>;
}

let manifestCache: IsoManifest | null = null;
let manifestPromise: Promise<IsoManifest | null> | null = null;

export function useIsoManifest(): IsoManifest | null {
  const [manifest, setManifest] = useState<IsoManifest | null>(manifestCache);

  useEffect(() => {
    if (manifestCache) return;
    if (!manifestPromise) {
      manifestPromise = fetch('/iso/manifest.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    let alive = true;
    manifestPromise.then((m) => {
      if (!alive) return;
      if (m) manifestCache = m;
      setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return manifest;
}

/**
 * Resolve every recoloured sprite in the scene to a data URL. Until a variant
 * is ready the original file is drawn, so the room never flashes empty.
 */
export function useSpriteVariants(calls: DrawCall[], sprites: Record<string, SpriteMeta>): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const wanted = useMemo(
    () =>
      calls
        .filter((c) => c.colours && sprites[c.sprite]?.roles)
        .map((c) => ({ key: variantKey(sprites[c.sprite].file, c.colours!), call: c })),
    [calls, sprites]
  );

  const signature = wanted.map((w) => w.key).join('|');

  useEffect(() => {
    let alive = true;
    Promise.all(
      wanted.map(async ({ key, call }) => {
        const meta = sprites[call.sprite];
        const url = await recolourSprite(meta.file, meta.roles!, call.colours!);
        return [key, url] as const;
      })
    ).then((pairs) => {
      if (!alive) return;
      setUrls((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [key, url] of pairs) {
          if (next[key] !== url) {
            next[key] = url;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      alive = false;
    };
    // `signature` captures every variant this scene needs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls;
}
