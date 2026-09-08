import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { checkEndings } from '@itsim/shared';
import { PixelIcon } from '../components/pixel/PixelIcon';

/**
 * Endings — экран 6 финалов из ТЗ.
 *
 * Доступ: «Ещё» → «Финалы» (после реализации в GameScreen).
 * Сервер всё ещё источник истины: за claim/reset отвечает `/api/game/...`
 * (action `claim_ending` / `new_life`); клиент показывает, какие финалы
 * уже доступны по чистым данным движка, чтобы игрок видел прогресс.
 */
export const EndingView: React.FC = () => {
  const player = useGameStore((s) => s.player);
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
  const claim = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      // Server action is not yet wired (P1.12) — the in-engine check is enough
      // for visibility. A future PR will add `/api/game/ending/claim`.
      // eslint-disable-next-line no-console
      console.info('[endings] claim requested', id, player.currentDay);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="reference-screen-title">
        <PixelIcon name="trophy" size={20} />
        Финалы карьеры
      </h2>
      <p className="text-xs text-ink-400 leading-relaxed">
        Шесть финалов из ТЗ. Положительные открываются при выполнении условий;
        отрицательные срабатывают сами, если долго игнорировать здоровье или деньги.
        После любого финала доступна «Новая жизнь» с постоянным бонусом XP.
      </p>
      {error && (
        <p role="alert" className="panel text-sm text-clay-300">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {endings.map((e) => {
          const seen = memories.includes(e.id as any);
          return (
            <article
              key={e.id}
              className={`panel ${e.available ? 'panel-note panel-note-gold' : 'panel-note panel-note-sky'}`}
              aria-label={e.title}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <PixelIcon
                  name={e.id === 'burnout' || e.id === 'left_it' ? 'warn' : 'star'}
                  size={14}
                  className={e.available ? 'text-gold-300 mt-0.5' : 'text-sky-300 mt-0.5'}
                />
                <h3 className="text-sm font-semibold text-ink-100 leading-tight flex-1">{e.title}</h3>
                {seen && <span className="text-2xs text-gold-300 shrink-0">пройдено</span>}
              </div>
              <p className="text-xs text-ink-400 leading-relaxed mb-2">{e.description}</p>
              {e.missing && <p className="text-2xs text-ochre-300 mb-2">{e.missing}</p>}
              <button
                disabled={!e.available || !!busy}
                onClick={() => claim(e.id)}
                className={`btn w-full text-xs !min-h-[34px] ${
                  e.available ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {e.action === 'claim' ? (e.available ? 'Зафиксировать финал' : 'Условия не выполнены') : 'Начать новую жизнь'}
              </button>
            </article>
          );
        })}
        {endings.length === 0 && (
          <p className="text-xs text-ink-500">Условия финалов подгружаются…</p>
        )}
      </div>
      {meta && (
        <p className="text-2xs text-ink-600 leading-relaxed">
          Прожито жизней: {meta.lives ?? 0} · пройдено финалов: {memories.length} · лучший грейд:{' '}
          {meta.bestGrade ?? '—'} · глубочайший день: {meta.deepestDay ?? 0}
        </p>
      )}
    </div>
  );
};
