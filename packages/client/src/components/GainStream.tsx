import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Floating gains.
 *
 * The rule every idle game is built on: a tap must pay out where the player is
 * looking, inside the moment they tapped. The store diffs the state the server
 * sends back, and each number that moved flies up out of the resource bar for a
 * second — money, energy, mood, a new skill level.
 */

const GainLabel: React.FC<{ id: number; icon: string; text: string; tone: 'good' | 'bad' }> = ({
  id,
  icon,
  text,
  tone,
}) => {
  const dropGain = useGameStore((s) => s.dropGain);

  useEffect(() => {
    const t = setTimeout(() => dropGain(id), 1000);
    return () => clearTimeout(t);
  }, [id, dropGain]);

  return (
    <span className={`gain-float ${tone === 'good' ? 'text-moss-300' : 'text-clay-300'}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="num">{text}</span>
    </span>
  );
};

export const GainStream: React.FC = () => {
  const gains = useGameStore((s) => s.gains);
  if (!gains.length) return null;

  return (
    <div className="gain-stream" aria-live="polite">
      {gains.map((g) => (
        <GainLabel key={g.id} {...g} />
      ))}
    </div>
  );
};
