import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ResourceBar } from '../components/ResourceBar';

const fixture = vi.hoisted(() => ({
  player: { grade: 'unemployed', currentDay: 1, money: 5000, energy: 10, maxEnergy: 16, health: 80, motivation: 50 },
}));
vi.mock('../store/gameStore', () => ({
  useGameStore: (selector: (state: typeof fixture) => unknown) => selector(fixture),
}));
afterEach(cleanup);

describe('HUD resource meters', () => {
  it('keeps the home screen to one plaque: money, day and «⋮» live in the HUD', () => {
    const { container } = render(<ResourceBar />);
    const hud = screen.getByRole('region', { name: 'Персонаж и состояние' });
    expect(within(hud).getByLabelText('Деньги').textContent?.replace(/\s/g, '')).toContain('5000');
    expect(within(hud).getByText(/^День 1$/)).toBeTruthy();
    expect(within(hud).getByRole('button', { name: 'Меню' })).toBeTruthy();
    // the second stacked strip is gone — that was the point
    expect(container.querySelectorAll('.topbar-row')).toHaveLength(0);
  });

  it('exposes names, values and limits to assistive technology', () => {
    render(<ResourceBar />);
    const energy = screen.getByRole('progressbar', { name: 'Энергия' });
    expect(energy.getAttribute('aria-valuenow')).toBe('10');
    expect(energy.getAttribute('aria-valuemax')).toBe('16');
    expect(screen.getByRole('progressbar', { name: 'Здоровье' }).getAttribute('aria-valuenow')).toBe('80');
    expect(screen.getByRole('progressbar', { name: 'Настроение' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('clamps malformed or out-of-range values without NaN widths', () => {
    const original = { ...fixture.player };
    try {
      Object.assign(fixture.player, { health: NaN, energy: -5, motivation: 110 });
      render(<ResourceBar />);
      expect(screen.getByRole('progressbar', { name: 'Энергия' }).getAttribute('aria-valuenow')).toBe('0');
      expect(screen.getByRole('progressbar', { name: 'Здоровье' }).getAttribute('aria-valuenow')).toBe('0');
      expect(screen.getByRole('progressbar', { name: 'Настроение' }).getAttribute('aria-valuenow')).toBe('100');
    } finally {
      Object.assign(fixture.player, original);
    }
  });
});
