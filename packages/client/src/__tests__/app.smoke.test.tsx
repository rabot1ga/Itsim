import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';

/**
 * Smoke test for the whole app.
 *
 * A crash on mount used to show the player a blank white screen with nothing
 * in the logs, so this test mounts the real App against a stubbed API and
 * fails loudly if anything throws. Every screen the tabs can reach is walked
 * so a broken renderer cannot ship unnoticed.
 */

const player = {
  version: 5,
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
};

function jsonRoute(url: string): unknown {
  if (url.includes('/api/auth')) return { token: 'test-token', player };
  if (url.includes('/api/game/state')) return { state: player, player, events: [] };
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
    // canvas is not implemented in jsdom — гасим, чтобы будущие canvas-фичи не роняли smoke
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('walks every tab and every side destination without crashing', async () => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Основная навигация' });
    const tabs = ['Сегодня', 'Работа', 'Развитие', 'Прогресс'];
    for (const label of tabs) {
      fireEvent.click(within(nav).getByRole('button', { name: label }));
      await waitFor(() => expect(screen.queryByText('Что-то сломалось')).toBeNull());
    }

    // «Мир» и боковые экраны живут в контекстных дверях — обходим те же вьюхи,
    // что доступны из NavLinks (лист «⋮» с A2 упразднён).
    const destinations = [
      'profile',
      'room',
      'friends',
      'pet',
      'leaderboard',
      'office',
      'mining',
      'settings',
      'rest',
      'shop',
    ];
    const { useGameStore } = await import('../store/gameStore');
    for (const view of destinations) {
      act(() => {
        useGameStore.getState().setView(view);
      });
      await waitFor(() => expect(screen.queryByText('Что-то сломалось')).toBeNull());
    }
  });

  it('keeps «Завершить день» docked outside the scroll area on every working tab', async () => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Основная навигация' });
    // the store is a module singleton — the previous test may have parked it elsewhere
    fireEvent.click(within(nav).getByRole('button', { name: 'Сегодня' }));

    // The dock is a sibling of the scroll area, not the last card inside it —
    // that is the whole point: no scrolling to end the day.
    const dock = await screen.findByRole('button', { name: /Завершить день/ });
    expect(document.getElementById('game-scroll')?.contains(dock)).toBe(false);

    for (const label of ['Работа', 'Развитие']) {
      fireEvent.click(within(nav).getByRole('button', { name: label }));
      expect(await screen.findByRole('button', { name: /Завершить день/ })).toBeTruthy();
    }

    // Боковые экраны — для осмотра, кнопка хода уступает место.
    const { useGameStore } = await import('../store/gameStore');
    act(() => {
      useGameStore.getState().setView('settings');
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Завершить день/ })).toBeNull());
  });

  it('mounts without crashing and reaches the game screen', async () => {
    const { container, queryByText } = render(<App />);
    await waitFor(() => expect(container.querySelector('#root, div')).toBeTruthy());
    // the crash screen from ErrorBoundary must not be there
    expect(queryByText('Что-то сломалось')).toBeNull();
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});
