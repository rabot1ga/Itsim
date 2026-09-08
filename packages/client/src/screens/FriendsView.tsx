import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, EmptyState, Spinner } from '../components/ui';
import { inviteLink, openTelegramLink, haptic } from '../lib/telegram';

interface Friend {
  id: string;
  name: string;
  description: string;
  initialRelation: number;
  avatar: string | null;
}

const BOT_NAME = 'itlife_simulator_bot';

/** Relationship label — the same words the events use. */
function relationLabel(relation: number): string {
  if (relation >= 60) return 'Близкий друг';
  if (relation >= 30) return 'Друг';
  if (relation < 0) return 'Напряжённые отношения';
  return 'Знакомый';
}

export const FriendsView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const [people, setPeople] = useState<Friend[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const invite = () => {
    haptic('medium');
    openTelegramLink(inviteLink(BOT_NAME, player?.telegramId ?? 'player'));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👥" meta={status === 'ready' ? `${people.length} / 50` : undefined}>
        Друзья
      </ScreenTitle>

      <button className="btn btn-primary btn-lg w-full" onClick={invite}>
        Пригласить друга
      </button>
      <p className="subtle">
        За каждого приглашённого друга — бонус к деньгам и лимиту друзей. Отношения с персонажами меняют прогулки,
        общение и события.
      </p>

      {status === 'loading' && <Spinner label="Загрузка знакомых…" />}

      {status === 'error' && (
        <div role="alert" className="card">
          <p className="text-sm text-clay-300">Не удалось загрузить знакомых.</p>
          <button className="btn btn-secondary w-full mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}

      {status === 'ready' && people.length === 0 && (
        <EmptyState
          emoji="😶"
          title="Пока никого нет"
          hint="Приглашай друзей и получай бонусы — вместе карьера растёт быстрее."
        >
          <button className="btn btn-primary mt-4" onClick={invite}>
            Пригласить
          </button>
        </EmptyState>
      )}

      {status === 'ready' && people.length > 0 && (
        <>
          <SectionTitle>Список</SectionTitle>
          <div className="space-y-2">
            {people.map((person) => {
              const relation = player?.relationships?.[person.id] ?? person.initialRelation ?? 0;
              // npcs.json ships the source filename; we serve the optimised WebP twin.
              const portrait = person.avatar ? `/art/npcs/${person.avatar.replace(/\.png$/i, '.webp')}` : null;
              const open = openId === person.id;
              return (
                <article className="friend-row" key={person.id} aria-label={person.name}>
                  {portrait ? (
                    <img
                      className="friend-portrait"
                      src={portrait}
                      width={48}
                      height={48}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="friend-avatar" aria-hidden="true">
                      🧑‍💻
                    </span>
                  )}
                  <div className="friend-copy">
                    <h3>{person.name}</h3>
                    <p>
                      {relationLabel(relation)} ·{' '}
                      <span className="num">
                        {relation > 0 ? '+' : ''}
                        {relation}
                      </span>
                    </p>
                    {open && <p className="mt-1 text-ink-400">{person.description}</p>}
                  </div>
                  <div className="friend-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => setOpenId(open ? null : person.id)}>
                      {open ? 'Скрыть' : 'Профиль'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <button className="btn btn-secondary w-full" onClick={() => setView('main')}>
        К действиям дня
      </button>
    </div>
  );
};
