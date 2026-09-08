import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DayEndDock } from '../components/DayEndDock';
import { useGameStore } from '../store/gameStore';

/**
 * The «Завершить день» dock disappeared in the browser for a subtle reason:
 * `index.html` loads telegram-web-app.js on every page, so `Telegram.WebApp`
 * — MainButton included — exists outside Telegram too. The old check trusted
 * that object, hid the in-page button and handed the turn to a native button
 * that no browser can draw. These tests pin both sides of the decision.
 */

const mainButton = () => ({
  show: vi.fn(),
  hide: vi.fn(),
  setText: vi.fn(),
  setParams: vi.fn(),
  onClick: vi.fn(),
  offClick: vi.fn(),
  showProgress: vi.fn(),
  hideProgress: vi.fn(),
  isVisible: false,
});

type TelegramWindow = Window & { Telegram?: unknown };

/** the SDK object as a browser sees it, trimmed to what the dock reads */
const webApp = (over: Record<string, unknown>) => ({
  ready: vi.fn(),
  expand: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
  ...over,
});

describe('day end dock', () => {
  beforeEach(() => {
    useGameStore.setState({ player: { currentDay: 4, energy: 3, maxEnergy: 10 } as never });
  });
  afterEach(() => {
    delete (window as TelegramWindow).Telegram;
  });

  it('stays on screen in a plain browser, SDK loaded or not', () => {
    (window as TelegramWindow).Telegram = {
      WebApp: webApp({ platform: 'unknown', initData: '', MainButton: mainButton() }),
    };
    render(<DayEndDock visible />);
    expect(screen.getByRole('button', { name: /Завершить день/ }).textContent).toContain('4');
  });

  it('steps aside for the native MainButton inside a real Telegram client', () => {
    const button = mainButton();
    (window as TelegramWindow).Telegram = {
      WebApp: webApp({ platform: 'ios', initData: 'query_id=1', MainButton: button }),
    };
    render(<DayEndDock visible />);
    expect(screen.queryByRole('button', { name: /Завершить день/ })).toBeNull();
    expect(button.show).toHaveBeenCalled();
  });

  it('gets out of the way while a story card waits for an answer', () => {
    render(<DayEndDock visible={false} />);
    expect(screen.queryByRole('button', { name: /Завершить день/ })).toBeNull();
  });

  it('says out loud when the day has nothing left to spend', () => {
    useGameStore.setState({ player: { currentDay: 4, energy: 0, maxEnergy: 10 } as never });
    render(<DayEndDock visible />);
    expect(screen.getByText('Энергия кончилась — день пора закрыть')).toBeTruthy();
  });
});
