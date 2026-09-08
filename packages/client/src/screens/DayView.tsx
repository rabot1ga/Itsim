import React, { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { HomeRoomCard } from '../components/HomeRoomCard';
import { CareerPressureCard } from '../components/CareerPressureCard';
import { SprintCard } from '../components/SprintCard';
import { SectionTitle } from '../components/ui';
import { formatMoney } from './actionCatalogue';
import { tipForDay } from './dayTips';
import { hideMainButton, isMainButtonSupported, setMainButtonProgress, showMainButton } from '../lib/telegram';

interface DayViewProps {
  onAdvanceDay: () => void;
}

/** The four places a day is spent — the home screen only points at them. */
const DESTINATIONS = [
  { view: 'career', emoji: '💼', label: 'Работа', hint: 'задачи, проекты, подработки' },
  { view: 'skills', emoji: '📚', label: 'Обучение', hint: 'направления и учебные действия' },
  { view: 'rest', emoji: '🌿', label: 'Отдых', hint: 'сон, спорт, люди' },
  { view: 'shop', emoji: '🛍', label: 'Магазин', hint: 'техника, еда, апгрейды' },
] as const;

const CHALLENGE_TEXT: Record<string, string> = {
  ch_study_3: 'Выполни 3 учебных действия',
  ch_work_3: 'Закрой 3 рабочие задачи',
  ch_freelance_1: 'Откликнись на заказ на бирже',
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
  const setView = useGameStore((s) => s.setView);
  const checkIn = useGameStore((s) => s.checkIn);
  const mining = useGameStore((s) => s.mining);
  const [finishing, setFinishing] = useState(false);
  const useNativeCta = isMainButtonSupported();

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

      {/* Where the day is actually spent — each module now lives in its tab */}
      <section aria-label="Чем займёшься">
        <SectionTitle className="mb-2">Чем займёшься</SectionTitle>
        <div className="action-grid">
          {DESTINATIONS.map((d) => (
            <button key={d.view} onClick={() => setView(d.view)} className="tile tile-action" aria-label={d.label}>
              <span className="tile-icon" aria-hidden="true">
                {d.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-100 leading-tight">{d.label}</span>
                <span className="block text-2xs text-ink-500 leading-tight mt-0.5">{d.hint}</span>
              </span>
              <span className="text-ink-600 shrink-0" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
        {player.energy <= 2 && (
          <p className="flex items-center gap-2 text-xs text-ochre-300 leading-tight mt-2 px-0.5">
            <span className="shrink-0" aria-hidden="true">
              ⚡
            </span>
            Энергия на исходе. «Поспать» на вкладке «Отдых» вернёт её — сон доступен даже при нуле.
          </p>
        )}
      </section>

      {/* Weekly season sprint — the real-time target for the whole week */}
      <SprintCard />

      {/* Career pressure: living costs + what the next gate really needs */}
      <CareerPressureCard />

      {/* Mining farm (passive income) */}
      {mining && (
        <button
          onClick={() => setView('mining')}
          aria-label="Майнинг-ферма"
          className="card animate-pop-in w-full text-left"
        >
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
            Курс {mining.price.toFixed(1)} ₽/MH · доход начисляется в конце дня · открыть ферму →
          </p>
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
