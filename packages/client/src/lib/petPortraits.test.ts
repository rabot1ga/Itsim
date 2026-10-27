import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PET_PORTRAITS, petPortrait } from './petPortraits';
import { PET_SKIN_EMOJI } from './petSkins';

// Ассеты — часть контракта: генератор (tools/pet-portraits-gen.mjs) обязан
// класть файл ровно по тому пути, который отдаёт petPortrait().
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/art/pet-v1');

describe('petPortraits', () => {
  it('отдаёт /art/pet-v1/<id>.png для известных питомцев', () => {
    expect(petPortrait('pet_robo')).toBe('/art/pet-v1/pet_robo.png');
    expect(petPortrait('pet_fox')).toBe('/art/pet-v1/pet_fox.png');
  });

  it('неизвестный id и undefined дают null — комната падает на эмодзи-скин', () => {
    expect(petPortrait('nope')).toBeNull();
    expect(petPortrait(undefined)).toBeNull();
    expect(petPortrait('')).toBeNull();
  });

  it('покрывает все скины питомцев и все ассеты на диске', () => {
    const skinIds = Object.keys(PET_SKIN_EMOJI);
    expect([...PET_PORTRAITS].sort()).toEqual(skinIds.sort());

    const files = readdirSync(ASSET_DIR).filter((f) => f.endsWith('.png'));
    expect(files.sort()).toEqual(PET_PORTRAITS.map((id) => `${id}.png`).sort());
  });
});
