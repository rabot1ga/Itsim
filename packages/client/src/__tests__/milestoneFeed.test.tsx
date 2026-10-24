import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressView } from '../screens/ProgressView';
import { useGameStore } from '../store/gameStore';

/**
 * Автопостинг вех: лента авто-постов «Стал сеньор за 78 дней!» живёт на экране
 * «Прогресс» (A2, 25.10.2026), секция «Знаковые события» — посты по одному на веху, «Поделиться»
 * открывает t.me/share, без вех секция не рисуется.
 */

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  );
});

afterEach(() => {
  useGameStore.setState({ player: null });
  vi.unstubAllGlobals();
});

function setPlayer(over: Record<string, unknown>): void {
  useGameStore.setState({
    player: {
      currentDay: 78,
      money: 50_000,
      grade: 'senior',
      skills: { javascript: { level: 20, xp: 5 } },
      mainSkillId: 'javascript',
      meta: { lives: 1 },
      ...over,
    } as never,
  });
}

describe('ProgressView: лента вех', () => {
  it('без вех секция показывает заглушку', () => {
    setPlayer({});
    render(<ProgressView />);
    expect(screen.getByText('Пока пусто — проживи ещё пару дней.')).toBeTruthy();
  });

  it('каждая веха — пост с подписью и кнопкой «Поделиться»', () => {
    setPlayer({
      milestones: [
        {
          id: 'grade:senior',
          day: 78,
          key: 'Стал {p0} за {p1} {p2}!',
          params: { p0: 'сеньор', p1: 78, p2: 'дней' },
        },
      ],
    });
    render(<ProgressView />);
    expect(screen.getByText('Знаковые события')).toBeTruthy();
    expect(screen.getByText('Стал сеньор за 78 дней!')).toBeTruthy();
    // «День 78» есть и в футноте карточки — ищем в посте вехи
    const day = document.querySelector('.milestone-day');
    expect(day?.textContent).toContain('78');
    const share = screen.getByText('Поделиться');
    // клик не падает (openTelegramLink в jsdom уходит в window.open)
    fireEvent.click(share);
    expect(screen.getAllByText('Поделиться')).toHaveLength(1);
  });

  it('подпись собирается из params: форма слова «дня»', () => {
    setPlayer({
      milestones: [
        {
          id: 'grade:junior',
          day: 2,
          key: 'Стал {p0} за {p1} {p2}!',
          params: { p0: 'джун', p1: 2, p2: 'дня' },
        },
      ],
    });
    render(<ProgressView />);
    expect(screen.getByText('Стал джун за 2 дня!')).toBeTruthy();
  });
});
