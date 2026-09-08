import React, { useRef, useState } from 'react';
import { PixelIcon } from './pixel/PixelIcon';
import {
  storyLabel,
  choiceTone,
  effectRows,
  eventArtwork,
  unmetRequirements,
  type EventEffects,
  type EventRequirements,
  type EventPlayer,
} from './eventPresentation';
export { eventArtwork } from './eventPresentation';

export interface EventCardProps {
  eventId?: string;
  title: string;
  description: string;
  tags?: string[];
  choices: Array<{ text: string; effects?: EventEffects; requires?: EventRequirements }>;
  player?: EventPlayer;
  error?: string | null;
  onChoose: (index: number) => void | Promise<void>;
}

/** Reference 2.png: story art, live text, colored choices and explicit consequences. */
export const EventCard: React.FC<EventCardProps> = ({
  eventId,
  title,
  description,
  tags = [],
  choices,
  player,
  error,
  onChoose,
}) => {
  const [busy, setBusy] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const lock = useRef(false);
  const heading = title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || title;
  const choose = async (index: number) => {
    if (lock.current || unmetRequirements(choices[index]?.requires, player).length > 0) return;
    lock.current = true;
    setBusy(index);
    setLocalError(null);
    try {
      await onChoose(index);
    } catch {
      setLocalError('Не удалось принять решение. Попробуй ещё раз.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  return (
    <section className="story-card" aria-label={title} aria-busy={busy !== null}>
      <div className="story-card-kicker">
        <PixelIcon name="dice" size={11} />
        Случайное событие
      </div>
      <img className="story-card-art" src={eventArtwork(tags, title, eventId)} alt="" width={384} height={230} />
      <div className="story-card-copy">
        <h2>{heading}</h2>
        <p>{description}</p>
      </div>
      {(error || localError) && (
        <p className="story-error" role="alert">
          {error || localError}
        </p>
      )}
      <div className="story-choices">
        {choices.map((choice, i) => {
          const rows = effectRows(choice.effects);
          const missing = unmetRequirements(choice.requires, player);
          return (
            <div className="story-choice-group" key={i}>
              <button
                className={`story-choice story-choice-${choiceTone(rows)}`}
                disabled={busy !== null || missing.length > 0}
                onClick={() => choose(i)}
              >
                {busy === i ? 'Принимаем решение…' : storyLabel(choice.text)}
              </button>
              {missing.length > 0 && <p className="story-requirements">{missing.join(' · ')}</p>}
              {rows.length > 0 && (
                <dl className="story-effects" aria-label={`Последствия: ${storyLabel(choice.text)}`}>
                  {rows.map((row) => (
                    <div key={row.key} className={row.good ? 'is-positive' : 'is-negative'}>
                      <dt>
                        <PixelIcon name={row.icon} size={12} />
                        <span>{row.label}</span>
                      </dt>
                      <dd className="num">{row.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>
      <p className="story-footnote">Последствия указаны отдельно для каждого решения.</p>
    </section>
  );
};
