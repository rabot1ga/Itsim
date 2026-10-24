import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';

/**
 * Комната и профиль после редизайна 22.10.2026
 * (docs/PROPOSALS-2026-10-22-room-redesign.md).
 *
 * «Дом» и «Главная» больше не монтируют слоистый аватар: комната — карточка
 * события со сценой-баннером `/art/room/<тир>.webp` (её и проверяем), тир
 * растёт с грейдом, миниатюра на «Главной» совпадает с баннером.
 *
 * «Профиль» — «карточка жизни»: баннер-портрет протагониста с настроением по
 * состоянию (`profileMoodOf`) и чипы ключевых ресурсов. Пиксельной
 * идентичности больше нет ни здесь, ни где-либо ещё: слоёв
 * `/layers/avatar-v2/` на живых экранах быть не должно.
 */

// Сейв без генетики и аватара: состояние версии 4 уже не несёт внешности.
const player = {
  version: 4,
  telegramId: 1,
  grade: 'unemployed',
  currentDay: 5,
  money: 5000,
  energy: 10,
  maxEnergy: 16,
  motivation: 60,
  housingLevel: 0,
  items: ['macbook'],
  skills: {},
  achievements: [],
  relationships: {},
};

function jsonRoute(url: string): unknown {
  if (url.includes('/api/content/pixel')) return { available: false };
  if (url.includes('/api/auth')) return { token: 'test-token', player };
  if (url.includes('/api/game/state')) return { state: player, player, events: [] };
  if (url.includes('/api/content')) return {};
  if (url.includes('/api/leaderboard')) return { entries: [], total: 0 };
  return {};
}

async function openScreen(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Меню' }));
  const dialog = await screen.findByRole('dialog', { name: 'Меню' });
  fireEvent.click(within(dialog).getByRole('button', { name: label }));
}

describe('комната-карточка и профиль-карточка жизни', () => {
  beforeEach(() => {
    localStorage.setItem('itsim_onboarded_v1', '1');
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => jsonRoute(url),
        text: async () => JSON.stringify(jsonRoute(url)),
      } as Response;
    }) as unknown as typeof fetch;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('«Дом» — карточка события: баннер-сцена тира и зоны-строки из каталога', async () => {
    render(<App />);
    await openScreen('Дом');

    // баннер — сцена текущего тира, а не слои room-манифеста
    await waitFor(() => expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')).toBeTruthy());
    // свежая игра (grade: 'unemployed') — строго стартовый тир, не «студия мечты»
    expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')!.getAttribute('src')).toBe(
      '/art/room/start.webp'
    );
    // конструктора больше нет: ни слоев аватара, ни слоев комнаты
    expect(document.querySelectorAll('img[src^="/layers/room/"]').length).toBe(0);
    expect(document.querySelectorAll('[aria-label="Твоя комната"] img[src^="/layers/avatar-v2/"]').length).toBe(0);

    // зоны — строки-действия поверх общего каталога, с чипами эффектов
    const choices = [...document.querySelectorAll('[aria-label="Твоя комната"] .story-choice')];
    expect(choices.length).toBeGreaterThanOrEqual(5);
    const labels = choices.map((b) => b.textContent ?? '');
    expect(labels.some((t) => t.includes('Проспать до утра'))).toBe(true);
    expect(labels.some((t) => t.includes('Прогулка вокруг дома'))).toBe(true);
  });

  it('тир комнаты растёт с жильём: баннер меняется после переезда', async () => {
    render(<App />);
    await openScreen('Дом');
    const banner = () => document.querySelector('[aria-label="Твоя комната"] img.story-card-art');
    await waitFor(() => expect(banner()).toBeTruthy());

    useGameStore.setState({ player: { ...useGameStore.getState().player!, housingLevel: 0 } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/start.webp'));

    useGameStore.setState({ player: { ...useGameStore.getState().player!, housingLevel: 1 } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/cozy.webp'));

    useGameStore.setState({ player: { ...useGameStore.getState().player!, housingLevel: 4 } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/room/dream.webp'));
  });

  // Двигатель расхождений этого блока: «Главная» годами показывала эскиз
  // story-v1, хотя плоская комната была собрана, и чинить её могли отдельно.
  it('«Главная» показывает миниатюру того же тира, что и баннер «Дома»', async () => {
    // стор модульный: предыдущие тесты этого файла ушли в «Дом» и остались там
    useGameStore.setState({ currentView: 'main' });
    render(<App />);

    await waitFor(() => expect(document.querySelector('img.room-thumb')).toBeTruthy());
    const thumbSrc = document.querySelector('img.room-thumb')!.getAttribute('src');
    expect(thumbSrc).toMatch(/^\/art\/room\/(start|cozy|work|dream)\.webp$/);
    expect(thumbSrc).not.toContain('story-v1');

    await openScreen('Дом');
    await waitFor(() => expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')).toBeTruthy());
    expect(document.querySelector('[aria-label="Твоя комната"] img.story-card-art')!.getAttribute('src')).toBe(
      thumbSrc
    );
  });

  it('«Профиль» — карточка жизни: баннер настроения и чипы ресурсов', async () => {
    render(<App />);
    await openScreen('Профиль');

    // энергия 10/16, мотивация 60 → «в ритме»
    const banner = () => document.querySelector('[aria-label="Профиль персонажа"] .profile-banner img');
    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()!.getAttribute('src')).toBe('/art/profile/normal.webp');
    expect(screen.getByText('В ритме')).toBeTruthy();

    // чипы показывают живые цифры состояния
    const chips = document.querySelector('[aria-label="Ключевые показатели"]')!;
    expect(chips.textContent).toContain('10/16');
    expect(chips.textContent).toContain('60');

    // усталость: энергия на трети шкалы и ниже
    useGameStore.setState({ player: { ...useGameStore.getState().player!, energy: 4 } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/profile/tired.webp'));

    // выгорание перекрывает усталость
    useGameStore.setState({ player: { ...useGameStore.getState().player!, motivation: 20 } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/profile/burnout.webp'));
    expect(screen.getByText('Выгорание')).toBeTruthy();

    // слоистой внешности на профиле больше нет
    expect(document.querySelectorAll('img[src^="/layers/avatar-v2/"]').length).toBe(0);
  });

  it('офис — карточка события: баннер тира растёт с грейдом, iso-сцены нет', async () => {
    render(<App />);
    // ставим job только после гидрации стора из /api/game/state: иначе
    // начальная загрузка затирает setState (урок прошлых тестов файла)
    await waitFor(() => expect(useGameStore.getState().player).toBeTruthy());
    useGameStore.setState({
      player: {
        ...useGameStore.getState().player!,
        grade: 'junior',
        job: {
          companyId: 'acme',
          position: 'Инженер',
          grade: 'junior',
          salary: 100_000,
          energyPerDay: 4,
          daysWorked: 3,
          daysSinceLastPromotion: 3,
        },
      },
    });
    await openScreen('Офис');

    const banner = () => document.querySelector('[aria-label="Твой офис"] img.story-card-art');
    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()!.getAttribute('src')).toBe('/art/office/openspace.webp');

    // строки-действия из общего каталога, а не плитки iso-сцены
    const choices = [...document.querySelectorAll('[aria-label="Твой офис"] .story-choice')];
    expect(choices.map((b) => b.textContent ?? '')).toEqual([
      expect.stringContaining('Закрыть задачу'),
      expect.stringContaining('Овертайм'),
      expect.stringContaining('Стендап / 1:1'),
    ]);

    // тир растёт той же лестницей, что и комната
    useGameStore.setState({ player: { ...useGameStore.getState().player!, grade: 'middle' } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/office/cabinet.webp'));
    useGameStore.setState({ player: { ...useGameStore.getState().player!, grade: 'cto' } });
    await waitFor(() => expect(banner()!.getAttribute('src')).toBe('/art/office/tower.webp'));

    // iso-сцены на экране больше нет: спрайты остались только иконками магазина
    expect(document.querySelectorAll('[aria-label="Твой офис"] canvas').length).toBe(0);
    expect(document.querySelectorAll('[aria-label="Твой офис"] img[src^="/iso/"]').length).toBe(0);
  });
});
