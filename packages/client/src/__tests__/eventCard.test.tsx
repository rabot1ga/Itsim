import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventCard, eventArtwork } from '../components/EventCard';

afterEach(cleanup);

describe('reference event card', () => {
  it('selects category art and safely falls back for unknown tags', () => {
    expect(eventArtwork(['health'])).toBe('/events/rest.webp');
    expect(eventArtwork(['pets'])).toBe('/events/pet.webp');
    expect(eventArtwork(['unknown'])).toBe('/events/night.webp');
    expect(eventArtwork([])).toBe('/events/night.webp');
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
    expect(screen.getByText('-6')).toBeTruthy();
    expect(screen.getByText('-7 XP')).toBeTruthy();
  });
});
