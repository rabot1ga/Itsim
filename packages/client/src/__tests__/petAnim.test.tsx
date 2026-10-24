import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { RoomView } from '../screens/RoomView';
import { useGameStore } from '../store/gameStore';
import { petAnimState } from '../lib/petSkins';

/**
 * Анимации питомца idle/sleep/happy: состояние из энергии (спит на нуле) и
 * кормления (сытый — счастливый), классы на оверлее комнаты + 💤/✨.
 */

afterEach(() => {
  useGameStore.setState({ player: null });
});

function setPlayer(over: Record<string, unknown>): void {
  useGameStore.setState({
    player: {
      currentDay: 5,
      grade: 'junior',
      money: 5000,
      energy: 10,
      maxEnergy: 16,
      items: ['pet_cat'],
      ...over,
    } as never,
  });
}

describe('petAnimState', () => {
  it('энергия 0 → сон, сытость → радость, иначе покой', () => {
    expect(petAnimState({ energy: 0 })).toBe('sleep');
    expect(petAnimState({ energy: 3, petFedToday: true })).toBe('happy');
    expect(petAnimState({ energy: 3 })).toBe('idle');
  });
});

describe('RoomView: классы анимации и метки', () => {
  it('сытый питомец подпрыгивает и сияет', () => {
    setPlayer({ petFedToday: true });
    render(<RoomView />);
    expect(document.querySelector('.room-pet--happy')).toBeTruthy();
    expect(document.querySelector('.room-pet-spark')?.textContent).toBe('✨');
    expect(document.querySelector('.room-pet-zzz')).toBeNull();
  });

  it('без энергии питомец спит (класс + 💤 + подпись)', () => {
    setPlayer({ energy: 0 });
    render(<RoomView />);
    expect(document.querySelector('.room-pet--sleep')).toBeTruthy();
    expect(document.querySelector('.room-pet-zzz')?.textContent).toBe('💤');
    expect(screen.getByLabelText('Питомец спит')).toBeTruthy();
  });

  it('по умолчанию — спокойное покачивание', () => {
    setPlayer({});
    render(<RoomView />);
    expect(document.querySelector('.room-pet--idle')).toBeTruthy();
  });
});
