import React, { useEffect, useMemo, useState } from 'react';
import { useIsoManifest } from './iso/IsoRoom';
import { characterLook, LookInput } from './iso/palette';
import { recolourSprite, variantKey } from './iso/recolor';

/** The same saved look as the room, framed at head/shoulder height, not a new identity. */
export const PlayerPortrait: React.FC<{
  player: LookInput & { telegramId?: number | string };
  size?: number;
}> = ({ player, size = 66 }) => {
  const manifest = useIsoManifest();
  const look = useMemo(() => characterLook({
    genetics: player.genetics,
    avatar: player.avatar,
    fallbackSeed: String(player.telegramId ?? 'player'),
  }), [player.genetics, player.avatar, player.telegramId]);
  const sprite = manifest?.sprites[look.base];
  const key = sprite ? variantKey(sprite.file, look.colours) : '';
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!sprite || !player.genetics) return;
    let alive = true;
    const job = sprite.roles
      ? recolourSprite(sprite.file, sprite.roles, look.colours)
      : Promise.resolve(sprite.file);
    job.then((url) => {
      if (alive) setResolved({ key, url });
    }).catch(() => { if (alive) setFailed(key); });
    return () => { alive = false; };
  }, [sprite, key, look, player.genetics]);

  const ready = player.genetics && sprite && resolved?.key === key && failed !== key;
  return (
    <div className="player-portrait" style={{ width: size, height: size }} data-portrait={ready ? 'saved' : 'fallback'}>
      {ready ? (
        <svg role="img" aria-label="Портрет твоего персонажа" viewBox={`0 0 ${sprite.w} ${sprite.w}`}>
          <image href={resolved.url} width={sprite.w} height={sprite.h} onError={() => setFailed(key)} />
        </svg>
      ) : (
        <img src="/art/story-v1/portrait.webp" alt="Стандартный портрет — внешность пока недоступна" width={size} height={size} />
      )}
    </div>
  );
};
