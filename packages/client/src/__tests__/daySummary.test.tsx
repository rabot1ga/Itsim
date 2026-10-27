import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DaySummaryCard } from '../components/DaySummaryCard';
import { formatMoney } from '../screens/actionCatalogue';
import type { DaySummary } from '../store/gameStore';

const summary = (over: Partial<DaySummary> = {}): DaySummary => ({
  day: 5,
  messages: ['Зарплата: +45 000 ₽', 'Ты на грани выгорания. Срочно отдохни!'],
  deltas: { money: 45_000, motivation: -12, health: -3, energy: 5, levelsUp: 1 },
  hasEvent: false,
  ...over,
});

describe('DaySummaryCard (D: сводка дня)', () => {
  it('показывает номер дня и сообщения сервера', () => {
    render(<DaySummaryCard summary={summary()} onDismiss={() => {}} />);
    expect(screen.getByText('День 5 завершён')).toBeTruthy();
    expect(screen.getByText('Зарплата: +45 000 ₽')).toBeTruthy();
    expect(screen.getByText('Ты на грани выгорания. Срочно отдохни!')).toBeTruthy();
  });

  it('дельты со знаком: деньги и мотивация', () => {
    render(<DaySummaryCard summary={summary()} onDismiss={() => {}} />);
    expect(screen.getByText(`+${formatMoney(45_000)} ₽`)).toBeTruthy();
    expect(screen.getByText('−12')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy(); // уровни навыков
  });

  it('спокойный день без сообщений и дельт — тихая карточка с «Готово»', () => {
    render(
      <DaySummaryCard
        summary={summary({ messages: [], deltas: { money: 0, motivation: 0, health: 0, energy: 0, levelsUp: 0 } })}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText('День прошёл спокойно — и это тоже результат.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Готово' })).toBeTruthy();
  });

  it('кнопка «Далее», когда ждёт событие, и вызывает onDismiss', () => {
    const onDismiss = vi.fn();
    render(<DaySummaryCard summary={summary({ hasEvent: true })} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
