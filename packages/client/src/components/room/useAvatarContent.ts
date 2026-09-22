import { useEffect, useState } from 'react';
import type { GeneticsConfig, LayerManifest } from '@itsim/shared';

/**
 * Аватарный контент (манифест слоёв + конфиг генетики) для поверхностей вне
 * «Дома» — «Профиля» и любых будущих экранов, которым нужен полнофигурный
 * слоистый персонаж.
 *
 * Кэшируется на уровне модуля ровно как `useIsoManifest`: манифесты — статика,
 * второй запрос на каждый экран не нужен.
 */
export interface AvatarContent {
  avatarManifest: LayerManifest | null;
  geneticsConfig: GeneticsConfig | null;
}

let cache: AvatarContent | null = null;
let pending: Promise<AvatarContent> | null = null;

async function load(): Promise<AvatarContent> {
  const [layers, genetics] = await Promise.all([
    fetch('/api/content/layers').then((r) => (r.ok ? r.json() : null)),
    fetch('/api/content/genetics').then((r) => (r.ok ? r.json() : null)),
  ]);
  return {
    avatarManifest: layers?.avatar ?? null,
    geneticsConfig: genetics?.genetics ?? null,
  };
}

export function useAvatarContent(): AvatarContent {
  const [content, setContent] = useState<AvatarContent>(cache ?? { avatarManifest: null, geneticsConfig: null });

  useEffect(() => {
    if (cache) return;
    if (!pending)
      pending = load()
        .then((c) => {
          if (c.avatarManifest && c.geneticsConfig) cache = c;
          return c;
        })
        .catch(() => ({ avatarManifest: null, geneticsConfig: null }));
    let alive = true;
    pending.then((c) => {
      if (alive) setContent(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return content;
}
