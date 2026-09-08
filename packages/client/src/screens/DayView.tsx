import React, { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { HomeRoomCard } from '../components/HomeRoomCard';
import { CareerPressureCard } from '../components/CareerPressureCard';
import { EventCard, EventOutcomeCard, type EventChoice } from '../components/EventCard';
import { SprintCard } from '../components/SprintCard';
import { ResChip, SectionTitle } from '../components/ui';
import { tipForDay } from './dayTips';
import { hideMainButton, isMainButtonSupported, setMainButtonProgress, showMainButton } from '../lib/telegram';

interface DayViewProps {
  onAdvanceDay: () => void;
}

interface SideJobInfo {
  name: string;
  icon: string;
  energy: number;
  payment: number;
  paymentPerSkill?: number;
  paymentVar?: number;
  health?: number;
  motivation?: number;
  minSkill?: number;
  minDay?: number;
}

/** Feedable pets — cosmetic accessories (pet_bow/...) are not dinner guests */
const REAL_PETS = [
  'pet_cat',
  'pet_dog',
  'pet_cactus',
  'pet_robo',
  'pet_spider',
  'pet_bulldog',
  'pet_parrot',
  'pet_hamster',
  'pet_fish',
];

const ACTIONS = [
  // Study
  { id: 'study_youtube', emoji: '📺', name: 'YouTube туториалы', energy: 2, cost: 0, category: 'study' },
  { id: 'study_book', emoji: '📚', name: 'Читать книгу', energy: 1, cost: 1500, category: 'study' },
  { id: 'study_stepik', emoji: '🎓', name: 'Stepik курс', energy: 2, cost: 2000, category: 'study' },
  { id: 'study_course', emoji: '💻', name: 'Платный курс', energy: 3, cost: 15000, category: 'study' },
  { id: 'study_english', emoji: '🇬🇧', name: 'Английский', energy: 2, cost: 0, category: 'study' },
  { id: 'study_english_course', emoji: '🗣️', name: 'Курс английского', energy: 3, cost: 3000, category: 'study' },

  // Work
  { id: 'work_task', emoji: '💼', name: 'Рабочая задача', energy: 4, cost: 0, category: 'work' },
  { id: 'work_overtime', emoji: '🌙', name: 'Переработка', energy: 5, cost: 0, category: 'work' },
  { id: 'pet_project', emoji: '🚀', name: 'Пет-проект', energy: 3, cost: 0, category: 'work' },
  { id: 'freelance', emoji: '🧑‍💻', name: 'Фриланс-заказ', energy: 4, cost: 0, category: 'work' },

  // Rest
  { id: 'rest_sleep', emoji: '😴', name: 'Поспать', energy: 0, cost: 0, category: 'rest' },
  { id: 'rest_walk', emoji: '🚶', name: 'Прогулка', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_bar', emoji: '🍻', name: 'Бар с друзьями', energy: 2, cost: 2000, category: 'rest' },
  { id: 'rest_hobby', emoji: '🎲', name: 'Хобби', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_gym', emoji: '🏋️', name: 'Качалка', energy: 2, cost: 3000, category: 'rest' },

  // Social
  { id: 'networking', emoji: '🤝', name: 'Нетворкинг', energy: 2, cost: 0, category: 'social' },
];

/** Side gigs keep their own emoji — the chrome speaks emoji everywhere. */
const SIDE_JOB_EMOJI: Record<string, string> = {
  courier: '📦',
  barista: '☕',
  loader: '🪑',
  night_guard: '🌙',
  taxi: '🚕',
  tutor: '🎓',
  streamer: '🎬',
};

const CHALLENGE_TEXT: Record<string, string> = {
  ch_study_3: 'Выполни 3 учебных действия',
  ch_work_3: 'Закрой 3 рабочие задачи',
  ch_freelance_1: 'Выполни 1 фриланс-заказ',
  ch_networking_1: 'Сходи на нетворкинг',
  ch_rest_2: 'Отдохни 2 раза',
  ch_sidejob_1: 'Возьми любую подработку',
  ch_petproject_1: 'Поработай над пет-проектом',
  ch_english_1: 'Позанимайся английским',
  ch_bar_1: 'Сходи в бар',
  ch_shop_1: 'Купи что-нибудь в магазине',
  ch_gym_1: 'Сходи в зал',
  ch_walk_2: 'Погуляй 2 раза',
  ch_feed_pet_1: 'Покорми питомца',
};

/** Cost line under an action: energy always, money only when it bites. */
const CostRow: React.FC<{ energy: number; cost?: number; children?: React.ReactNode }> = ({
  energy,
  cost,
  children,
}) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <ResChip tone="blue">−{energy} ⚡</ResChip>
    {!!cost && <ResChip tone="negative">−{formatMoney(cost)} ₽</ResChip>}
    {children}
  </div>
);

/**
 * Yesterday's narration is context, not a decision — so it is one quiet line
 * that opens on tap instead of a tall panel pushing today's choices down.
 */
const YesterdayLog: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left touch-target"
      >
        <span className="shrink-0" aria-hidden="true">
          🕘
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-500 shrink-0">Вчера</span>
        {!open && <span className="flex-1 min-w-0 truncate text-xs text-ink-400">{text.replace(/\n/g, ' · ')}</span>}
        <span aria-hidden="true" className={`accordion-chevron shrink-0 ${open ? 'is-open' : ''}`}>
          ▾
        </span>
      </button>
      <div className={`accordion-body ${open ? 'open' : ''}`}>
        <div className="accordion-inner">
          <p className="text-sm text-ink-300 leading-relaxed whitespace-pre-line pt-1">{text}</p>
        </div>
      </div>
    </section>
  );
};

/** localStorage key: the last day whose tip the player dismissed */
const ONBOARD_DISMISS_KEY = 'itsim_tip_dismissed_day';

/** First-week coaching card — one tip per day, dismissible until next day. */
const OnboardingTip: React.FC<{ day: number }> = ({ day }) => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARD_DISMISS_KEY) === String(day);
    } catch {
      return false;
    }
  });
  const tip = tipForDay(day);
  if (!tip || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(ONBOARD_DISMISS_KEY, String(day));
    } catch {
      /* storage unavailable — fine, tip re-shows next visit */
    }
  };

  return (
    <section className="card panel-note panel-note-sky animate-pop-in">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
          {tip.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-100 leading-tight">{tip.title}</p>
          <p className="text-xs text-ink-300 leading-relaxed mt-1">{tip.body}</p>
        </div>
        <button
          onClick={hide}
          aria-label="Скрыть совет"
          className="text-2xs text-ink-600 hover:text-ink-300 transition-colors shrink-0 flex items-center justify-center !min-w-[36px] touch-target px-1"
        >
          ✕
        </button>
      </div>
    </section>
  );
};

const CHECKIN_SEEN_KEY = 'itsim_checkin_seen';

/** Once per real day: «заходишь N дней подряд — +X ₽» after the server check-in. */
const CheckInBanner: React.FC<{ checkIn: any }> = ({ checkIn }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!checkIn?.claimed) return;
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem(CHECKIN_SEEN_KEY) === today) return;
      localStorage.setItem(CHECKIN_SEEN_KEY, today);
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [checkIn]);

  if (!visible || !checkIn?.claimed) return null;
  const { streak, money, nextMoney } = checkIn;
  return (
    <section className="card panel-note panel-note-gold animate-pop-in">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
          🔥
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            Стрик: {streak} {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} подряд
            {money > 0 && <span className="num text-moss-300"> · +{money} ₽ за вход</span>}
          </p>
          {nextMoney > 0 && (
            <p className="text-xs text-ink-400 leading-relaxed mt-0.5">
              Возвращайся завтра — получишь <span className="num text-ink-200">{nextMoney} ₽</span>. Пропустишь день —
              стрик сгорит.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export const DayView: React.FC<DayViewProps> = ({ onAdvanceDay }) => {
  const player = useGameStore((s) => s.player);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const performAction = useGameStore((s) => s.performAction);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const checkIn = useGameStore((s) => s.checkIn);
  const mining = useGameStore((s) => s.mining);
  const [sideJobs, setSideJobs] = useState<Record<string, SideJobInfo>>({});
  const [finishing, setFinishing] = useState(false);
  /** the choice the player just made, shown as a receipt until they continue */
  const [outcome, setOutcome] = useState<{ title: string; tags: string[]; choice: EventChoice } | null>(null);
  const useNativeCta = isMainButtonSupported();

  useEffect(() => {
    fetch('/api/content/side-jobs')
      .then((r) => r.json())
      .then((data) => setSideJobs(data.sideJobs ?? {}))
      .catch(() => setSideJobs({}));
  }, []);

  /** Commit a choice, then keep its consequences on screen until dismissed. */
  const decide = async (event: any, index: number) => {
    const choice = event.choices?.[index];
    await chooseEvent(event.id, index);
    if (!useGameStore.getState().activeEvent && choice) {
      setOutcome({ title: event.title, tags: event.tags ?? [], choice });
    }
  };

  const finishDay = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    setMainButtonProgress(true);
    try {
      await onAdvanceDay();
    } finally {
      setFinishing(false);
      setMainButtonProgress(false);
      // The day summary + new event render at the top — take the player there.
      document.getElementById('game-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [finishing, onAdvanceDay]);

  const currentDay = player?.currentDay ?? 1;

  // Native Telegram MainButton replaces the in-page button when available.
  useEffect(() => {
    if (!useNativeCta) return;
    if (activeEvent) {
      hideMainButton();
      return;
    }
    const handler = () => {
      void finishDay();
    };
    showMainButton(`Завершить день ${currentDay}`, handler);
    return () => hideMainButton(handler);
  }, [useNativeCta, finishDay, currentDay, activeEvent]);

  if (!player) return null;

  const handleAction = (actionId: string) => {
    performAction(actionId, { skillId: player.mainSkillId || 'javascript' });
  };

  const canAct = (energy: number) => player.energy >= energy;
  const canAfford = (cost: number) => (player.money ?? 0) >= cost;

  const categories = [
    { id: 'study', label: 'Учёба', actions: ACTIONS.filter((a) => a.category === 'study') },
    { id: 'work', label: 'Работа и проекты', actions: ACTIONS.filter((a) => a.category === 'work') },
    { id: 'rest', label: 'Отдых', actions: ACTIONS.filter((a) => a.category === 'rest') },
    { id: 'social', label: 'Социальное', actions: ACTIONS.filter((a) => a.category === 'social') },
  ];

  if (activeEvent) {
    return (
      <EventCard
        key={activeEvent.id}
        eventId={activeEvent.id}
        title={activeEvent.title}
        description={activeEvent.description}
        tags={activeEvent.tags ?? []}
        choices={activeEvent.choices ?? []}
        player={player}
        error={error}
        onChoose={(i) => decide(activeEvent, i)}
      />
    );
  }

  // The receipt of the decision the server has just applied.
  if (outcome) {
    return (
      <EventOutcomeCard
        title={outcome.title}
        tags={outcome.tags}
        choice={outcome.choice}
        onDismiss={() => setOutcome(null)}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <HomeRoomCard />
      {/* Daily check-in reward — once per real day */}
      {checkIn && <CheckInBanner checkIn={checkIn} />}

      {/* Error */}
      {error && (
        <button onClick={clearError} className="card panel-note panel-note-clay w-full text-left animate-pop-in">
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </p>
          <p className="text-2xs text-ink-500 mt-1 pl-5">Нажми, чтобы скрыть</p>
        </button>
      )}

      <OnboardingTip day={currentDay} />

      {/* Yesterday's log — one line, expandable */}
      {player._lastEvent && <YesterdayLog text={player._lastEvent} />}

      {/* Mining farm (passive income) */}
      {mining && (
        <section className="card animate-pop-in">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
              <span aria-hidden="true">⛏</span>
              Майнинг-ферма
            </span>
            <span className="num text-2xs text-ink-500">{mining.hashrate} MH/s</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="num text-moss-300">+{formatMoney(mining.gross)} ₽</span>
            <span className="num text-ink-500">−{formatMoney(mining.electricity)} ₽ свет</span>
            <span className="num text-white font-semibold">
              {mining.net >= 0 ? '+' : ''}
              {formatMoney(mining.net)} ₽/день
            </span>
          </div>
          <p className="text-2xs text-ink-600 mt-1.5">
            Курс {mining.price.toFixed(1)} ₽/MH · доход начисляется в конце дня
          </p>
        </section>
      )}

      {/* Goal of the day — a target above the toolbox reads as direction,
          a target buried under it reads as homework */}
      {player.dailyChallenge && (
        <section className={`card panel-note ${player.dailyChallenge.done ? 'panel-note-moss' : 'panel-note-sky'}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.09em] text-ink-400">
              <span aria-hidden="true">🎯</span>
              Задание дня
            </span>
            {player.dailyChallenge.done ? (
              <span className="flex items-center gap-1 text-2xs font-bold text-moss-300 uppercase tracking-[0.06em]">
                <span aria-hidden="true">✅</span>
                выполнено
              </span>
            ) : (
              <span className="num text-2xs text-ink-500">
                {player.dailyChallenge.progress}/{player.dailyChallenge.count}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-200">{CHALLENGE_TEXT[player.dailyChallenge.id] ?? 'Выполни задание'}</p>
          {!player.dailyChallenge.done && (
            <div className="meter mt-2">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    (player.dailyChallenge.progress / Math.max(1, player.dailyChallenge.count)) * 100
                  )}%`,
                  background: 'var(--sky)',
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* Weekly season sprint — the real-time target for the whole week */}
      <SprintCard />

      {/* Career pressure: living costs + what the next gate really needs */}
      <CareerPressureCard />

      {/* Low energy: tell the player the way out instead of leaving actions grey */}
      {player.energy <= 2 && (
        <p className="flex items-center gap-2 text-xs text-ochre-300 leading-tight px-0.5">
          <span className="shrink-0" aria-hidden="true">
            ⚡
          </span>
          Энергия на исходе. «Поспать» восстановит её — а сон всегда доступен, даже при нуле.
        </p>
      )}

      {/* Actions by category */}
      {categories.map((cat) => (
        <section key={cat.id}>
          <SectionTitle className="mb-2">{cat.label}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {cat.actions.map((action) => {
              const enabled = canAct(action.energy) && canAfford(action.cost);
              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  disabled={!enabled}
                  className="tile tile-action"
                >
                  <span className="tile-icon" aria-hidden="true">
                    {action.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-100 leading-tight mb-1.5">{action.name}</span>
                    <CostRow energy={action.energy} cost={action.cost} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Side jobs (non-IT gigs) */}
      {Object.keys(sideJobs).length > 0 && (
        <section>
          <SectionTitle className="mb-2">Подработки не в IT</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(sideJobs).map(([jobId, job]) => {
              const skillLevel = player.skills?.[player.mainSkillId ?? 'javascript']?.level ?? 0;
              const enabled = canAct(job.energy) && (player.currentDay ?? 0) >= (job.minDay ?? 1);
              const minSkillMet = skillLevel >= (job.minSkill ?? 0);
              const payout = job.payment + (job.paymentPerSkill ? Math.round(skillLevel * job.paymentPerSkill) : 0);
              return (
                <button
                  key={jobId}
                  onClick={() => performAction('side_job', { jobId })}
                  disabled={!enabled || !minSkillMet}
                  title={!minSkillMet ? `Нужен навык ${job.minSkill}+` : job.name}
                  className="tile tile-action"
                >
                  <span className="tile-icon" aria-hidden="true">
                    {SIDE_JOB_EMOJI[jobId] ?? '📦'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-100 leading-tight mb-1.5">{job.name}</span>
                    <CostRow energy={job.energy}>
                      <ResChip tone="positive">
                        +{formatMoney(payout)}
                        {job.paymentVar ? '±' : ''} ₽
                      </ResChip>
                      {!minSkillMet && <ResChip tone="orange">🔒 {job.minSkill}+</ResChip>}
                    </CostRow>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-2xs text-ink-600 mt-1.5">Одна подработка в день. Здоровье и настроение — по курсу.</p>
        </section>
      )}

      {/* Feed pet (real pets only — bows don't eat) */}
      {(player.items ?? []).some((id: string) => REAL_PETS.includes(id)) && (
        <button
          onClick={() => performAction('feed_pet')}
          disabled={!!player.petFedToday}
          className="btn btn-secondary w-full text-sm"
        >
          <span aria-hidden="true">🐾</span>
          {player.petFedToday ? 'Питомец сыт до завтра' : 'Покормить питомца · 500 ₽'}
        </button>
      )}

      {/* Banked offline days */}
      {(player.bankedDays ?? 0) > 0 && (
        <button onClick={() => performAction('use_banked_day')} className="btn btn-secondary w-full text-sm">
          <span aria-hidden="true">🕒</span>
          <span>
            Банк офлайн-дней: <span className="num">{player.bankedDays}</span> — использовать
          </span>
        </button>
      )}

      {/* End day — sticky fallback for non-Telegram browsers
          (inside Telegram the native MainButton is used, see the effect above) */}
      {!useNativeCta && (
        <div className="day-end-action">
          <button onClick={() => void finishDay()} disabled={finishing} className="btn btn-primary btn-lg w-full mt-2">
            {finishing ? (
              'Считаем день…'
            ) : (
              <>
                Завершить день <span className="num">{player.currentDay ?? 1}</span> →
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} млн`;
  if (amount >= 10_000) return `${Math.round(amount / 1000)} тыс`;
  return amount.toLocaleString('ru-RU');
}
