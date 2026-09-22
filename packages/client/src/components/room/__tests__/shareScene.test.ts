import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookTintOverrides, tintFilter, tintFromHex, traitTint } from '@itsim/shared';
import { avatarComposition, buildLayerStack } from '../layers';
import { figureBox, shareSceneLayers } from '../shareScene';

/**
 * Карточка для шеринга обязана совпадать с «Домом» кадр в кадр.
 *
 * Манифесты и генетика — настоящие файлы из packages/content: подмена пустыми
 * `{ slots: [] }` (как в smoke-тесте) этот класс брака ловить не умеет в
 * принципе. Два конкретных регресса, зафиксированных здесь:
 *
 * 1. карточка рисовала iso-комнату, пока приложение рисовало плоскую;
 * 2. композицию фигуры карточка собирала сама и теряла `eyes`/`body`. Тихо, а
 *    не крашем: `buildLayerStack` для required-слота откатывается на ПЕРВУЮ
 *    запись, поэтому вместо «без головы» игрок получал чужие глаза — у владельца
 *    `eye_legendary` на карточке был `eye_normal`. Отсюда одна базовая
 *    композиция на все поверхности (`avatarComposition`).
 */

const at = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8'));
const avatarManifest = at('../../../../../../packages/content/layers/avatar_manifest.json');
const roomManifest = at('../../../../../../packages/content/layers/room_manifest.json');
const genetics = at('../../../../../../packages/content/genetics.json');

const traits = {
  seed: 'share-scene',
  eyeShape: 'eye_legendary',
  hairStyle: 'hair_short',
  hairColor: 'hair_red',
  skinTone: 'skin_olive',
  wallColor: 'wall_blue',
  beard: 'beard_full',
  top: 'top_tshirt',
  accessory: 'acc_none',
} as never;

const roomComposition = {
  bg: 'bg_1',
  window: 'window_square',
  decor: 'decor_poster_js',
  desk: 'desk_ikea',
  chair: 'chair_stool',
  setup: 'setup_laptop',
  atmosphere: null,
  pet: 'pet_cat',
};

const scene = (avatar: Record<string, string>, avatarCustom: Record<string, string> | null = null) =>
  shareSceneLayers({
    roomManifest,
    roomComposition,
    avatarManifest,
    avatarComposition: avatarComposition(avatar as never, traits),
    traits,
    geneticsConfig: genetics,
    avatarCustom: avatarCustom as never,
  });

const files = (layers: { file: string }[]) => layers.map((l) => l.file.split('/').pop()!.replace('.webp', ''));

describe('шаринг-карточка = тот же слой, что и комната', () => {
  it('рисует плоский стек, а не iso-набор', () => {
    const layers = scene({ top: 'top_jacket', bottom: 'bottom_sweatpants' });
    expect(layers.length).toBeGreaterThan(1);
    for (const layer of layers) {
      expect(layer.file.startsWith('/layers/')).toBe(true);
      expect(layer.file).not.toContain('/iso/');
    }
  });

  it('комната складывается до фигуры, порядок — как в манифесте', () => {
    const layers = scene({});
    const firstFigure = layers.findIndex((l) => l.file.includes('avatar-v2'));
    const lastRoom = layers.map((l) => l.file).reduce((acc, f, i) => (f.includes('/room/') ? i : acc), -1);
    expect(lastRoom).toBeGreaterThanOrEqual(0);
    expect(firstFigure).toBeGreaterThan(lastRoom);
  });

  it('фигура одета по гардеробу, глаза — игрока, а не дефолт слота', () => {
    const ids = files(scene({ top: 'top_jacket', bottom: 'bottom_sweatpants' }));
    expect(ids).toContain('body_base');
    // eye_normal был бы тихим откатом required-слота: карточка рисовала бы не те глаза
    expect(ids).toContain('eye_legendary');
    expect(ids).not.toContain('eye_normal');
    expect(ids).toContain('top_jacket');
    expect(ids).toContain('bottom_sweatpants');
    // генетический top_tshirt перебит закупленным top_jacket — ровно как в комнате
    expect(ids).not.toContain('top_tshirt');
  });

  it('тинтуются только шкальные слои, одежда — нет', () => {
    const layers = scene({});
    const hair = layers.find((l) => l.file.endsWith('hair_short.webp'));
    const top = layers.find((l) => l.file.endsWith('top_hoodie_gray.webp') || l.file.endsWith('top_tshirt.webp'));
    expect(hair?.filter).toContain('sepia');
    expect(top?.filter).toBeUndefined();
  });

  it('выбранный цвет волос и кожи доезжает до карточки, цвет одежды — нет', () => {
    const custom = { hairColor: '#d7a94b', skin: '#8d5a3c', topColor: '#123456' };
    const layers = scene({}, custom);
    const hair = layers.find((l) => /avatar-v2\/hair_/.test(l.file));
    // Ручной цвет бьёт генетику (в трейтах стоит hair_red) — иначе «Цвета» в
    // гардеробе оставались бы рядом для изо-бюста.
    expect(hair?.filter).toBe(tintFilter(tintFromHex('#d7a94b')!));
    expect(hair?.filter).not.toBe(tintFilter(traitTint('hairColor', traits as never, genetics)!));
    expect(scene({}).find((l) => /avatar-v2\/hair_/.test(l.file))?.filter).not.toBe(hair?.filter);
    // борода сидит на том же tintSlot → её красит тот же ряд
    const beard = layers.find((l) => /avatar-v2\/beard_/.test(l.file));
    if (beard) expect(beard.filter).toBe(hair?.filter);
    // тон кожи — отдельный ряд, тоже доходит
    expect(layers.find((l) => l.file.includes('body_base'))?.filter).toBe(tintFilter(tintFromHex('#8d5a3c')!));
    // слои одежды предокрашены: grayscale-мастеров под topColor нет, красить нечего
    expect(layers.find((l) => /avatar-v2\/top_/.test(l.file))?.filter).toBeUndefined();
  });

  it('карточка и комната красятся побайтово одинаково', () => {
    const custom = { hairColor: '#2b2320', skin: '#f5c6a0' };
    const card = scene({ top: 'top_jacket' }, custom)
      .filter((l) => l.file.includes('avatar-v2'))
      .map((l) => l.filter);
    const room = buildLayerStack(
      avatarManifest,
      avatarComposition({ top: 'top_jacket' } as never, traits),
      traits,
      genetics,
      lookTintOverrides(custom as never)
    ).map((l) => l.filter);
    expect(card).toEqual(room);
  });

  it('слой без файла (acc_none, hair_bald) не попадает в кадр', () => {
    const ids = files(scene({ accessory: 'acc_none', hair: 'hair_bald' }));
    expect(ids).not.toContain('acc_none');
    expect(ids).not.toContain('hair_bald');
  });
});

describe('бокс фигуры внутри кадра', () => {
  it('высокая фигура в квадратной комнате занимает 38 % ширины и стоит на полу', () => {
    const box = figureBox({ width: 500, height: 760 }, { width: 1000, height: 1000 });
    expect(box.x).toBeCloseTo(0.06, 6);
    expect(box.w).toBeCloseTo(0.38, 6);
    expect(box.h).toBeCloseTo(0.38 * (760 / 500), 6);
    expect(box.y + box.h).toBeCloseTo(0.95, 6); // 5 % от низа
  });

  it('аспект комнаты учитывается, а не игнорируется', () => {
    const wide = figureBox({ width: 500, height: 760 }, { width: 1000, height: 800 });
    const square = figureBox({ width: 500, height: 760 }, { width: 1000, height: 1000 });
    expect(wide.h).toBeCloseTo(square.h * (1000 / 800), 6);
  });

  it('композиция из карточки и из `buildLayerStack` даёт одни и те же слои', () => {
    const avatar = avatarComposition({ top: 'top_jacket' } as never, traits);
    const stack = buildLayerStack(avatarManifest, avatar, traits, genetics).map((l) => l.file);
    const inScene = scene({ top: 'top_jacket' })
      .filter((l) => l.file.includes('avatar-v2'))
      .map((l) => l.file);
    expect(inScene).toEqual(stack);
  });
});
