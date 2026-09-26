import { useEffect, useState } from 'react';
import type { GeneticsConfig, LayerManifest } from '@itsim/shared';

/**
 * Контент слоёв (манифесты аватара и комнаты + конфиг генетики) для
 * поверхностей вне «Дома»: «Главная» рисует комнату, «Профиль» — фигуру,
 * превью гардероба — то и другое.
 *
 * Кэшируется на уровне модуля ровно как `useIsoManifest`: манифесты — статика,
 * второй запрос на каждый экран не нужен. Один источник для всех экранов —
 * иначе рано или поздно появится вторая реализация сборки сцены, и они
 * разъедутся (именно так карточка шеринга и рисовала не ту комнату).
 */
export interface LayerContent {
  avatarManifest: LayerManifest | null;
  roomManifest: LayerManifest | null;
  geneticsConfig: GeneticsConfig | null;
}

const EMPTY: LayerContent = { avatarManifest: null, roomManifest: null, geneticsConfig: null };

let cache: LayerContent | null = null;
let pending: Promise<LayerContent> | null = null;

async function load(): Promise<LayerContent> {
  const [layers, genetics] = await Promise.all([
    fetch('/api/content/layers').then((r) => (r.ok ? r.json() : null)),
    fetch('/api/content/genetics').then((r) => (r.ok ? r.json() : null)),
  ]);
  return {
    avatarManifest: layers?.avatar ?? null,
    roomManifest: layers?.room ?? null,
    geneticsConfig: genetics?.genetics ?? null,
  };
}

export function useLayerContent(): LayerContent {
  const [content, setContent] = useState<LayerContent>(cache ?? EMPTY);

  useEffect(() => {
    if (cache) return;
    if (!pending)
      pending = load()
        .then((c) => {
          if (c.avatarManifest && c.roomManifest && c.geneticsConfig) cache = c;
          return c;
        })
        .catch(() => EMPTY);
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
