import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ROOM_TIER_META, roomArtwork, roomTierOf } from '../lib/roomArt';

/**
 * Комната на «Главной»: миниатюра текущего тира + настроение одной строкой.
 * Действия комнаты живут во вкладке «Дом» (карточка события), здесь только
 * ощущение дома: сцена, тир, подпись.
 */
export const HomeRoomCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  if (!player) return null;

  const tier = roomTierOf(player.grade);
  const meta = ROOM_TIER_META[tier];

  return (
    <div className="card card-sm space-y-2">
      <img
        className="room-thumb"
        src={roomArtwork(tier)}
        alt=""
        width={512}
        height={384}
        loading="lazy"
        decoding="async"
        onError={(ev) => {
          ev.currentTarget.style.display = 'none';
        }}
      />
      <p className="text-sm font-semibold leading-tight">{meta.title}</p>
      <p className="text-2xs text-ink-500">{meta.tagline}</p>
      <p className="text-2xs text-ink-500">Действия комнаты — во вкладке «Дом».</p>
    </div>
  );
};
