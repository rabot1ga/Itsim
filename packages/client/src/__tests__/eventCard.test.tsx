import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventCard, eventArtwork } from '../components/EventCard';

afterEach(cleanup);

describe('reference event card', () => {
  it('selects category art and safely falls back for unknown tags', () => {
    expect(eventArtwork(['health'])).toBe('/art/story-v1/rest.webp');
    expect(eventArtwork(['pets'])).toBe('/art/story-v1/pet.webp');
    expect(eventArtwork(['unknown'])).toBe('/art/story-v1/night.webp');
    expect(eventArtwork([])).toBe('/art/story-v1/night.webp');
  });

  it('keeps live story and choice indices, with decorative art', () => {
    const onChoose = vi.fn();
    const { container } = render(
      <EventCard
        title="🌙 Ночная идея"
        description="Завтра встреча."
        choices={[
          { text: 'Спать', effects: { energy: 2 } },
          { text: 'Работать', effects: { energy: -2 } },
        ]}
        onChoose={onChoose}
      />
    );
    expect(screen.getByRole('heading', { name: 'Ночная идея' })).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Работать/ }));
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('does not hide the sixth resource or negative skill XP', () => {
    render(
      <EventCard
        title="Проверка"
        description="Последствия"
        choices={[
          {
            text: 'Выбрать',
            effects: {
              money: 10,
              energy: -1,
              motivation: 2,
              health: -3,
              reputation: 4,
              karma: -6,
              skill: { javascript: -7 },
            },
          },
        ]}
        onChoose={() => {}}
      />
    );
    expect(screen.getByText(/-6/)).toBeTruthy();
    expect(screen.getByText(/-7 XP/)).toBeTruthy();
  });
});

it('locks all choices while waiting, then permits retry after rejection', async () => {
  let reject!: (error: Error) => void;
  const onChoose = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  render(
    <EventCard
      title="Событие"
      description="Описание"
      choices={[{ text: 'Первый' }, { text: 'Второй' }]}
      onChoose={onChoose}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Первый' }));
  fireEvent.click(screen.getByRole('button', { name: 'Второй' }));
  expect(onChoose).toHaveBeenCalledTimes(1);
  const { act, waitFor } = await import('@testing-library/react');
  await act(async () => reject(new Error('network')));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Попробуй ещё раз'));
  expect((screen.getByRole('button', { name: 'Первый' }) as HTMLButtonElement).disabled).toBe(false);
});

it('shows requirements and cannot commit an unavailable choice', () => {
  const choose = vi.fn();
  render(
    <EventCard
      title="Выбор"
      description="Описание"
      player={{ energy: 1, money: 0 }}
      choices={[{ text: 'Купить', requires: { money: 500 } }]}
      onChoose={choose}
    />
  );
  expect(screen.getByText('Нужно денег: 500 ₽')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Купить' }));
  expect(choose).not.toHaveBeenCalled();
});
