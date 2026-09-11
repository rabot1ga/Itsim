import React, { useRef, useState } from 'react';
import {
  storyLabel,
  choiceTone,
  effectRows,
  eventArtwork,
  unmetRequirements,
  type EffectRow,
  type EventEffects,
  type EventRequirements,
  type EventPlayer,
} from './eventPresentation';
export { eventArtwork } from './eventPresentation';

export interface EventChoice {
  text: string;
  effects?: EventEffects;
  requires?: EventRequirements;
}

export interface EventCardProps {
  eventId?: string;
  title: string;
  description: string;
  tags?: string[];
  choices: EventChoice[];
  player?: EventPlayer;
  error?: string | null;
  onChoose: (index: number) => void | Promise<void>;
}

/** Left spine of the card, by tag: crisis = red, reward = gold, people = blue… */
function cardTone(tags: string[]): string {
  if (tags.some((t) => ['crisis', 'health', 'mental', 'burnout'].includes(t))) return 'tone-clay';
  if (tags.some((t) => ['reward', 'career', 'work', 'interview'].includes(t))) return 'tone-gold';
  if (tags.some((t) => ['study', 'social', 'friend', 'family'].includes(t))) return 'tone-sky';
  if (tags.some((t) => ['money', 'freelance', 'rest'].includes(t))) return 'tone-moss';
  return 'tone-ochre';
}

/** Compact preview of what a choice costs and pays, right inside its button. */
const ChoicePreview: React.FC<{ rows: EffectRow[] }> = ({ rows }) => {
  if (rows.length === 0) return null;
  return (
    <span className="story-choice-effects">
      {rows.map((row) => (
        <span key={row.key} className="res-chip num" title={row.label}>
          <span className="chip-label">{row.label}</span>
          {row.text} <span aria-hidden="true">{row.emoji}</span>
        </span>
      ))}
    </span>
  );
};

/**
 * Random event — the reference card: art, story, coloured choices with their
 * own consequences printed on them. Which effect belongs to which choice is
 * never a guess: the chips live inside the button that causes them.
 */
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
    <section className={`story-card ${cardTone(tags)} animate-pop-in`} aria-label={title} aria-busy={busy !== null}>
      <div className="story-card-kicker">
        <span aria-hidden="true">🎲</span>
        Случайное событие
      </div>
      <img className="story-card-art" src={eventArtwork(tags, title, eventId)} alt="" width={384} height={288} />
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
                <span>{busy === i ? 'Принимаем решение…' : storyLabel(choice.text)}</span>
                <ChoicePreview rows={rows} />
              </button>
              {missing.length > 0 && <p className="story-requirements">{missing.join(' · ')}</p>}
            </div>
          );
        })}
      </div>
      <p className="story-footnote">Последствия выбора показаны прямо на кнопке.</p>
    </section>
  );
};

/**
 * What the choice actually did. The server has already applied it; this card
 * is the receipt, and it waits for a deliberate «Продолжить» so the numbers
 * are read, not flashed.
 */
export const EventOutcomeCard: React.FC<{
  title: string;
  tags?: string[];
  choice: EventChoice;
  onDismiss: () => void;
}> = ({ title, tags = [], choice, onDismiss }) => {
  const rows = effectRows(choice.effects);
  const heading = title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || title;
  return (
    <section className={`story-card ${cardTone(tags)} animate-pop-in`} aria-label={`Результат: ${heading}`}>
      <div className="story-card-kicker">
        <span aria-hidden="true">✅</span>
        Решение принято
      </div>
      <div className="story-card-copy">
        <h2>{heading}</h2>
        <p>{storyLabel(choice.text)}</p>
      </div>
      <div className="story-outcome">
        <h3>Последствия</h3>
        {rows.length === 0 ? (
          <p className="subtle">Ничего не изменилось — иногда и так бывает.</p>
        ) : (
          <dl className="story-effects">
            {rows.map((row) => (
              <div key={row.key} className={row.good ? 'is-positive' : 'is-negative'}>
                <dt>
                  <span className="emoji" aria-hidden="true">
                    {row.emoji}
                  </span>
                  <span>{row.label}</span>
                </dt>
                <dd className="num">{row.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="story-choices">
        <button className="btn btn-primary w-full" onClick={onDismiss}>
          Продолжить
        </button>
      </div>
    </section>
  );
};
