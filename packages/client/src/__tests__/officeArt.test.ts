import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { OFFICE_TIERS, OFFICE_TIER_META, officeArtwork, officeTierOf } from '../lib/officeArt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(__dirname, '..', '..', 'public', 'art', 'office');

describe('officeTierOf', () => {
  it('растёт той же лестницей, что и комната', () => {
    expect(officeTierOf('unemployed')).toBe('openspace');
    expect(officeTierOf('intern')).toBe('openspace');
    expect(officeTierOf('junior')).toBe('openspace');
    expect(officeTierOf('middle')).toBe('cabinet');
    expect(officeTierOf('senior')).toBe('floor');
    expect(officeTierOf('teamlead')).toBe('tower');
    expect(officeTierOf('architect')).toBe('tower');
    expect(officeTierOf('cto')).toBe('tower');
  });

  it('неизвестный грейд — опенспейс, не «верхний этаж»', () => {
    expect(officeTierOf(undefined as unknown as string)).toBe('openspace');
    expect(officeTierOf('principal')).toBe('openspace');
  });
});

describe('officeArtwork', () => {
  it('maps tiers to /art/office/<tier>.webp', () => {
    for (const tier of OFFICE_TIERS) {
      expect(officeArtwork(tier)).toBe(`/art/office/${tier}.webp`);
    }
  });

  it('ships a scene per tier with full meta', () => {
    const files = readdirSync(ART_DIR);
    for (const tier of OFFICE_TIERS) {
      expect(files).toContain(`${tier}.webp`);
      const meta = OFFICE_TIER_META[tier];
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.tagline.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(20);
    }
  });
});
