import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomView } from '../screens/RoomView';
import { useGameStore } from '../store/gameStore';

/**
 * Скины и позиции питомца в комнате: оверлей-эмоудзи на сцене комнаты
 * сидит на якоре позиции, контролы переключают скин/позицию.
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
      items: ['pet_cat', 'pet_bow'],
      ...over,
    } as never,
  });
}

describe('RoomView: питомец в комнате', () => {
  it('по умолчанию питомец на коврике, аксессуары бейджем', () => {
    setPlayer({});
    render(<RoomView />);
    const pet = document.querySelector('.room-pet') as HTMLElement;
    expect(pet).toBeTruthy();
    expect(pet.getAttribute('role')).toBe('img');
    // Портрет — пиксельный ассет (lib/petPortraits.ts), эмодзи — только фолбэк.
    expect(pet.querySelector('.room-pet-img')?.getAttribute('src')).toBe('/art/pet-v1/pet_cat.png');
    expect(pet.querySelector('.room-pet-badges')?.textContent).toBe('🎀');
    // якорь позиции по умолчанию — коврик (50%, 84%)
    expect(pet.style.left).toBe('50%');
    expect(pet.style.top).toBe('84%');
  });

  it('Stars-эксклюзивы видны и из entitlements (старые гранты)', () => {
    setPlayer({ items: ['pet_cat'], entitlements: ['pet_halo', 'pet_wings'] });
    render(<RoomView />);
    const pet = document.querySelector('.room-pet') as HTMLElement;
    expect(pet.querySelector('.room-pet-badges')?.textContent).toBe('😇🪽');
  });

  it('контролы переключают позицию и скин, «Убрать» прячет питомца', async () => {
    setPlayer({ items: ['pet_cat', 'pet_dog', 'pet_bow'] });
    render(<RoomView />);
    fireEvent.click(screen.getByText('На кровати'));
    const pet = document.querySelector('.room-pet') as HTMLElement;
    expect(pet.style.left).toBe('16%');
    expect(pet.style.top).toBe('58%');

    // смена скина: у собаки свой портрет
    fireEvent.click(screen.getByText('🐶'));
    expect(document.querySelector('.room-pet-img')?.getAttribute('src')).toBe('/art/pet-v1/pet_dog.png');

    fireEvent.click(screen.getByText('Убрать питомца'));
    expect(document.querySelector('.room-pet')).toBeNull();
  });

  it('без питомцев секция и оверлей не рисуются', () => {
    setPlayer({ items: [] });
    render(<RoomView />);
    expect(document.querySelector('.room-pet')).toBeNull();
    expect(screen.queryByText('Питомец в комнате')).toBeNull();
  });
});
