import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';

/** Frontal reference illustration. The live saved layout remains in the room editor. */
export const HomeRoomCard: React.FC = () => {
  const player = useGameStore((state) => state.player);
  const setView = useGameStore((state) => state.setView);
  if (!player) return null;

  return (
    <section className="reference-room" aria-label="Твоя комната">
      <div className="reference-room-heading">
        <h2>Комната</h2>
        <button onClick={() => setView('room')} aria-label="Обустроить комнату">
          Обустроить <PixelIcon name="arrow" size={9} />
        </button>
      </div>
      <img
        src="/art/story-v1/room.webp"
        alt="Иллюстрация комнаты разработчика: стол, компьютер, кресло и окно в ночной город"
        width={640}
        height={480}
      />
      <span className="reference-room-caption">Эскиз комнаты · твои предметы и расстановка — в редакторе</span>
    </section>
  );
};
