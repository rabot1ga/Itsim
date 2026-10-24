import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { ROOM_TIERS, ROOM_TIER_META, roomArtwork, roomTierOf } from '../lib/roomArt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(__dirname, '..', '..', 'public', 'art', 'room');

describe('roomTierOf', () => {
  it('растит комнату вместе с жильём (переезд меняет сцену)', () => {
    expect(roomTierOf(0)).toBe('start'); // общага
    expect(roomTierOf(1)).toBe('cozy'); // однушка на окраине
    expect(roomTierOf(2)).toBe('work'); // квартира в центре
    expect(roomTierOf(3)).toBe('dream'); // своя квартира (ипотека)
    expect(roomTierOf(4)).toBe('dream'); // пентхаус
  });

  it('неизвестный уровень (битый сейв, мок без поля) — тоже start, не dream', () => {
    expect(roomTierOf(undefined as unknown as number)).toBe('start');
    expect(roomTierOf(-1)).toBe('start');
    expect(roomTierOf(99)).toBe('start');
    expect(roomTierOf(1.5)).toBe('start');
  });
});

describe('roomArtwork', () => {
  it('maps tiers to /art/room/<tier>.webp', () => {
    for (const tier of ROOM_TIERS) {
      expect(roomArtwork(tier)).toBe(`/art/room/${tier}.webp`);
    }
  });

  it('ships a scene per tier with full meta', () => {
    const files = readdirSync(ART_DIR)
      .filter((f) => f.endsWith('.webp'))
      .sort();
    expect(files).toEqual(['cozy.webp', 'dream.webp', 'start.webp', 'work.webp']);
    for (const tier of ROOM_TIERS) {
      expect(ROOM_TIER_META[tier].title.length).toBeGreaterThan(0);
      expect(ROOM_TIER_META[tier].tagline.length).toBeGreaterThan(0);
      expect(ROOM_TIER_META[tier].description.length).toBeGreaterThan(0);
    }
  });
});
