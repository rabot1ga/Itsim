import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROFILE_MOODS, PROFILE_MOOD_META, profileArtwork, profileMoodOf } from '../lib/profileArt';

const artDir = fileURLToPath(new URL('../../public/art/profile', import.meta.url));

describe('profileMoodOf', () => {
  it('выгорание перекрывает усталость и норму', () => {
    expect(profileMoodOf({ energy: 10, maxEnergy: 16, motivation: 80, burnoutDays: 2 })).toBe('burnout');
    expect(profileMoodOf({ energy: 10, maxEnergy: 16, motivation: 24 })).toBe('burnout');
  });

  it('усталость — энергия на трети шкалы и ниже', () => {
    // maxEnergy 15 → порог round(15/3)=5
    expect(profileMoodOf({ energy: 5, maxEnergy: 15, motivation: 60 })).toBe('tired');
    expect(profileMoodOf({ energy: 6, maxEnergy: 15, motivation: 60 })).toBe('normal');
  });

  it('порог не падает ниже 2 даже на короткой шкале', () => {
    expect(profileMoodOf({ energy: 2, maxEnergy: 4, motivation: 60 })).toBe('tired');
    expect(profileMoodOf({ energy: 3, maxEnergy: 4, motivation: 60 })).toBe('normal');
  });

  it('без burnoutDays поле необязательно', () => {
    expect(profileMoodOf({ energy: 12, maxEnergy: 16, motivation: 70 })).toBe('normal');
  });
});

describe('арт настроений', () => {
  it('в каталоге ровно три настроения и ничего лишнего', () => {
    expect(
      readdirSync(artDir)
        .filter((f) => f.endsWith('.webp'))
        .sort()
    ).toEqual([...PROFILE_MOODS].map((m) => `${m}.webp`).sort());
  });

  it('каждый баннер — непустой webp', () => {
    for (const mood of PROFILE_MOODS) {
      const buf = readFileSync(`${artDir}/${mood}.webp`);
      expect(buf.length).toBeGreaterThan(4000);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    }
  });

  it('artwork() ведёт в опубликованный каталог, у каждого настроения есть копи-строка', () => {
    for (const mood of PROFILE_MOODS) {
      expect(profileArtwork(mood)).toBe(`/art/profile/${mood}.webp`);
      expect(PROFILE_MOOD_META[mood].label.length).toBeGreaterThan(0);
      expect(PROFILE_MOOD_META[mood].line.length).toBeGreaterThan(20);
    }
  });
});
