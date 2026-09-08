import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from '../components/pixel/PixelIcon';

interface Friend {
  id: string;
  name: string;
  description: string;
  initialRelation: number;
}
export const FriendsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const [people, setPeople] = useState<Friend[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch('/api/content/npcs', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('npcs');
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data.npcs)) throw new Error('npcs');
        setPeople(data.npcs);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="space-y-3">
      <h2 className="reference-screen-title">
        <PixelIcon name="people" size={20} />
        Друзья и знакомые
      </h2>
      <p className="text-xs text-ink-400">
        Твои отношения с персонажами. Прогулки, общение и события меняют их со временем.
      </p>
      {status === 'loading' && <p role="status">Загрузка знакомых…</p>}
      {status === 'error' && (
        <div role="alert" className="panel">
          Не удалось загрузить знакомых.
          <button className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}
      {status === 'ready' &&
        people.map((person) => {
          const relation = player?.relationships?.[person.id] ?? person.initialRelation;
          return (
            <article className="reference-friend" key={person.id} aria-label={person.name}>
              <span className="reference-friend-icon">
                <PixelIcon name="people" size={25} />
              </span>
              <div>
                <h3>{person.name}</h3>
                <p>
                  {relation >= 30 ? 'Дружеские отношения' : relation < 0 ? 'Напряжённые отношения' : 'Знакомые'} ·{' '}
                  {relation > 0 ? '+' : ''}
                  {relation}
                </p>
                <details>
                  <summary>О персонаже</summary>
                  <p>{person.description}</p>
                </details>
              </div>
            </article>
          );
        })}
      <button className="btn btn-primary w-full" onClick={() => setView('main')}>
        К действиям дня
      </button>
    </div>
  );
};
