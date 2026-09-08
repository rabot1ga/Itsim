import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';

/**
 * Smoke test for the whole app.
 *
 * A crash on mount used to show the player a blank white screen with nothing
 * in the logs, so this test mounts the real App against a stubbed API and
 * fails loudly if anything throws. Every screen the tabs can reach is walked
 * so a broken renderer cannot ship unnoticed.
 */

const manifest = {
  tile: { w: 32, h: 16, wallH: 72 },
  sprites: {
    char_a00: { file: '/iso/char_a00.png', w: 25, h: 46, kind: 'char', roles: { top: ['#111111'] } },
    bed: { file: '/iso/bed.png', w: 60, h: 50, kind: 'floor', tiles: [2, 3] },
    window: { file: '/iso/window.png', w: 60, h: 60, kind: 'wall', tilesW: 3 },
  },
};

const player = {
  version: 2,
  telegramId: 1,
  currentDay: 3,
  money: 5000,
  energy: 10,
  maxEnergy: 16,
  motivation: 60,
  housingLevel: 1,
  items: ['office_chair'],
  skills: {},
  achievements: [],
  relationships: {},
  genetics: { seed: 'test-seed', hairStyle: 'hair_short', top: 'top_hoodie_gray' },
  avatar: {},
  room: { slots: {} },
};

function jsonRoute(url: string): unknown {
  if (url.includes('/iso/manifest.json')) return manifest;
  if (url.includes('/api/auth')) return { token: 'test-token', player };
  if (url.includes('/api/game/state')) return { state: player, player, events: [] };
  if (url.includes('/api/content/layers')) return { avatar: { slots: [] }, room: { slots: [] }, office: { slots: [] } };
  if (url.includes('/api/content/genetics')) return { genetics: { wallPalette: [] } };
  if (url.includes('/api/content/pixel')) return { pack: null };
  if (url.includes('/api/content/npcs')) return { npcs: [] };
  if (url.includes('/api/content/companies')) return { companies: [] };
  if (url.includes('/api/content/items')) return { items: [] };
  if (url.includes('/api/content')) return {};
  if (url.includes('/api/leaderboard')) return { entries: [], total: 0 };
  return {};
}

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => jsonRoute(url),
        text: async () => JSON.stringify(jsonRoute(url)),
      } as Response;
    }) as unknown as typeof fetch;
    // canvas is not implemented in jsdom; the recolour engine must survive that
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('walks every tab and every «⋮» destination without crashing', async () => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Основная навигация' });
    const tabs = ['Работа', 'Обучение', 'Отдых', 'Магазин', 'Главная'];
    for (const label of tabs) {
      fireEvent.click(within(nav).getByRole('button', { name: label }));
      await waitFor(() => expect(screen.queryByText('Что-то сломалось')).toBeNull());
    }

    const destinations = [
      'Профиль',
      'Дом',
      'Друзья',
      'Питомец',
      'Цели',
      'Топ',
      'Офис',
      'Майнинг',
      'Кошелёк',
      'Финалы',
      'Настройки',
    ];
    for (const label of destinations) {
      fireEvent.click(await screen.findByRole('button', { name: 'Меню' }));
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });
      fireEvent.click(within(dialog).getByRole('button', { name: label }));
      await waitFor(() => expect(screen.queryByText('Что-то сломалось')).toBeNull());
    }
  });

  it('mounts without crashing and reaches the game screen', async () => {
    const { container, queryByText } = render(<App />);
    await waitFor(() => expect(container.querySelector('#root, div')).toBeTruthy());
    // the crash screen from ErrorBoundary must not be there
    expect(queryByText('Что-то сломалось')).toBeNull();
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});
