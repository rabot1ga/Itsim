import { t } from '../lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, EmptyState, Spinner } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { playerPower, rivalGap, memoriesOf, recentMemories, type MemoryRecord } from '@itsim/shared';

/**
 * «Хроника» (DESIGN-LIVING-WORLD §3, стадия 4): память мира — видимая.
 * Лента следов по дням, карточки NPC с общей историей, стойкость компаний,
 * карточка соперника и недельная сводка «что мир запомнил». Оформление —
 * как у архива: те же карточки и заголовки, без нового визуального языка.
 */

interface NpcLite {
  id: string;
  name: string;
}
interface CompanyLite {
  id: string;
  name: string;
}

/** Значимый акт — значок. Мелочи остаются текстом. */
function kindIcon(kind: MemoryRecord['kind']): 'person' | 'laptop' | 'briefcase' | 'trend' | 'warn' | 'chat' {
  if (kind === 'friend') return 'person';
  if (kind === 'project' || kind === 'freelance') return 'laptop';
  if (kind === 'application' || kind === 'hire' || kind === 'fire') return 'briefcase';
  if (kind === 'promotion') return 'trend';
  if (kind === 'conflict') return 'warn';
  return 'chat';
}

function relationWord(relation: number): string {
  if (relation >= 60) return t('близкий друг');
  if (relation >= 30) return t('друг');
  if (relation < -30) return t('конфликт');
  if (relation < 0) return t('напряжённые');
  return t('знакомый');
}

export const ChronicleView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const [people, setPeople] = useState<NpcLite[]>([]);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/content/npcs', { signal: controller.signal }).then((r) => r.json()),
      fetch('/api/content/companies', { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([npcs, comps]) => {
        setPeople((npcs.npcs ?? npcs ?? []).map((n: any) => ({ id: n.id, name: n.name })));
        setCompanies((comps.companies ?? comps ?? []).map((c: any) => ({ id: c.id, name: c.name })));
        setStatus('ready');
      })
      .catch(() => setStatus('ready'));
    return () => controller.abort();
  }, []);

  const memories = (player?.memories ?? []) as MemoryRecord[];
  const currentDay = player?.currentDay ?? 1;

  /** Недельная сводка «что мир запомнил» (закон 3 — память видна). */
  const week = useMemo(() => memories.filter((m) => m.day > currentDay - 7), [memories, currentDay]);
  /** Лента: следы, сгруппированные по дням (новые сверху). */
  const byDay = useMemo(() => {
    const groups = new Map<number, MemoryRecord[]>();
    for (const m of memories) {
      const list = groups.get(m.day) ?? [];
      list.push(m);
      groups.set(m.day, list);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [memories]);

  const rival = player?.rival;
  const standing = Object.entries(player?.companyStanding ?? {}) as Array<[string, any]>;
  const hasWorld = memories.length > 0 || rival || standing.length > 0;

  if (!player) return <Spinner label={t('Загружаем хронику…')} />;
  return (
    <section className="space-y-3">
      <ScreenTitle icon="chat" meta={t('что мир помнит о тебе')}>
        {t('Хроника')}
      </ScreenTitle>

      {status === 'loading' && <Spinner label={t('Загружаем хронику…')} />}

      {!hasWorld && status === 'ready' && (
        <EmptyState
          icon="chat"
          title={t('Мир ещё молчит')}
          hint={t('Первые следы появятся, когда что-то действительно случится: отклик, друг, проект.')}
        />
      )}

      {week.length > 0 && (
        <div className="card">
          <SectionTitle>{t('Неделя в памяти')}</SectionTitle>
          <p className="text-xs text-ink-300 leading-relaxed">
            {t('За последние 7 дней мир запомнил {p0} событий. Последнее:', { p0: week.length })}{' '}
            <span className="text-ink-100">{recentMemories(player, 1)[0]?.text}</span>
          </p>
        </div>
      )}

      {rival && (
        <div className="card">
          <SectionTitle>{t('Соперник')}</SectionTitle>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-ink-100">
              <PixelIcon name="person" size={14} />
              {rival.name}
            </span>
            <span className="num text-xs text-ink-400">
              {t('запас')} {Math.round(playerPower(player))} · {t('у {p0}', { p0: rival.name })}{' '}
              {Math.round(rival.progress)}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {rivalGap(player) < 0
              ? t('{p0} впереди — ревью будет горячим', { p0: rival.name })
              : t('Ты впереди — держи темп')}
          </p>
        </div>
      )}

      {people.length > 0 && (
        <div className="card">
          <SectionTitle>{t('Люди и общая история')}</SectionTitle>
          <ul className="space-y-2">
            {people.map((n) => {
              const rel = player.relationships?.[n.id] ?? 0;
              const last = memoriesOf(player, `npc:${n.id}`, 1)[0];
              return (
                <li key={n.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-ink-100">
                      {n.name} <span className="text-ink-500">· {relationWord(rel)}</span>
                    </div>
                    {last && <div className="text-ink-400 truncate">{last.text}</div>}
                  </div>
                  <span className="num text-ink-400 shrink-0">{rel > 0 ? `+${rel}` : rel}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {standing.length > 0 && (
        <div className="card">
          <SectionTitle>{t('Компании помнят')}</SectionTitle>
          <ul className="space-y-2">
            {standing.map(([id, s]) => {
              const name = companies.find((c) => c.id === id)?.name ?? id;
              return (
                <li key={id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-ink-100 truncate">{name}</div>
                    <div className="text-ink-400">
                      {t('откликов: {p0} · офферов: {p1} · отказов: {p2}', {
                        p0: s.applied ?? 0,
                        p1: s.offers ?? 0,
                        p2: s.rejections ?? 0,
                      })}
                    </div>
                  </div>
                  {s.closedUntilDay && s.closedUntilDay > currentDay ? (
                    <span className="res-chip num">
                      <PixelIcon name="warn" size={10} /> {t('дверь закрыта до дня {p0}', { p0: s.closedUntilDay })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {byDay.length > 0 && (
        <div className="card">
          <SectionTitle>{t('Лента следов')}</SectionTitle>
          <div className="space-y-2.5">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <div className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
                  {t('День {p0}', { p0: day })}
                </div>
                <ul className="mt-1 space-y-1">
                  {list.map((m) => (
                    <li key={m.id} className="flex items-start gap-1.5 text-xs text-ink-200">
                      <PixelIcon name={kindIcon(m.kind)} size={12} />
                      <span className="min-w-0">{m.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
