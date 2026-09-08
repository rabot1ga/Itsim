import React from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { PixelIcon } from './pixel/PixelIcon';
import { PixelText } from './pixel/PixelText';

const DESTINATIONS = [
  { view: 'career', icon: 'briefcase', title: 'Работа', hint: 'Найди свою команду' },
  { view: 'skills', icon: 'book', title: 'Обучение', hint: 'Выбери направление' },
  { view: 'shop', icon: 'bag', title: 'Магазин', hint: 'Собери свой сетап' },
  { view: 'room', icon: 'house', title: 'Моя комната', hint: 'Место, где всё началось' },
];

/** Reference-inspired entry screen. The illustration is decorative, not the player's avatar. */
export const MainMenu: React.FC = () => {
  const { setScreen, setView, player } = useGameStore();
  const hasProgress = Boolean(player && ((player.currentDay ?? 1) > 1 || (player.meta?.lives ?? 0) > 0));
  const enter = (view: string) => {
    haptic('selection');
    setView(view);
    setScreen('game');
  };

  return (
    <main className="start-menu" aria-label="Главное меню" data-ui-revision="05">
      <header className="start-brand">
        <PixelText scale={2}>IT LIFE</PixelText>
        <span>СИМУЛЯТОР ЖИЗНИ</span>
        <span className="start-revision" title="Версия визуального интерфейса">
          UI 05
        </span>
      </header>

      <section className="start-hero" aria-labelledby="start-title">
        <div className="start-hero-art">
          <img src="/events/night.webp" alt="" width={280} height={160} loading="eager" />
          <span className="start-hero-caption">
            <PixelIcon name="moon" size={11} />
            Ещё одна строка кода. Ещё один шаг вперёд.
          </span>
        </div>
        <div className="start-hero-copy">
          <p className="start-kicker">Твоя карьера. Твои решения.</p>
          <h1 id="start-title">
            Симулятор жизни <strong>АЙТИШНИКА</strong>
          </h1>
          <p className="start-description">
            Учись, работай, обустраивай комнату.
            <br />И постарайся не выгореть.
          </p>
        </div>
      </section>

      <section className="start-save" aria-label="Текущая игра">
        <span className="start-save-icon">
          <PixelIcon name="calendar" size={19} />
        </span>
        <div>
          <p>{hasProgress ? 'Твоя история продолжается' : 'Всё начинается с первого дня'}</p>
          <span>
            День {player?.currentDay ?? 1} · {gradeLabel(player?.grade ?? 'unemployed')}
          </span>
        </div>
        <span className="start-save-money num">{(player?.money ?? 0).toLocaleString('ru-RU')} ₽</span>
      </section>

      <button className="btn btn-primary start-play" onClick={() => enter('main')}>
        <PixelIcon name="play" size={15} />
        {hasProgress ? `Продолжить · день ${player!.currentDay}` : 'Начать игру'}
        <PixelIcon name="arrow" size={12} />
      </button>

      <nav className="start-destinations" aria-label="Разделы игры">
        {DESTINATIONS.map((item) => (
          <button key={item.view} onClick={() => enter(item.view)}>
            <PixelIcon name={item.icon} size={19} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.hint}</small>
            </span>
          </button>
        ))}
      </nav>
      <footer className="start-footer">
        Живи. Работай. Развивайся.<span>IT Life · интерфейс 05</span>
      </footer>
    </main>
  );
};

function gradeLabel(grade: string): string {
  const labels: Record<string, string> = {
    unemployed: 'Без работы',
    intern: 'Стажёр',
    junior: 'Junior',
    middle: 'Middle',
    senior: 'Senior',
    teamlead: 'Teamlead',
    architect: 'Архитектор',
    cto: 'CTO',
  };
  return labels[grade] ?? grade;
}
