import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { checkEndings } from '@itsim/shared';
import { ScreenTitle } from '../components/ui';

const ENDING_EMOJI: Record<string, string> = {
  cto: '👑',
  corporate_god: '👑',
  exit: '🚀',
  free_artist: '🎨',
  teacher: '🎓',
  burnout: '🔥',
  left_it: '🚪',
};

/**
 * Endings — экран 6 финалов из ТЗ.
 *
 * Доступ: «Ещё» → «Финалы» (после реализации в GameScreen).
 * Сервер всё ещё источник истины: за claim отвечает action `claim_ending`
 * (эндпоинт `/api/game/action` с actionId: 'claim_ending', params: {endingId}).
 * Клиент показывает, какие финалы уже доступны по чистым данным движка.
 */
export const EndingView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [balance, setBalance] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/content/balance')
      .then((r) => r.json())
      .then((data) => setBalance(data.balance ?? null))
      .catch(() => setError('Не удалось загрузить условия финалов'));
  }, []);

  const endings = useMemo(() => {
    if (!player || !balance) return [];
    return checkEndings(player, balance);
  }, [player, balance]);

  if (!player) return null;
  const meta = player.meta;
  const memories = meta?.memories ?? [];
  const careerEnding = (player as any).careerEnding;
  const claim = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      // Server-side: action `claim_ending` validates the conditions again
      // and sets state.careerEnding. New Life is then available from «Ещё».
      const ok = await performAction('claim_ending', { endingId: id });
      if (!ok) setError(useGameStore.getState().error ?? 'Не удалось зафиксировать финал');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle
        emoji="🎬"
        meta={
          <span className="num">
            {memories.length} / {endings.length || 6}
          </span>
        }
      >
        Финалы карьеры
      </ScreenTitle>
      <p className="subtle">
        Шесть финалов из ТЗ. Положительные открываются при выполнении условий; отрицательные срабатывают сами, если
        долго игнорировать здоровье или деньги. После любого финала доступна «Новая жизнь» с постоянным бонусом XP.
      </p>
      {error && (
        <p role="alert" className="card card-sm text-sm text-clay-300">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {endings.map((e) => {
          const seen =
            memories.includes(e.id as any) ||
            careerEnding === e.id ||
            (careerEnding === 'corporate_god' && e.id === 'cto');
          return (
            <article
              key={e.id}
              className={`card ${e.available ? 'panel-note panel-note-gold' : 'panel-note panel-note-sky'}`}
              aria-label={e.title}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <span className="text-base leading-none" aria-hidden="true">
                  {ENDING_EMOJI[e.id] ?? (e.available ? '⭐' : '🔒')}
                </span>
                <h3 className="text-sm font-semibold text-ink-100 leading-tight flex-1">{e.title}</h3>
                {seen && <span className="chip chip-gold shrink-0">пройдено</span>}
              </div>
              <p className="text-sm text-ink-300 leading-relaxed mb-2">{e.description}</p>
              {e.missing && !seen && <p className="text-2xs text-ochre-300 mb-2">{e.missing}</p>}
              <button
                disabled={(!e.available && !seen) || !!busy}
                onClick={() => claim(e.id)}
                className={`btn w-full ${e.available && !seen ? 'btn-primary' : 'btn-secondary'}`}
              >
                {seen
                  ? 'Зафиксировано — начни новую жизнь'
                  : e.available
                    ? busy === e.id
                      ? 'Фиксируем…'
                      : 'Зафиксировать финал'
                    : 'Условия не выполнены'}
              </button>
            </article>
          );
        })}
        {endings.length === 0 && <p className="subtle">Условия финалов подгружаются…</p>}
      </div>
      {meta && (
        <p className="subtle">
          Прожито жизней: {meta.lives ?? 0} · пройдено финалов: {memories.length} · лучший грейд:{' '}
          {meta.bestGrade ?? '—'} · глубочайший день: {meta.deepestDay ?? 0}
        </p>
      )}
    </div>
  );
};
