import React, { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CareerPressureCard } from '../components/CareerPressureCard';
import { PixelIcon } from '../components/pixel/PixelIcon';
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
  { id: 'study_youtube', icon: 'screen', name: 'YouTube туториалы', energy: 2, cost: 0, category: 'study' },
  { id: 'study_book', icon: 'book', name: 'Читать книгу', energy: 1, cost: 1500, category: 'study' },
  { id: 'study_stepik', icon: 'cap', name: 'Stepik курс', energy: 2, cost: 2000, category: 'study' },
  { id: 'study_course', icon: 'laptop', name: 'Платный курс', energy: 3, cost: 15000, category: 'study' },
  { id: 'study_english', icon: 'globe', name: 'Английский', energy: 2, cost: 0, category: 'study' },
  { id: 'study_english_course', icon: 'chat', name: 'Курс английского', energy: 3, cost: 3000, category: 'study' },

  // Work
  { id: 'work_task', icon: 'briefcase', name: 'Рабочая задача', energy: 4, cost: 0, category: 'work' },
  { id: 'work_overtime', icon: 'moon', name: 'Переработка', energy: 5, cost: 0, category: 'work' },
  { id: 'pet_project', icon: 'rocket', name: 'Пет-проект', energy: 3, cost: 0, category: 'work' },
  { id: 'freelance', icon: 'code', name: 'Фриланс-заказ', energy: 4, cost: 0, category: 'work' },

  // Rest
  { id: 'rest_sleep', icon: 'sleep', name: 'Поспать', energy: 0, cost: 0, category: 'rest' },
  { id: 'rest_walk', icon: 'walk', name: 'Прогулка', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_bar', icon: 'mug', name: 'Бар с друзьями', energy: 2, cost: 2000, category: 'rest' },
  { id: 'rest_hobby', icon: 'dice', name: 'Хобби', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_gym', icon: 'dumbbell', name: 'Качалка', energy: 2, cost: 3000, category: 'rest' },

  // Social
  { id: 'networking', icon: 'people', name: 'Нетворкинг', energy: 2, cost: 0, category: 'social' },
];

/** Content ships emoji for side jobs; the interface speaks pixels. */
const SIDE_JOB_ICONS: Record<string, string> = {
  courier: 'box',
  barista: 'mug',
  loader: 'box',
  night_guard: 'moon',
  taxi: 'car',
  tutor: 'cap',
  streamer: 'screen',
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
  <div className="flex items-center gap-2.5 text-2xs text-ink-500">
    <span className="flex items-center gap-1">
      <PixelIcon name="bolt" size={9} className="text-sky-300/70" />
      <span className="num">{energy}</span>
    </span>
    {!!cost && <span className="num">{formatMoney(cost)} ₽</span>}
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
    <section className="panel">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left touch-target !min-h-[32px]"
      >
        <PixelIcon name="clock" size={11} className="text-ink-500 shrink-0" />
        <span className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-500 shrink-0">Вчера</span>
        {!open && <span className="flex-1 min-w-0 truncate text-xs text-ink-400">{text.replace(/\n/g, ' · ')}</span>}
        <PixelIcon
          name="chevron"
          size={9}
          className={`text-ink-600 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
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
    <section className="panel panel-note panel-note-sky animate-pop-in">
      <div className="flex items-start gap-2">
        <PixelIcon name={tip.icon} size={13} className="text-sky-300 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-100 leading-tight">{tip.title}</p>
          <p className="text-xs text-ink-300 leading-relaxed mt-1">{tip.body}</p>
        </div>
        <button
          onClick={hide}
          aria-label="Скрыть совет"
          className="text-2xs text-ink-600 hover:text-ink-300 transition-colors shrink-0 touch-target !min-h-[28px] px-1 -mt-1"
        >
          ✕
        </button>
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
  const mining = useGameStore((s) => s.mining);
  const [sideJobs, setSideJobs] = useState<Record<string, SideJobInfo>>({});
  const [finishing, setFinishing] = useState(false);
  const useNativeCta = isMainButtonSupported();

  useEffect(() => {
    fetch('/api/content/side-jobs')
      .then((r) => r.json())
      .then((data) => setSideJobs(data.sideJobs ?? {}))
      .catch(() => setSideJobs({}));
  }, []);

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
    const handler = () => {
      void finishDay();
    };
    showMainButton(`Завершить день ${currentDay}`, handler);
    return () => hideMainButton(handler);
  }, [useNativeCta, finishDay, currentDay]);

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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* First week: one pointer per day instead of a wall of grids */}
      <OnboardingTip day={currentDay} />

      {/* Active event */}
      {activeEvent && (
        <section className="panel panel-note panel-note-gold animate-pop-in">
          <p className="text-sm font-semibold text-white mb-1">{activeEvent.title}</p>
          <p className="text-sm text-ink-300 leading-relaxed mb-3">{activeEvent.description}</p>
          <div className="space-y-1.5">
            {activeEvent.choices.map((choice: { text: string }, i: number) => (
              <button
                key={i}
                onClick={() => chooseEvent(activeEvent.id, i)}
                className="tile w-full flex items-center gap-2 text-sm text-ink-100 touch-target"
              >
                <PixelIcon name="arrow" size={11} className="text-ink-600" />
                <span className="min-w-0">{choice.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <button onClick={clearError} className="panel panel-note panel-note-clay w-full text-left animate-pop-in">
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <PixelIcon name="warn" size={12} className="mt-0.5" />
            <span>{error}</span>
          </p>
          <p className="text-2xs text-ink-500 mt-1 pl-5">Нажми, чтобы скрыть</p>
        </button>
      )}

      {/* Yesterday's log — one line, expandable */}
      {player._lastEvent && <YesterdayLog text={player._lastEvent} />}

      {/* Mining farm (passive income) */}
      {mining && (
        <section className="panel animate-pop-in">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
              <PixelIcon name="chip" size={12} className="text-ink-400" />
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
        <section className={`panel panel-note ${player.dailyChallenge.done ? 'panel-note-moss' : 'panel-note-sky'}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.09em] text-ink-400">
              <PixelIcon name="target" size={11} className={player.dailyChallenge.done ? 'text-moss-300' : ''} />
              Задание дня
            </span>
            {player.dailyChallenge.done ? (
              <span className="flex items-center gap-1 text-2xs font-bold text-moss-300 uppercase tracking-[0.06em]">
                <PixelIcon name="check" size={10} />
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

      {/* Career pressure: living costs + what the next gate really needs */}
      <CareerPressureCard />

      {/* Low energy: tell the player the way out instead of leaving actions grey */}
      {player.energy <= 2 && (
        <p className="flex items-center gap-2 text-xs text-ochre-300 leading-tight px-0.5">
          <PixelIcon name="bolt" size={11} className="text-ochre-400 shrink-0" />
          Энергия на исходе. «Поспать» восстановит её — а сон всегда доступен, даже при нуле.
        </p>
      )}

      {/* Actions by category */}
      {categories.map((cat) => (
        <section key={cat.id}>
          <h3 className="eyebrow mb-2">{cat.label}</h3>
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
                  <span className="tile-icon">
                    <PixelIcon name={action.icon} size={16} />
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
          <h3 className="eyebrow mb-2">Подработки не в IT</h3>
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
                  <span className="tile-icon">
                    <PixelIcon name={SIDE_JOB_ICONS[jobId] ?? 'box'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-100 leading-tight mb-1.5">{job.name}</span>
                    <CostRow energy={job.energy}>
                      <span className="num text-moss-300">
                        +{formatMoney(payout)}
                        {job.paymentVar ? '±' : ''} ₽
                      </span>
                      {!minSkillMet && (
                        <span className="flex items-center gap-1 text-ink-600">
                          <PixelIcon name="lock" size={9} />
                          <span className="num">{job.minSkill}+</span>
                        </span>
                      )}
                    </CostRow>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-2xs text-ink-600 mt-1.5">Одна подработка в день. Здоровье и мотивация — по курсу.</p>
        </section>
      )}

      {/* Feed pet (real pets only — bows don't eat) */}
      {(player.items ?? []).some((id: string) => REAL_PETS.includes(id)) && (
        <button
          onClick={() => performAction('feed_pet')}
          disabled={!!player.petFedToday}
          className="btn btn-secondary w-full text-sm"
        >
          <PixelIcon name="bone" size={12} className={player.petFedToday ? 'text-moss-400' : ''} />
          {player.petFedToday ? 'Питомец сыт до завтра' : 'Покормить питомца · 500 ₽'}
        </button>
      )}

      {/* Banked offline days */}
      {(player.bankedDays ?? 0) > 0 && (
        <button onClick={() => performAction('use_banked_day')} className="btn btn-secondary w-full text-sm">
          <PixelIcon name="clock" size={12} className="text-gold-300" />
          <span>
            Банк офлайн-дней: <span className="num">{player.bankedDays}</span> — использовать
          </span>
        </button>
      )}

      {/* End day — sticky fallback for non-Telegram browsers
          (inside Telegram the native MainButton is used, see the effect above) */}
      {!useNativeCta && (
        <div className="sticky-cta">
          <button onClick={() => void finishDay()} disabled={finishing} className="btn btn-primary btn-lg w-full mt-2">
            {finishing ? (
              'Считаем день…'
            ) : (
              <>
                Завершить день <span className="num">{player.currentDay ?? 1}</span>
                <PixelIcon name="arrow" size={12} />
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
