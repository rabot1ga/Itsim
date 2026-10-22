import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';

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
 * как только ссылка на слой пропадает из живого экрана.
 *
 * После редизайна 22.10.2026 (docs/PROPOSALS-2026-10-22-room-redesign.md)
 * «Дом» и «Главная» больше не монтируют слоистый аватар: комната — карточка
 * события со сценой-баннером `/art/room/<тир>.webp` (её и проверяем), а
 * слоистая фигура остаётся в «Профиле» и iso-офисе до захода «снятие
 * идентичности» (фаза 2).
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

  it('«Дом» — карточка события: баннер-сцена тира и зоны-строки из каталога', async () => {
    render(<App />);
    await openScreen('Дом');

    // баннер — сцена текущего тира, а не слои room-манифеста
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')).toBeTruthy()
    );
    expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')!.getAttribute('src')).toMatch(
      /^\/art\/room\/(start|cozy|work|dream)\.webp$/
    );
    // конструктора больше нет: ни слоев аватара, ни слоев комнаты
    expect(document.querySelectorAll('img[src^="/layers/room/"]').length).toBe(0);
    expect(document.querySelectorAll('[aria-label="Твоя комната"] img[src^="/layers/avatar-v2/"]').length).toBe(0);

    // зоны — строки-действия поверх общего каталога, с чипами эффектов
    const choices = [...document.querySelectorAll('[aria-label="Твоя комната"] .story-choice')];
    expect(choices.length).toBeGreaterThanOrEqual(5);
    const labels = choices.map((b) => b.textContent ?? '');
    expect(labels.some((t) => t.includes('Проспать до утра'))).toBe(true);
    expect(labels.some((t) => t.includes('Прогулка вокруг дома'))).toBe(true);
  });

  it('тир комнаты растёт с грейдом: баннер меняется', async () => {
    render(<App />);
    await openScreen('Дом');
    const banner = () => document.querySelector('[aria-label="Твоя комната"] img.story-card-art');
    await waitFor(() => expect(banner()).toBeTruthy());

    useGameStore.setState({ player: { ...useGameStore.getState().player!, grade: 'junior' } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/start.webp'));

    useGameStore.setState({ player: { ...useGameStore.getState().player!, grade: 'middle' } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/cozy.webp'));

    useGameStore.setState({ player: { ...useGameStore.getState().player!, grade: 'cto' } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/dream.webp'));
  });

  // Двигатель расхождений этого блока: «Главная» годами показывала эскиз
  // story-v1, хотя плоская комната была собрана, и чинить её могли отдельно.
  it('«Главная» показывает миниатюру того же тира, что и баннер «Дома»', async () => {
    // стор модульный: предыдущие тесты этого файла ушли в «Дом» и остались там
    useGameStore.setState({ currentView: 'main' });
    render(<App />);

    await waitFor(() => expect(document.querySelector('img.room-thumb')).toBeTruthy());
    const thumbSrc = document.querySelector('img.room-thumb')!.getAttribute('src');
    expect(thumbSrc).toMatch(/^\/art\/room\/(start|cozy|work|dream)\.webp$/);
    expect(thumbSrc).not.toContain('story-v1');

    await openScreen('Дом');
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')).toBeTruthy()
    );
    expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')!.getAttribute('src')).toBe(
      thumbSrc
    );
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
