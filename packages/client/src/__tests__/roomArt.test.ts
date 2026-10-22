import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { ROOM_TIERS, ROOM_TIER_META, roomArtwork, roomTierOf } from '../lib/roomArt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(__dirname, '..', '..', 'public', 'art', 'room');

describe('roomTierOf', () => {
  it('растит комнату вместе с грейдом', () => {
    expect(roomTierOf('intern')).toBe('start');
    expect(roomTierOf('junior')).toBe('start');
    expect(roomTierOf('middle')).toBe('cozy');
    expect(roomTierOf('senior')).toBe('work');
    expect(roomTierOf('teamlead')).toBe('dream');
    expect(roomTierOf('architect')).toBe('dream');
    expect(roomTierOf('cto')).toBe('dream');
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
