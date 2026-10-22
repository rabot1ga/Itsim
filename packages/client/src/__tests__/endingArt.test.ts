import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { endingArtwork } from '../lib/endingArt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(__dirname, '..', '..', 'public', 'art', 'endings');

describe('endingArtwork', () => {
  it('maps ending ids to /art/endings/<id>.webp', () => {
    expect(endingArtwork('cto')).toBe('/art/endings/cto.webp');
    expect(endingArtwork('teacher')).toBe('/art/endings/teacher.webp');
    expect(endingArtwork('left_it')).toBe('/art/endings/left_it.webp');
  });

  it('aliases the saved careerEnding "corporate_god" to the cto scene', () => {
    expect(endingArtwork('corporate_god')).toBe('/art/endings/cto.webp');
  });

  it('ships exactly one scene per ending of balance.endings', () => {
    const files = readdirSync(ART_DIR)
      .filter((f) => f.endsWith('.webp'))
      .sort();
    expect(files).toEqual([
      'burnout.webp',
      'cto.webp',
      'exit.webp',
      'free_artist.webp',
      'left_it.webp',
      'teacher.webp',
    ]);
  });
});
