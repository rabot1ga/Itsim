import { t } from '../lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { checkEndings, ctoTenureDays, type Milestone } from '@itsim/shared';
import { ScreenTitle, SectionTitle, Spinner, ResChip } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { endingArtwork } from '../lib/endingArt';
import { openTelegramLink, shareLink, haptic } from '../lib/telegram';
import { NavLinks, type NavLink } from '../components/NavLinks';

/**
 * Прогресс — единственный экран коллекций (A2, 25.10.2026).
 *
 * Раньше «финалы» жили в трёх местах (EndingView + ссылки Профиля/Карьеры),
 * «цели» — в AchievementsView + чипе Профиля, «вехи» — списком в Профиле.
 * Теперь это три секции одного экрана, а Профиль — карточка жизни.
 * Сервер — источник истины за claim: action `claim_ending`.
 */

const DOORS: NavLink[] = [{ view: 'leaderboard', icon: 'trophy', label: t('Топ игроков'), hint: t('кто как живёт') }];

/** Иконка цели по её типу — хром без эмодзи (B1). */
const GOAL_ICON: Record<string, string> = {
  grade_reached: 'briefcase',
  money_made: 'coin',
  skill_level: 'book',
  days_survived: 'calendar',
  events_seen: 'dice',
  special: 'star',
};
/** Coins paid out for a finished goal — mirrors the meta ledger on the server. */
const GOAL_REWARD: Record<string, number> = {
  grade_reached: 150,
  money_made: 100,
  skill_level: 80,
  days_survived: 60,
  events_seen: 60,
  special: 120,
};
interface AchievementInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: {
    type: string;
    target?: string | number;
  };
}
const GRADE_INDEX = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return t('{p0}к', { p0: Math.round(n / 1000) });
  return String(Math.round(n));
}

export const ProgressView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [balance, setBalance] = useState<any | null>(null);
  const [achievements, setAchievements] = useState<AchievementInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/content/balance')
      .then((r) => r.json())
      .then((data) => setBalance(data.balance ?? null))
      .catch(() => setError(t('Не удалось загрузить условия финалов')));
    fetch('/api/content/achievements')
      .then((r) => r.json())
      .then((data) => setAchievements(data.achievements ?? []))
      .catch(() => setAchievements([]));
  }, []);

  const endings = useMemo(() => (player && balance ? checkEndings(player, balance) : []), [player, balance]);

  const ctoHoldDays = Math.max(0, Math.floor(balance?.endings?.cto?.minDaysAsCto ?? 60));
  const ctoTenure = player ? ctoTenureDays(player) : 0;
  const sittingCto = player?.grade === 'cto' && Boolean(player?.job);

  if (!player) return null;
  const meta = player.meta;
  const memories = meta?.memories ?? [];
  const careerEnding = (player as any).careerEnding;
  const milestones: Milestone[] = (player.milestones ?? []) as Milestone[];

  const claim = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const ok = await performAction('claim_ending', { endingId: id });
      if (!ok) setError(useGameStore.getState().error ?? t('Не удалось зафиксировать финал'));
    } finally {
      setBusy(null);
    }
  };

  // ---- Цели: прогресс считается из тех же полей, что и серверный check ----
  const earned = new Set(player.achievements ?? []);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + (h?.count ?? 0), 0);
  const maxSkillLevel = Object.values(player.skills ?? {}).reduce(
    (max: number, s: any) => Math.max(max, s.level ?? 0),
    0
  );
  const progress = (a: AchievementInfo): { value: number; target: number } => {
    const tg = Number(a.condition.target ?? 0);
    switch (a.condition.type) {
      case 'grade_reached':
        return { value: GRADE_INDEX.indexOf(player.grade), target: GRADE_INDEX.indexOf(String(a.condition.target)) };
      case 'money_made':
        return { value: Math.round(player.money ?? 0), target: tg };
      case 'skill_level':
        return { value: maxSkillLevel, target: tg };
      case 'days_survived':
        return { value: player.currentDay ?? 0, target: tg };
      case 'events_seen':
        return { value: eventsSeen, target: tg };
      case 'special':
        switch (a.condition.target) {
          case 'fullstack':
            return {
              value:
                Math.max(0, player.skills?.['javascript']?.level ?? 0) +
                Math.max(0, player.skills?.['python']?.level ?? 0),
              target: 60,
            };
          case 'burnout':
            return { value: player.burnoutDays ?? 0, target: 5 };
          case 'reputation_80':
            return { value: Math.round(player.reputation ?? 0), target: 80 };
          case 'mining_100k':
            return { value: Math.round(player.miningEarned ?? 0), target: 100000 };
          case 'mining_1m':
            return { value: Math.round(player.miningEarned ?? 0), target: 1000000 };
          default:
            return { value: 0, target: 1 };
        }
      default:
        return { value: 0, target: 1 };
    }
  };
  const goals = achievements.filter((a) => !earned.has(a.id));
  const trophies = achievements.filter((a) => earned.has(a.id));

  const GoalRow: React.FC<{ a: AchievementInfo; done: boolean }> = ({ a, done }) => {
    const { value, target } = progress(a);
    const pct = Math.max(0, Math.min(100, (value / Math.max(1, target)) * 100));
    return (
      <div className={`card card-sm goal-row ${done ? 'panel-note panel-note-gold' : ''}`}>
        <span className={`goal-check ${done ? 'is-done' : ''}`} aria-hidden="true">
          {done ? '✓' : ''}
        </span>
        <span className={`goal-icon ${done ? 'is-done' : ''}`} aria-hidden="true">
          <PixelIcon name={GOAL_ICON[a.condition.type] ?? 'target'} size={12} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-semibold ${done ? 'text-gold-300' : 'text-ink-100'}`}>{a.name}</span>
            <span className="goal-reward num">
              {done ? t('выполнено') : `+${GOAL_REWARD[a.condition.type] ?? 60}`}
              {!done && <span aria-hidden="true">{'\u00A0'}₽</span>}
            </span>
          </div>
          <p className="text-xs text-ink-500 leading-relaxed mt-0.5">{a.description}</p>
          {!done && (
            <div className="flex items-center gap-2 mt-2">
              <div className="meter flex-1">
                <span style={{ width: `${pct}%`, background: 'var(--green-dark)' }} />
              </div>
              <span className="num text-2xs text-ink-500 whitespace-nowrap">
                {fmt(value)}/{fmt(target)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle
        meta={
          <span className="num">
            {memories.length} / {endings.length || 6}
          </span>
        }
      >
        {t('Прогресс')}
      </ScreenTitle>
      <p className="subtle">{t('Финалы, цели и знаковые события — всё, что ты уже прожил и заработал.')}</p>
      {error && (
        <p role="alert" className="card card-sm text-sm text-clay-300">
          {error}
        </p>
      )}

      {/* ---- Финалы ---- */}
      <section aria-label={t('Финалы карьеры')}>
        <SectionTitle>{t('Финалы карьеры')}</SectionTitle>
        <p className="subtle mb-2">
          {t(
            'Шесть финалов из ТЗ. Положительные открываются при выполнении условий; отрицательные срабатывают сами, если долго игнорировать здоровье или деньги. После любого финала доступна «Новая жизнь» с постоянным бонусом XP.'
          )}
        </p>
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
                aria-label={t(e.title)}
              >
                <img
                  className="ending-art"
                  src={endingArtwork(e.id)}
                  alt=""
                  width={512}
                  height={307}
                  loading="lazy"
                  decoding="async"
                  onError={(ev) => {
                    ev.currentTarget.style.display = 'none';
                  }}
                />
                <div className="flex items-start gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-ink-100 leading-tight flex-1">{t(e.title)}</h3>
                  {seen && <span className="chip chip-gold shrink-0">{t('пройдено')}</span>}
                </div>
                <p className="text-sm text-ink-300 leading-relaxed mb-2">{t(e.description)}</p>
                {e.id === 'cto' && sittingCto && !seen && (
                  <div className="mb-2">
                    <div className="flex justify-between text-2xs text-ink-400 mb-1">
                      <span>{t('Срок в кресле CTO')}</span>
                      <span className="num">
                        {ctoTenure} / {ctoHoldDays} {t('дн.')}
                      </span>
                    </div>
                    <div className="meter">
                      <span
                        style={{
                          width: `${Math.max(2, Math.min(100, Math.round((ctoTenure / Math.max(1, ctoHoldDays)) * 100)))}%`,
                          background: e.available ? 'var(--green)' : 'var(--gold)',
                        }}
                      />
                    </div>
                  </div>
                )}
                {e.missing && !seen && <p className="text-2xs text-ochre-300 mb-2">{e.missing}</p>}
                <button
                  disabled={(!e.available && !seen) || !!busy}
                  onClick={() => claim(e.id)}
                  className={`btn w-full ${e.available && !seen ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {seen
                    ? t('Зафиксировано — начни новую жизнь')
                    : e.available
                      ? busy === e.id
                        ? t('Фиксируем…')
                        : t('Зафиксировать финал')
                      : t('Условия не выполнены')}
                </button>
              </article>
            );
          })}
          {endings.length === 0 && <p className="subtle">{t('Условия финалов подгружаются…')}</p>}
        </div>
        {meta && (
          <p className="subtle mt-2">
            {t('Прожито жизней:')} {meta.lives ?? 0} {t('· пройдено финалов:')} {memories.length} {t('· лучший грейд:')}{' '}
            {meta.bestGrade ?? '—'} {t('· глубочайший день:')} {meta.deepestDay ?? 0}
          </p>
        )}
      </section>

      {/* ---- Цели ---- */}
      <section aria-label={t('Цели')}>
        <SectionTitle>
          {t('Цели')}{' '}
          <span className="num text-2xs text-ink-500">
            {earned.size} / {achievements.length || 17}
          </span>
        </SectionTitle>
        {achievements.length === 0 && <Spinner label={t('Загрузка целей…')} />}
        {goals.length > 0 && (
          <>
            <p className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-400 mb-2">{t('В работе')}</p>
            <div className="space-y-2">
              {goals.map((a) => (
                <GoalRow key={a.id} a={a} done={false} />
              ))}
            </div>
          </>
        )}
        {trophies.length > 0 && (
          <>
            <p className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-400 mt-3 mb-2">
              {t('Выполнено')} ({trophies.length})
            </p>
            <div className="space-y-2">
              {trophies.map((a) => (
                <GoalRow key={a.id} a={a} done />
              ))}
            </div>
          </>
        )}
        <p className="subtle mt-2">
          {t('Цели платят монетами')} — {t('их курс не сгорает при «новой жизни».')}{' '}
          <ResChip tone="gold">{t('мета-валюта')}</ResChip>
        </p>
      </section>

      {/* ---- Знаковые события ---- */}
      <section aria-label={t('Знаковые события')}>
        <SectionTitle>{t('Знаковые события')}</SectionTitle>
        {milestones.length === 0 && <p className="subtle">{t('Пока пусто — проживи ещё пару дней.')}</p>}
        <ul className="milestone-feed">
          {milestones.map((m) => {
            const caption = t(m.key, m.params);
            return (
              <li key={m.id} className="milestone-post">
                <div className="milestone-body">
                  <p className="milestone-caption">{caption}</p>
                  <p className="milestone-day">
                    {t('День')} {m.day}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    haptic('selection');
                    openTelegramLink(
                      shareLink(caption, 'itlife_simulator_bot', (player as any).telegramId ?? 'player')
                    );
                  }}
                >
                  {t('Поделиться')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <NavLinks links={DOORS} />
    </div>
  );
};
