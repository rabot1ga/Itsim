// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { ChronicleView } from '../screens/ChronicleView';
import { useGameStore } from '../store/gameStore';

/**
 * «Хроника» (DESIGN-LIVING-WORLD, стадия 4): память мира видима — лента
 * следов, соперник, компании, недельная сводка. Пустой мир — честное
 * пустое состояние, а не пустой экран.
 */
const basePlayer = (over: Record<string, unknown> = {}) => ({
  currentDay: 10,
  memories: [],
  companyStanding: {},
  relationships: { uni_friend: 42 },
  skills: { javascript: { level: 10, xp: 0 } },
  softSkills: {},
  ...over,
});

function setPlayer(over: Record<string, unknown> = {}): void {
  useGameStore.setState({ player: basePlayer(over) } as never);
}

describe('ChronicleView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              npcs: [{ id: 'uni_friend', name: 'Саня' }],
              companies: [{ id: 'portal_2000', name: 'Portal-2000' }],
            }),
        })
      )
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('пустой мир — пустое состояние', async () => {
    setPlayer();
    render(<ChronicleView />);
    expect(await screen.findByText('Мир ещё молчит')).toBeTruthy();
  });

  it('лента следов группируется по дням, недельная сводка считает', async () => {
    setPlayer({
      memories: [
        { id: 'm1', day: 9, subject: 'company:portal_2000', kind: 'application', text: 'Отклик в Portal-2000' },
        { id: 'm2', day: 4, subject: 'npc:uni_friend', kind: 'friend', text: 'Вечер с другом' },
      ],
    });
    render(<ChronicleView />);
    expect(await screen.findByText('День 9')).toBeTruthy();
    expect(screen.getByText('День 4')).toBeTruthy();
    expect(screen.getAllByText('Отклик в Portal-2000').length).toBeGreaterThanOrEqual(1);
    // неделя (день 10): следы дня 9 и 4 попадают в сводку
    expect(screen.getByText(/За последние 7 дней мир запомнил 2/)).toBeTruthy();
  });

  it('соперник и компании показываются с разрывом и стойкостью', async () => {
    setPlayer({
      rival: { name: 'Марина', branch: 'main', progress: 30, day: 1 },
      companyStanding: { portal_2000: { applied: 2, offers: 1, rejections: 1, daysWorked: 5 } },
    });
    render(<ChronicleView />);
    expect(await screen.findByText('Марина')).toBeTruthy();
    expect(screen.getByText(/впереди|держи темп/)).toBeTruthy();
    expect(screen.getByText('Portal-2000')).toBeTruthy();
    expect(screen.getByText(/откликов: 2 · офферов: 1 · отказов: 1/)).toBeTruthy();
  });
});
