import React, { useEffect, useMemo, useState } from 'react';
import type { GeneticTraits } from '@itsim/shared';
import { fetchAvatarContent, type AvatarContent } from '../lib/avatarContent';
import { tintOverridesFromAvatar } from '../lib/hexTint';
import { ProceduralAvatar } from './room/ProceduralAvatar';

/**
 * Saved player portrait — one identity everywhere.
 *
 * Unification (2026-09): the head shot is the layered SVG figure (body,
 * eyes, hair, beard, top, accessory) built from the player's genetics, plus
 * whatever the wardrobe overwrote — the same avatar the profile and the
 * wardrobe preview draw in full. Previously the HUD recoloured an isometric
 * scene sprite, so the player looked like a different person in the room
 * than on the portrait.
 *
 * The figure's canvas is 500×760; for a square frame we scale it up and
 * crop to head and shoulders (head centre at 250,160 per body/base.svg).
 */

/** Head + shoulders window of the 500×760 canvas: (125,55)–(375,305). */
const CROP_X = 125;
const CROP_Y = 55;
const CROP_SIZE = 250;

type PortraitPlayer = {
  genetics?: GeneticTraits | null;
  avatar?: Partial<
    Record<'hair' | 'beard' | 'top' | 'bottom' | 'accessory' | 'skin' | 'hairColor', string | null>
  > | null;
  telegramId?: number | string;
};

export const PlayerPortrait: React.FC<{
  player: PortraitPlayer;
  size?: number;
}> = ({ player, size = 66 }) => {
  const [content, setContent] = useState<AvatarContent | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAvatarContent().then((c) => {
      if (alive) setContent(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const traits = player.genetics ?? null;
  const overrides = useMemo(() => player.avatar ?? {}, [player.avatar]);
  const layers = useMemo(() => {
    if (!traits || !content?.avatar || !content.genetics) return null;
    return buildFixedComposition(traits, overrides);
  }, [traits, content, overrides]);
  const tintOverrides = useMemo(() => tintOverridesFromAvatar(overrides), [overrides]);

  // A new look gets a fresh chance at rendering; a broken layer → honest default.
  const lookKey = `${traits?.seed ?? ''}:${JSON.stringify(overrides)}`;
  useEffect(() => setBroken(false), [lookKey]);

  const avatarManifest = content?.avatar ?? null;
  const geneticsCfg = content?.genetics ?? null;
  const ready = Boolean(traits && layers && avatarManifest && geneticsCfg) && !broken;
  const scale = size / CROP_SIZE;

  return (
    <div className="player-portrait" style={{ width: size, height: size }} data-portrait={ready ? 'saved' : 'fallback'}>
      {ready && traits && layers && avatarManifest && geneticsCfg ? (
        <div
          role="img"
          aria-label="Портрет твоего персонажа"
          className="portrait-svg-avatar"
          style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}
          onErrorCapture={() => setBroken(true)}
        >
          <div
            style={{
              position: 'absolute',
              width: 500 * scale,
              height: 760 * scale,
              left: -CROP_X * scale,
              top: -CROP_Y * scale,
            }}
          >
            <ProceduralAvatar
              manifest={avatarManifest}
              traits={traits}
              geneticsConfig={geneticsCfg}
              compositionOverrides={layers}
              tintOverrides={tintOverrides}
              className="w-full h-full"
            />
          </div>
        </div>
      ) : (
        <img src="/art/story-v1/portrait.webp" alt="Стандартный портрет — внешность пока недоступна" width={size} height={size} />
      )}
    </div>
  );
};

/** Layered composition: genetics propose, the wardrobe disposes. */
function buildFixedComposition(
  traits: GeneticTraits,
  overrides: NonNullable<PortraitPlayer['avatar']>
): Record<string, string | null> {
  return {
    body: 'body_base',
    eyes: traits.eyeShape ?? 'eye_normal',
    hair: overrides.hair ?? traits.hairStyle ?? 'hair_short',
    beard: overrides.beard ?? traits.beard ?? null,
    top: overrides.top ?? traits.top ?? 'top_hoodie_gray',
    bottom: overrides.bottom ?? 'bottom_jeans',
    accessory: overrides.accessory ?? traits.accessory ?? null,
  };
}
