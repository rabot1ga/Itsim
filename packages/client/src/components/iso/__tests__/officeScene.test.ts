import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOfficeScene } from '../office';
import { SpriteMeta, TILE } from '../geometry';

/**
 * Инварианты изо-сцены офиса.
 *
 * раньше здесь же лежали 11 тестов `buildRoomScene` (аллокатор жилья, обещанная
 * уровнем мебель, миска питомца). С 23.09.2026 комната плоская и слоистая, её
 * собирает `room/RoomRenderer` из манифеста, а генератор изо-комнаты удалён
 * вместе с палитрами отделки (`iso/scene.ts`, `iso/styles.ts`): он больше
 * ничего не рисовал в приложении, а тесты на «мебель не наезжает друг на друга»
 * плоской комнате не нужны — там порядок слоёв задан в манифесте.
 *
 * Офис остаётся изо (см. docs/iso.md), поэтому аллокатор и его инварианты — при
 * нём.
 */

const manifest = JSON.parse(
  fs.readFileSync(new URL('../../../../public/iso/manifest.json', import.meta.url), 'utf8')
) as {
  tile: typeof TILE;
  sprites: Record<string, SpriteMeta>;
};

const SPRITES = manifest.sprites;

describe('buildOfficeScene', () => {
  const kinds: Array<['garage' | 'cowork' | 'product' | 'corp', string]> = [
    ['garage', 'startup'],
    ['cowork', 'outsource'],
    ['product', 'product'],
    ['corp', 'enterprise'],
  ];

  it('never overlaps, always has desks and a place for the team', () => {
    for (const [kind, companySize] of kinds) {
      const scene = buildOfficeScene({ companySize, seed: 'office-seed', teamSize: 4 }, SPRITES, manifest.tile);
      const floors = new Set(scene.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
      expect(floors.has('office_sofa'), kind).toBe(true);
      expect(floors.has('desk_office'), kind).toBe(true);
      const desks = scene.items.filter((i) => i.kind === 'floor' && i.sprite === 'desk_office').length;
      // every office places at least a row of two desks; bigger companies more
      expect(desks, kind).toBeGreaterThanOrEqual(2);
      for (const item of scene.items) expect(SPRITES[item.sprite], item.sprite).toBeDefined();
      expect(scene.crew.length, kind).toBeGreaterThan(0);
    }
  });

  it('keeps the garage scrappy and the corporation big', () => {
    const corp = buildOfficeScene({ companySize: 'enterprise', seed: 'x', teamSize: 6 }, SPRITES, manifest.tile);
    const corpFloors = new Set(corp.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
    expect(corpFloors.has('meeting_table')).toBe(true);
    expect(corp.size.w).toBeGreaterThan(9);

    const garage = buildOfficeScene({ companySize: 'startup', seed: 'x', teamSize: 2 }, SPRITES, manifest.tile);
    const garageFloors = new Set(garage.items.filter((i) => i.kind === 'floor').map((i) => i.sprite));
    expect(garageFloors.has('boxes')).toBe(true);
    expect(garageFloors.has('pizza_boxes')).toBe(true);
    expect(garageFloors.has('meeting_table')).toBe(false);
  });
});
