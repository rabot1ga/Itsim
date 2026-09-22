import type { GeneticsConfig, GeneticTraits, LayerManifest } from '@itsim/shared';
import { buildLayerStack, Composition } from './layers';

/**
 * Что именно рисует шаринг-карточка.
 *
 * Карточка обязана совпадать с «Домом» кадр в кадр, поэтому она не имеет своего
 * рендера комнаты: слои берутся тем же `buildLayerStack`, а геометрия кадра —
 * та же, что у CSS в `RoomRenderer` (фигура стоит на полу слева, 38 % ширины
 * кадра, 5 % от низа). Разъезд этих двух мест и есть тот класс брака, из-за
 * которого 38 webp-слоёв одежды не видел никто: компонент жил, а картинки в
 * приложении не было.
 */

/** Дольки кадра под фигурой — зеркало `left-[6%] bottom-[5%] w-[38%]` из RoomRenderer. */
const FIGURE = { left: 0.06, bottom: 0.05, width: 0.38 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawLayer {
  file: string;
  /** CSS-фильтр из `tintSlot`; canvas умеет его не везде — см. `supportsFilter` */
  filter?: string;
  /** координаты и размеры в долях кадра 0..1 */
  box: Box;
}

const FULL_FRAME: Box = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Бокс фигуры внутри кадра комнаты. Высота выводится из аспекта аватарного
 * канваса (500×760), а не зашивается: фигура не должна сплющиваться, если
 * комната станет другой пропорции.
 */
export function figureBox(
  avatarRes: { width: number; height: number },
  roomRes: { width: number; height: number }
): Box {
  const w = FIGURE.width;
  const h = w * (avatarRes.height / avatarRes.width) * (roomRes.width / roomRes.height);
  return { x: FIGURE.left, y: 1 - FIGURE.bottom - h, w, h };
}

export interface ShareSceneInput {
  roomManifest: LayerManifest;
  roomComposition: Composition;
  avatarManifest: LayerManifest;
  avatarComposition: Composition;
  traits: GeneticTraits | null;
  geneticsConfig: GeneticsConfig | null;
}

/**
 * Плоский список на слоёв, в порядке отрисовки: сначала комната, поверх неё
 * фигура. Порядок слотов не пересортировывается нарочно — клиент складывает их
 * ровно так же, и любое «улучшение» порядка рассинхронизирует карточку с игрой.
 */
export function shareSceneLayers(input: ShareSceneInput): DrawLayer[] {
  const room = buildLayerStack(input.roomManifest, input.roomComposition, input.traits, input.geneticsConfig);
  const avatar = buildLayerStack(input.avatarManifest, input.avatarComposition, input.traits, input.geneticsConfig);
  const box = figureBox(
    input.avatarManifest.resolution ?? { width: 500, height: 760 },
    input.roomManifest.resolution ?? { width: 1000, height: 1000 }
  );

  return [
    ...room.map((layer) => ({ file: layer.file, filter: layer.filter, box: FULL_FRAME })),
    ...avatar.map((layer) => ({ file: layer.file, filter: layer.filter, box })),
  ];
}
