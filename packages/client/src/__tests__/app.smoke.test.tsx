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

  it('opens the archive sheet and walks every destination without crashing', async () => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Основная навигация' });
    // IA «Колода»: таббар упразднён — нижняя панель это «Сегодня» + «Архив»
    fireEvent.click(within(nav).getByRole('button', { name: 'Архив' }));
    const archive = await screen.findByRole('navigation', { name: 'Архив' });
    expect(within(archive).getByRole('button', { name: /Работа/ })).toBeTruthy();
    // каждая запись архива открывается без падений
    const destinations = [
      'career',
      'skills',
      'progress',
      'overview',
      'rest',
      'room',
      'pet',
      'office',
      'mining',
      'shop',
      'friends',
      'leaderboard',
      'profile',
      'settings',
    ];
    const { useGameStore } = await import('../store/gameStore');
    for (const view of destinations) {
      act(() => {
        useGameStore.getState().setView(view);
      });
      await waitFor(() => expect(screen.queryByText('Что-то сломалось')).toBeNull());
    }
  });

  it('ends the day from the deck end-card, the dock stays for working panels', async () => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Основная навигация' });
    // the store is a module singleton — the previous test may have parked it elsewhere
    fireEvent.click(within(nav).getByRole('button', { name: 'Сегодня' }));

    // Стек дня: активная карточка с кнопками-дублёрами жеста; до конца
    // доходим «Пропустить»/«Дальше», последняя карточка — «Завершить день».
    // Между кликами ждём анимацию улёта (DeckCard ~160ms).
    for (let i = 0; i < 12 && !document.querySelector('[data-deck-id="end"]'); i++) {
      const skip = screen.queryByRole('button', { name: 'Пропустить' }) ?? screen.queryByRole('button', { name: 'Дальше' });
      if (!skip) break;
      fireEvent.click(skip);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 220));
      });
      expect(screen.queryByText('Что-то сломалось')).toBeNull();
    }
    expect(document.querySelector('[data-deck-id="end"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Завершить' })).toBeTruthy();

    // На рабочих панелях архива док остаётся — ход завершается оттуда.
    const { useGameStore } = await import('../store/gameStore');
    for (const view of ['career', 'skills']) {
      act(() => {
        useGameStore.getState().setView(view);
      });
      expect(await screen.findByRole('button', { name: /Завершить день/ })).toBeTruthy();
    }

    // Боковые экраны — для осмотра, кнопка хода уступает место.
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
