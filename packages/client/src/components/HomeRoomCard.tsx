import React from 'react';
import { useGameStore } from '../store/gameStore';
import { IsoRoom } from './iso/IsoRoom';
import { PixelIcon } from './pixel/PixelIcon';

/** The actual saved room, not a reference screenshot or a second player state. */
export const HomeRoomCard: React.FC = () => {
  const player = useGameStore((state) => state.player);
  const setView = useGameStore((state) => state.setView);
  if (!player) return null;

  return (
    <section className="home-room-card" aria-label="Твоя комната">
      <div className="home-room-heading">
        <div>
          <span className="home-room-kicker">Твой маленький IT-мир</span>
          <h2>Комната</h2>
        </div>
        <button className="btn btn-secondary" onClick={() => setView('room')}>
          Обустроить <PixelIcon name="arrow" size={10} />
        </button>
      </div>
      <IsoRoom player={player} className="home-room-scene" />
      <div className="home-room-shortcuts">
        <button onClick={() => setView('career')}>
          <PixelIcon name="briefcase" size={13} />
          Работа
        </button>
        <button onClick={() => setView('skills')}>
          <PixelIcon name="book" size={13} />
          Учёба
        </button>
        <button onClick={() => setView('shop')}>
          <PixelIcon name="bag" size={13} />
          Магазин
        </button>
      </div>
    </section>
  );
};
