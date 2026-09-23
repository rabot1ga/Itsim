import { useEffect, useMemo, useState } from 'react';
import type { AvatarCustomization, GeneticTraits, LayerManifest } from '@itsim/shared';
import type { GeneticsConfig } from '@itsim/shared';
import { useGameStore } from '../../store/gameStore';
import { buildRoomComposition } from './RoomRenderer';
import { Composition, avatarComposition } from './layers';
import { useLayerContent } from './useLayerContent';

/**
 * Собранный «дом»: манифесты + композиция комнаты + композиция фигуры — одной
 * функцией для всех экранов.
 *
 * Пока сцена собиралась внутри `RoomView`, каждая новая поверхность пристроила
 * свой вариант: карточка шеринга рисовала iso-комнату, «Главная» до сих пор
 * показывает статичный эскиз вместо комнаты игрока. Здесь сборка одна, и
 * экраны физически берут один и тот же список слоёв — разъехаться уже нечем.
 */

export interface CrossCollectionEntry {
  collectionId: string;
  layerId: string;
  nftType: string;
}

export interface CrossCollectionEntry {
  collectionId: string;
  layerId: string;
  nftType: string;
}

/** Всё, что нужно плоскому рендеру комнаты; поля non-null по построению. */
export interface RoomSceneReady {
  roomManifest: LayerManifest;
  avatarManifest: LayerManifest;
  geneticsConfig: GeneticsConfig;
  /** черты с учётом перекраски стен: `player.room.wallColor` бьёт генетику */
  traits: GeneticTraits;
  roomComposition: Composition;
  figureComposition: Composition;
  /** выбор гардероба, включая ручные цвета (тон кожи, волосы) */
  avatarCustom: AvatarCustomization | null;
  petWear: string[];
  petFed: boolean;
  housingLevel: number;
}

export type RoomScene = ({ ready: false } | ({ ready: true } & RoomSceneReady)) & {
  /** каталог кросс-коллекций — нужен секции синергий на «Доме» */
  crossCollections: CrossCollectionEntry[];
};

let crossCache: CrossCollectionEntry[] | null = null;
let crossPending: Promise<CrossCollectionEntry[]> | null = null;

function loadCrossCollections(): Promise<CrossCollectionEntry[]> {
  if (!crossPending) {
    crossPending = fetch('/api/content/cross-collections')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => (c?.crossCollections?.collections ?? []) as CrossCollectionEntry[])
      .catch(() =>
        // Кросс-коллекции украшают сцену, а не определяют её: без них комната
        // собирается как есть, просто чужие NFT не подсвечиваются.
        [] as CrossCollectionEntry[]
      );
  }
  return crossPending;
}

export function useRoomScene(): RoomScene {
  const player = useGameStore((s) => s.player);
  const heldCollections = useGameStore((s) => s.heldCollections);
  const { avatarManifest, roomManifest, geneticsConfig } = useLayerContent();
  const [crossCollections, setCrossCollections] = useState<CrossCollectionEntry[]>(crossCache ?? []);

  useEffect(() => {
    if (crossCache) return;
    let alive = true;
    loadCrossCollections().then((list) => {
      crossCache = list;
      if (alive) setCrossCollections(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const genetics = player?.genetics ?? null;
  const contentReady = Boolean(avatarManifest && roomManifest && geneticsConfig && genetics);

  // Перекраска стен перекрывает генетический tint везде, где рисуется комната.
  // useMemo — не косметика: новый объект на каждый рендер сбрасывал бы
  // мемоизацию композиции ниже, а значит комната пересобиралась бы при любом
  // изменении стора.
  const traits: GeneticTraits | null = useMemo(
    () => (genetics && player?.room?.wallColor ? { ...genetics, wallColor: player.room.wallColor } : genetics),
    [genetics, player?.room?.wallColor]
  );

  const crossLayers = useMemo(
    () =>
      (crossCollections ?? [])
        .filter((c) => (heldCollections ?? []).includes(c.collectionId))
        .map((c) => ({
          layerId: c.layerId,
          slotId: c.nftType === 'decor' ? 'decor' : c.nftType === 'pet' ? 'pet' : 'decor',
        })),
    [crossCollections, heldCollections]
  );

  const roomComposition = useMemo(
    () =>
      contentReady && traits
        ? buildRoomComposition({
            traits,
            housingLevel: player?.housingLevel ?? 0,
            items: player?.items ?? [],
            crossLayers,
            custom: player?.room ?? null,
          })
        : null,
    [contentReady, traits, crossLayers, player?.housingLevel, player?.items, player?.room]
  );

  const figureComposition = useMemo(
    () => (contentReady && traits ? avatarComposition(player?.avatar ?? null, traits) : null),
    [contentReady, traits, player?.avatar]
  );

  if (!contentReady || !traits || !roomComposition || !figureComposition || !roomManifest || !avatarManifest || !geneticsConfig) {
    return { ready: false, crossCollections };
  }

  return {
    ready: true,
    crossCollections,
    roomManifest,
    avatarManifest,
    geneticsConfig,
    traits,
    roomComposition,
    figureComposition,
    avatarCustom: player?.avatar ?? null,
    petWear: (player?.items ?? []).filter((id: string) => id.startsWith('pet_')),
    petFed: Boolean(player?.petFedToday),
    housingLevel: player?.housingLevel ?? 0,
  };
}
