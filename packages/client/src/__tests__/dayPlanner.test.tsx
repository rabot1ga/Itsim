// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { DayPlannerView } from '../screens/DayPlannerView';
import { useGameStore } from '../store/gameStore';

/**
 * Планер дня (DESIGN-PUNCH §2): 5 слотов, сытость, треугольник статов и
 * активности. Кнопки упираются в слоты — «время — валюта».
 */
const basePlayer = (over: Record<string, unknown> = {}) => ({
  currentDay: 3,
  money: 5000,
  energy: 10,
  maxEnergy: 16,
  motivation: 60,
  health: 90,
  hunger: 64,
  slotsUsed: 1,
  combat: { power: { level: 7, xp: 0 }, agility: { level: 5, xp: 0 }, speed: { level: 6, xp: 0 } },
  memories: [],
  companyStanding: {},
  relationships: {},
  skills: {},
  softSkills: {},
  job: null,
  ...over,
});

describe('DayPlannerView', () => {
  const performAction = vi.fn(() => Promise.resolve(true));
  beforeEach(() => {
    performAction.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ projects: [] }) }))
    );
    useGameStore.setState({ player: basePlayer(), performAction } as never);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('слоты, сытость и треугольник статов на экране', () => {
    render(<DayPlannerView />);
    expect(screen.getByText('День — 5 слотов')).toBeTruthy();
    expect(screen.getByLabelText('Слоты дня: 4 из 5 свободно')).toBeTruthy();
    expect(screen.getByText('Сытость')).toBeTruthy();
    expect(screen.getByText('Боевой треугольник')).toBeTruthy();
    expect(screen.getByText('Сила')).toBeTruthy();
  });

  it('тренировка зовёт performAction со слот-активностью', async () => {
    render(<DayPlannerView />);
    fireEvent.click(screen.getByRole('button', { name: /Штанга и жим/ }));
    await vi.waitFor(() => expect(performAction).toHaveBeenCalledWith('train', { activity: 'gym' }));
  });

  it('когда слоты кончились — тренировки недоступны', () => {
    useGameStore.setState({ player: basePlayer({ slotsUsed: 5 }) } as never);
    render(<DayPlannerView />);
    expect(screen.getByRole('button', { name: /Штанга и жим/ })).toHaveProperty('disabled', true);
    // еда слот не тратит — доступна
    expect(screen.getByRole('button', { name: /Фастфуд/ })).toHaveProperty('disabled', false);
  });

  it('смена на работе требует работу', () => {
    render(<DayPlannerView />);
    expect(screen.getByRole('button', { name: /Смена на работе/ })).toHaveProperty('disabled', true);
  });
});
