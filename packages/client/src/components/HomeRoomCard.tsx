import React from 'react';
import { useGameStore } from '../store/gameStore';

/** Home preview of the room; tapping the header opens the full editor. */
export const HomeRoomCard: React.FC = () => {
  const player = useGameStore((state) => state.player);
  const setView = useGameStore((state) => state.setView);
  if (!player) return null;

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
      <img
        src="/art/story-v1/room.webp"
        alt="Иллюстрация комнаты разработчика: стол, компьютер, кресло и окно в ночной город"
        width={640}
        height={480}
      />
      <span className="room-card-caption">Эскиз комнаты · твои предметы и расстановка — в редакторе</span>
    </section>
  );
};
