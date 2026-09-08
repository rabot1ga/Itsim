import React, { useRef, useState } from 'react';

/**
 * First-run onboarding — four cards between the splash screen and day one.
 *
 * The game asks the player to spend energy every day; that contract has to be
 * explained before the first tap, not discovered by trial and error. Swipe or
 * tap «Дальше»; «Пропустить» is always available, because a returning player
 * who reinstalled should not be held hostage by a tutorial.
 */

export const ONBOARDING_KEY = 'itsim_onboarded_v1';

interface Slide {
  emoji: string;
  art?: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '💻',
    art: '/art/story-v1/portrait.webp',
    title: 'Симулятор жизни айтишника',
    body: 'Живи, работай, развивайся. Каждый день — новый выбор и новые последствия.',
  },
  {
    emoji: '🎓',
    art: '/art/story-v1/room.webp',
    title: 'Ты только закончил универ',
    body: '10 000 ₽ на счету и пустое резюме. Дальше — только твои решения.',
  },
  {
    emoji: '⚡',
    art: '/art/story-v1/night.webp',
    title: 'Каждый день — это энергия',
    body: 'Учёба, работа и отдых тратят энергию. Настроение и здоровье решают, сколько ты выдержишь.',
  },
  {
    emoji: '🚀',
    art: '/art/story-v1/offer.webp',
    title: 'Собеседования, баги, дедлайны',
    body: 'Повышения, офферы, случайные события — всё как в жизни, только быстрее.',
  },
];

export const OnboardingView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const go = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(SLIDES.length - 1, i + delta)));
  };

  return (
    <div
      className="onboard animate-fade-in"
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - startX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        startX.current = null;
      }}
    >
      <button className="onboard-skip" onClick={onDone}>
        Пропустить
      </button>

      <div className="onboard-slide" key={index}>
        {slide.art ? (
          <img className="onboard-art animate-pop-in" src={slide.art} alt="" width={320} height={240} />
        ) : (
          <span className="onboard-emoji" aria-hidden="true">
            {slide.emoji}
          </span>
        )}
        <h2>{slide.title}</h2>
        <p>{slide.body}</p>
      </div>

      <div className="onboard-dots" aria-hidden="true">
        {SLIDES.map((_, i) => (
          <span key={i} data-active={i === index} />
        ))}
      </div>

      <button className="btn btn-primary btn-lg w-full" onClick={() => (last ? onDone() : go(1))}>
        {last ? 'Начать жизнь' : 'Дальше'}
      </button>
    </div>
  );
};
