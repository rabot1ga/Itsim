import React from 'react';
import { useGameStore } from '../store/gameStore';
import { RoomRenderer } from './room/RoomRenderer';
import { useRoomScene } from './room/useRoomScene';
import { gradeLabel } from '../lib/playerLabels';

/**
 * «Главная» → карточка комнаты (design.md §5, строка 1: «сцена комнаты, грейд и
 * день, тап → „Дом“»).
 *
 * Долгое время здесь лежал статичный эскиз `/art/story-v1/room.webp` с подписью
 * «твои предметы — в редакторе»: самый частый экран продукта показывал чужую
 * комнату, хотя плоский стек уже был собран. Теперь карточка берёт ровно тот же
 * `useRoomScene` + `RoomRenderer`, что и «Дом», поэтому второй реализацией
 * разъехаться не может. Эскиз остаётся фолбэком, пока контент не доехал.
 */
export const HomeRoomCard: React.FC = () => {
  const player = useGameStore((state) => state.player);
  const setView = useGameStore((state) => state.setView);
  const scene = useRoomScene();
  if (!player) return null;

  const day = player.currentDay ?? 1;

  return (
    <section className="room-card" aria-label="Твоя комната">
      <div className="room-card-head">
        <h2>
          <span aria-hidden="true">🛋</span>
          Комната
        </h2>
        <button onClick={() => setView('room')} aria-label="Обустроить комнату">
          Обустроить →
        </button>
      </div>
      {scene.ready ? (
        <button
          type="button"
          className="room-card-scene"
          onClick={() => setView('room')}
          aria-label={`Комната — день ${day}, открыть «Дом»`}
        >
          <RoomRenderer
            roomManifest={scene.roomManifest}
            avatarManifest={scene.avatarManifest}
            traits={scene.traits}
            geneticsConfig={scene.geneticsConfig}
            housingLevel={scene.housingLevel}
            composition={scene.roomComposition}
            avatarCustom={scene.avatarCustom}
            petWear={scene.petWear}
            petFed={scene.petFed}
          />
        </button>
      ) : (
        <img
          className="room-card-art"
          src="/art/story-v1/room.webp"
          alt="Иллюстрация комнаты разработчика: стол, компьютер, кресло и окно в ночной город"
          width={640}
          height={480}
        />
      )}
      <span className="room-card-caption">
        {scene.ready
          ? `${gradeLabel(player.grade)} · день ${day} · жильё ${scene.housingLevel}/4`
          : 'Эскиз комнаты · твои предметы и расстановка — в редакторе'}
      </span>
    </section>
  );
};
