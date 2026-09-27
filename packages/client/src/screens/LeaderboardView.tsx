import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import type { RatingMetric } from '@itsim/shared';
import { Spinner, EmptyState, ScreenTitle } from '../components/ui';

/**
 * Leaderboard — real ratings from persisted player states.
 *
 * Две независимые ручки, и не надо путать: «по чему считать место» (метрики) и
 * «кого считать» (все / без бустеров). Метрики — не вторая формула: сервер
 * сортирует по тем самым компонентам, из которых `calculateRating` складывает
 * итог (packages/shared/src/engine/rating.ts), и только что показывает.
 */

interface LeaderRow {
  rank: number;
  name: string;
  grade: string;
  /** значение выбранной метрики: 0…1000 для итога, 0…100 для компоненты */
  score: number;
  day: number;
  isYou: boolean;
  honest?: boolean;
  ending?: string | null;
}

const GRADE_LABELS: Record<string, string> = {
  unemployed: 'Без работы',
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

/** Podium medals; everybody else gets a quiet number. */
const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Вкладки — четыре метрики из ТЗ плюс «Рейтинг», потому что им отвечает сервер
 * по умолчанию и именно это число показывает шапка. `id` типизированы
 * `RatingMetric`: переименование или новая компонента в движке не могут
 * разойтись с доской молча — сборка падает.
 *
 * «Rep», а не «Репутация»: на 320 px пятая длинная подпись выталкивала бы
 * строку в горизонтальный скролл, у которого скроллбар скрыт дизайном.
 */
const TABS: { id: RatingMetric; label: string; unit: string }[] = [
  { id: 'rating', label: 'Рейтинг', unit: '⭐' },
  { id: 'career', label: 'Карьера', unit: '/100' },
  { id: 'skills', label: 'Навыки', unit: '/100' },
  { id: 'money', label: 'Деньги', unit: '/100' },
  { id: 'reputation', label: 'Rep', unit: '/100' },
];

const Row: React.FC<{ row: LeaderRow; unit: string }> = ({ row, unit }) => (
  <div className={`lb-row ${row.isYou ? 'is-me' : ''}`}>
    <span className="lb-rank num" aria-hidden="true">
      {MEDAL[row.rank] ?? row.rank}
    </span>
    <div className="flex-1 min-w-0">
      <div className="lb-name">
        {row.name}
        {row.isYou && <span className="text-2xs text-ink-500"> · ты</span>}
      </div>
      <span className="lb-meta">
        {GRADE_LABELS[row.grade] ?? row.grade} · <span className="num">день {row.day}</span>
      </span>
    </div>
    <span className="lb-score num">
      {Math.round(row.score)} {unit}
    </span>
  </div>
);

export const LeaderboardView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [you, setYou] = useState<LeaderRow | null>(null);
  const [total, setTotal] = useState(0);
  const [honestOnly, setHonestOnly] = useState(false);
  const [metric, setMetric] = useState<RatingMetric>('rating');
  const [loaded, setLoaded] = useState(false);

  const unit = TABS.find((t) => t.id === metric)?.unit ?? '⭐';

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    apiRequest(`/leaderboard/${honestOnly ? 'honest' : 'friends'}?limit=20&metric=${metric}`)
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data.leaderboard ?? []);
        setYou(data.you ?? null);
        setTotal(data.total ?? 0);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [player?.telegramId, honestOnly, metric]);

  const youOutsidePage = you && !rows.some((r) => r.isYou);

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle
        emoji="🏆"
        meta={player?.ratingScore !== undefined ? `твой рейтинг ${player.ratingScore} ⭐` : undefined}
      >
        Топ игроков
      </ScreenTitle>
      <p className="subtle -mt-2">
        Рейтинг складывается из карьеры, навыков, денег, репутации, ачивок и жилья — вкладки считают место по этим же
        компонентам (0…100), «Рейтинг» — итог (0…1000).
      </p>

      <div className="segmented" role="group" aria-label="Метрика рейтинга">
        {TABS.map((tab) => (
          <button key={tab.id} aria-pressed={metric === tab.id} onClick={() => setMetric(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Фильтр рейтинга">
        {[
          { id: false, label: 'Все' },
          { id: true, label: 'Без бустеров' },
        ].map((tab) => (
          <button key={String(tab.id)} aria-pressed={honestOnly === tab.id} onClick={() => setHonestOnly(tab.id)}>
            {tab.label}
          </button>
        ))}
        {total > 0 && (
          <span className="chip ml-auto shrink-0">
            игроков: <span className="num">{total}</span>
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {!loaded && <Spinner label="Считаем рейтинг…" />}
        {rows.map((row) => (
          <Row key={row.rank} row={row} unit={unit} />
        ))}
        {youOutsidePage && (
          <>
            <div className="text-center text-ink-700 text-xs tracking-[0.3em]">···</div>
            <Row row={you!} unit={unit} />
          </>
        )}
        {loaded && rows.length === 0 && (
          <EmptyState emoji="📊" title="Пока пусто" hint="Сыграй первый день — и попадёшь в топ." />
        )}
      </div>
    </div>
  );
};
