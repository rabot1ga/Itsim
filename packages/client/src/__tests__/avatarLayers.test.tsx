import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { tintFilter, tintFromHex } from '@itsim/shared';

/**
 * Слоистый аватар обязан быть примонтирован, а не только существовать.
 *
 * Ровно так и лежал брак: `ProceduralAvatar` + `RoomRenderer` были в репозитории,
 * собирались стражем, публиковались в `public/layers/avatar-v2/` — и ни один
 * экран их не рендерил, поэтому 38 откалиброванных слоёв (вся одежда, все низы,
 * все причёски) игрок не видел никогда. Smoke-тест этого не поймал: он подсовывал
 * пустые манифесты (`{ avatar: { slots: [] } }`) и проверял только «не упало».
 *
 * Здесь манифесты — настоящие файлы из `packages/content`, так что тест падает,
 * как только ссылка на слой пропадает из любого из двух мест: «Дом» (фигура в
 * комнате) или «Профиль» (портрет).
 */

const at = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8'));
const avatarManifest = at('../../../../packages/content/layers/avatar_manifest.json');
const roomManifest = at('../../../../packages/content/layers/room_manifest.json');
const officeManifest = at('../../../../packages/content/layers/office_manifest.json');
const genetics = at('../../../../packages/content/genetics.json');

// гардероб должен побеждать генетику — проверяем это на id, которых в генетике нет
const player = {
  version: 3,
  telegramId: 1,
  currentDay: 5,
  money: 5000,
  energy: 10,
  maxEnergy: 16,
  motivation: 60,
  housingLevel: 1,
  items: ['macbook'],
  skills: {},
  achievements: [],
  relationships: {},
  genetics: {
    seed: 'layers-test',
    hairStyle: 'hair_short',
    beard: 'beard_none',
    top: 'top_tshirt',
    eyeShape: 'eye_normal',
  },
  avatar: {
    top: 'top_jacket',
    bottom: 'bottom_sweatpants',
    accessory: 'acc_cap',
    hairColor: '#2b2320',
    skin: '#f5c6a0',
    topColor: '#3b6ea5',
  },
  room: { slots: {} },
};

function jsonRoute(url: string): unknown {
  if (url.includes('/iso/manifest.json')) return { tile: { w: 32, h: 16, wallH: 72 }, sprites: {} };
  if (url.includes('/api/content/layers'))
    return { avatar: avatarManifest, room: roomManifest, office: officeManifest };
  if (url.includes('/api/content/genetics')) return { genetics };
  if (url.includes('/api/content/pixel')) return { available: false };
  if (url.includes('/api/auth')) return { token: 'test-token', player };
  if (url.includes('/api/game/state')) return { state: player, player, events: [] };
  if (url.includes('/api/content')) return {};
  if (url.includes('/api/leaderboard')) return { entries: [], total: 0 };
  return {};
}

async function openScreen(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Меню' }));
  const dialog = await screen.findByRole('dialog', { name: 'Меню' });
  fireEvent.click(within(dialog).getByRole('button', { name: label }));
}

// Окно поиска — только контейнеры фигуры (aria-label у ProceduralAvatar), а не
// весь экран: карусели гардероба рисуют по <img> на КАЖДУЮ запись манифеста, и
// «лишний» top_tshirt там — норма витрины, но не нормы одежды персонажа.
const roomFigureSrcs = () =>
  [...document.querySelectorAll('[aria-label="Комната"] [aria-label="Аватар игрока"]')].flatMap((box) =>
    [...box.querySelectorAll('img')].map((i) => i.getAttribute('src'))
  );

const figureSrcs = () =>
  [...document.querySelectorAll('[aria-label="Аватар игрока"]')].flatMap((box) =>
    [...box.querySelectorAll('img')].map((i) => i.getAttribute('src'))
  );

describe('слоистый аватар в живых экранах', () => {
  beforeEach(() => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => jsonRoute(url),
        text: async () => JSON.stringify(jsonRoute(url)),
      } as Response;
    }) as unknown as typeof fetch;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('«Дом» рисует плоскую комнату и фигуру из webp-слоёв, а гардероб — вместо генетики', async () => {
    render(<App />);
    await openScreen('Дом');

    // комната стала плоской: слои room-манифеста лежат в кадре
    await waitFor(() => expect(document.querySelectorAll('img[src^="/layers/room/"]').length).toBeGreaterThan(0));

    // фигура стоит именно в комнате (не только в превью гардероба) и одета по
    // гардеробу: до правки низы не рисовались нигде в принципе
    await waitFor(() => expect(roomFigureSrcs()).toContain('/layers/avatar-v2/top_jacket.webp'));
    expect(roomFigureSrcs()).toContain('/layers/avatar-v2/bottom_sweatpants.webp');
    expect(roomFigureSrcs()).toContain('/layers/avatar-v2/acc_cap.webp');
    expect(roomFigureSrcs()).toContain('/layers/avatar-v2/body_base.webp');
  });

  it('цвет из гардероба красит фигуру в комнате, а не только iso-портрет', async () => {
    render(<App />);
    await openScreen('Дом');

    const figure = '[aria-label="Комната"] [aria-label="Аватар игрока"]';
    const hair = await waitFor(() => {
      const el = document.querySelector<HTMLImageElement>(`${figure} img[src*="/hair_"]`);
      expect(el).toBeTruthy();
      return el!;
    });
    // Ряд «Цвет волос» пишет хекс в player.avatar, а плоский стек раньше умел
    // только палитрные id из генетики — то есть выбор оставался невидимым.
    expect(hair.getAttribute('style')).toContain(tintFilter(tintFromHex('#2b2320')!));

    // Одежда в плоском стеке предокрашена — её ряд честно ничего не красит.
    const top = document.querySelector<HTMLImageElement>(`${figure} img[src*="top_jacket"]`);
    expect(top?.getAttribute('style')).toContain('none');
  });

  it('«Профиль» показывает ту же фигуру, что и комната', async () => {
    render(<App />);
    await openScreen('Профиль');

    // генетика (top_tshirt/hair_short из сейва) не должна перекрывать гардероб
    await waitFor(() => expect(figureSrcs()).toContain('/layers/avatar-v2/top_jacket.webp'));
    expect(figureSrcs()).not.toContain('/layers/avatar-v2/top_tshirt.webp');
    expect(figureSrcs()).toContain('/layers/avatar-v2/bottom_sweatpants.webp');
  });
});
