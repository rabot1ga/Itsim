import { t } from '../lib/i18n';
import { PixelIcon } from '../components/pixel/PixelIcon';
import React, { useRef, useState } from 'react';
/**
 * First-run onboarding — a short splash before day one (B, аудит 28.10).
 *
 * Учим деланием, а не лекциями: после заставки игрок сразу попадает в
 * чек-лист «Первые шаги» на «Сегодня» (действие → завершить день → сводка).
 * «Пропустить» всегда доступен — вернувшийся игрок не заложник туториала.
 */
export const ONBOARDING_KEY = 'itsim_onboarded_v1';
interface Slide {
  icon: string;
  art?: string;
  title: string;
  body: string;
}
const SLIDES: Slide[] = [
  {
    icon: 'star',
    art: '/art/story-v1/portrait.webp',
    title: t('Симулятор жизни айтишника'),
    body: t('Живи, работай, развивайся. Каждый день — новый выбор и новые последствия.'),
  },
  {
    icon: 'bolt',
    art: '/art/story-v1/night.webp',
    title: t('Каждый день — это энергия'),
    body: t('Учёба, работа и отдых тратят энергию. Настроение и здоровье решают, сколько ты выдержишь.'),
  },
  // B (аудит 28.10): остальное обучение — деланием, чек-лист «Первые шаги» на «Сегодня»
];
export const OnboardingView: React.FC<{
  onDone: () => void;
}> = ({ onDone }) => {
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
        {t('Пропустить')}
      </button>

      <div className="onboard-slide" key={index}>
        {slide.art ? (
          <img className="onboard-art animate-pop-in" src={slide.art} alt="" width={320} height={240} />
        ) : (
          <span className="onboard-emoji" aria-hidden="true">
            <PixelIcon name={slide.icon} size={18} />
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
        {last ? t('Начать жизнь') : t('Дальше')}
      </button>
    </div>
  );
};
