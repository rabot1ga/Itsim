import { t } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { HomeRoomCard } from '../components/HomeRoomCard';
import { ActionGrid, toTile } from '../components/ActionGrid';
import { challengeDelegate, pickDayPlan } from './dayPlan';
import { SprintCard } from '../components/SprintCard';
import { SectionTitle, accordionBodyRef } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { formatMoney } from './actionCatalogue';
import { tipForDay } from './dayTips';
/**
 * Where a day goes outside the tabs (A2): работа и обучение — табы, а быт и
 * траты остаются дверями с «Сегодня».
 */
const DESTINATIONS = [
  { view: 'rest', icon: 'walk', label: t('Отдых'), hint: t('сон, спорт, люди') },
  { view: 'shop', icon: 'bag', label: t('Магазин'), hint: t('техника, еда, апгрейды') },
  { view: 'room', icon: 'house', label: t('Дом'), hint: t('комната, декор, гардероб') },
  { view: 'profile', icon: 'person', label: t('Профиль'), hint: t('цели, достижения, настройки') },
] as const;
const CHALLENGE_TEXT: Record<string, string> = {
  ch_study_3: t('Выполни 3 учебных действия'),
  ch_work_3: t('Закрой 3 рабочие задачи'),
  ch_freelance_1: t('Откликнись на заказ на бирже'),
  ch_networking_1: t('Сходи на нетворкинг'),
  ch_rest_2: t('Отдохни 2 раза'),
  ch_sidejob_1: t('Возьми любую подработку'),
  ch_petproject_1: t('Поработай над пет-проектом'),
  ch_english_1: t('Позанимайся английским'),
  ch_bar_1: t('Сходи в бар'),
  ch_shop_1: t('Купи что-нибудь в магазине'),
  ch_gym_1: t('Сходи в зал'),
  ch_walk_2: t('Погуляй 2 раза'),
  ch_feed_pet_1: t('Покорми питомца'),
};
/** localStorage key: the last day whose tip the player dismissed */
const ONBOARD_DISMISS_KEY = 'itsim_tip_dismissed_day';
/** First-week coaching card — one tip per day, dismissible until next day. */
const OnboardingTip: React.FC<{
  day: number;
}> = ({ day }) => {
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
          <PixelIcon name="star" size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-100 leading-tight">{tip.title}</p>
          <p className="text-xs text-ink-300 leading-relaxed mt-1">{tip.body}</p>
        </div>
        <button
          onClick={hide}
          aria-label={t('Скрыть совет')}
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
const CheckInBanner: React.FC<{
  checkIn: any;
}> = ({ checkIn }) => {
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
          <PixelIcon name="flame" size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            {t('Стрик:')} {streak} {streak === 1 ? t('день') : streak < 5 ? t('дня') : t('дней')} {t('подряд')}
            {money > 0 && (
              <span className="num text-moss-300">
                {' '}
                · +{money} {t('₽ за вход')}
              </span>
            )}
          </p>
          {nextMoney > 0 && (
            <p className="text-xs text-ink-400 leading-relaxed mt-0.5">
              {t('Возвращайся завтра — получишь')} <span className="num text-ink-200">{nextMoney} ₽</span>
              {t('. Пропустишь день — стрик сгорит.')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
export const DayView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const setView = useGameStore((s) => s.setView);
  const checkIn = useGameStore((s) => s.checkIn);
  const mining = useGameStore((s) => s.mining);
  const currentDay = player?.currentDay ?? 1;
  const [busy, setBusy] = useState(false);
  if (!player) return null;
  // План дня (B): детерминированный подбор быстрых действий — см. dayPlan.ts
  const dayPlan = pickDayPlan(player);
  return (
    <div className="space-y-4 animate-fade-in">
      <HomeRoomCard />
      {/* Daily check-in reward — once per real day */}
      {checkIn && <CheckInBanner checkIn={checkIn} />}

      <OnboardingTip day={currentDay} />

      {/* Goal of the day — a target above the toolbox reads as direction,
            a target buried under it reads as homework */}
      {player.dailyChallenge && (
        <section className={`card panel-note ${player.dailyChallenge.done ? 'panel-note-moss' : 'panel-note-sky'}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.09em] text-ink-400">
              <PixelIcon name="target" size={12} />
              {t('Задание дня')}
            </span>
            {player.dailyChallenge.done ? (
              <span className="flex items-center gap-1 text-2xs font-bold text-moss-300 uppercase tracking-[0.06em]">
                <PixelIcon name="check" size={12} />
                {t('выполнено')}
              </span>
            ) : (
              <span className="num text-2xs text-ink-500">
                {player.dailyChallenge.progress}/{player.dailyChallenge.count}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-200">{CHALLENGE_TEXT[player.dailyChallenge.id] ?? t('Выполни задание')}</p>
          {!player.dailyChallenge.done && (
            <>
              <div className="meter mt-2">
                <span
                  style={{
                    width: `${Math.min(100, (player.dailyChallenge.progress / Math.max(1, player.dailyChallenge.count)) * 100)}%`,
                    background: 'var(--sky)',
                  }}
                />
              </div>
              {(() => {
                // Клик по заданию запускает действие-подсказку или открывает нужный экран
                const delegate = challengeDelegate(
                  {
                    action: (player.dailyChallenge as any).action ?? '',
                    match: (player.dailyChallenge as any).match,
                  },
                  player.money ?? 0
                );
                if (!delegate) return null;
                return (
                  <button
                    className="btn btn-secondary w-full text-sm mt-2"
                    disabled={busy}
                    onClick={() => {
                      if (delegate.kind === 'action') {
                        if (busy) return;
                        setBusy(true);
                        void performAction(delegate.action.id, {
                          skillId: player.mainSkillId || 'javascript',
                        }).finally(() => setBusy(false));
                      } else {
                        setView(delegate.view);
                      }
                    }}
                  >
                    {delegate.label} →
                  </button>
                );
              })()}
            </>
          )}
        </section>
      )}

      {/* План дня: быстрые действия прямо здесь — без прыжков по табам (B, 28.10) */}
      <section aria-label={t('План дня')}>
        <SectionTitle className="mb-2">{t('План дня')}</SectionTitle>
        <ActionGrid
          label={t('Быстрые действия')}
          actions={dayPlan.map((a) => toTile(a, Boolean(player.job)))}
          energy={player.energy ?? 0}
          money={player.money ?? 0}
          onRun={(id) => {
            if (busy) return;
            setBusy(true);
            void performAction(id, { skillId: player.mainSkillId || 'javascript' }).finally(() => setBusy(false));
          }}
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setView('career')} className="btn btn-ghost flex-1 text-xs">
            {t('Все рабочие')} →
          </button>
          <button onClick={() => setView('skills')} className="btn btn-ghost flex-1 text-xs">
            {t('Всё обучение')} →
          </button>
        </div>
      </section>

      {/* Doors: быт и траты — туда, где действия требуют контекста */}
      <section aria-label={t('Переходы')}>
        <div className="action-grid">
          {DESTINATIONS.map((d) => (
            <button key={d.view} onClick={() => setView(d.view)} className="tile tile-action" aria-label={d.label}>
              <span className="tile-icon" aria-hidden="true">
                <PixelIcon name={d.icon} size={18} />
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
              <PixelIcon name="bolt" size={12} />
            </span>
            {t('Энергия на исходе. «Поспать» на вкладке «Отдых» вернёт её — сон доступен даже при нуле.')}
          </p>
        )}
      </section>

      {/* Weekly season sprint — the real-time target for the whole week */}
      <SprintCard />

      {/* Mining farm (passive income) */}
      {mining && (
        <button
          onClick={() => setView('mining')}
          aria-label={t('Майнинг-ферма')}
          className="card animate-pop-in w-full text-left"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
              <PixelIcon name="chip" size={14} />
              {t('Майнинг-ферма')}
            </span>
            <span className="num text-2xs text-ink-500">{mining.hashrate} MH/s</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="num text-moss-300">+{formatMoney(mining.gross)} ₽</span>
            <span className="num text-ink-500">
              −{formatMoney(mining.electricity)} {t('₽ свет')}
            </span>
            <span className="num text-white font-semibold">
              {mining.net >= 0 ? '+' : ''}
              {formatMoney(mining.net)} {t('₽/день')}
            </span>
          </div>
          <p className="text-2xs text-ink-600 mt-1.5">
            {t('Курс')} {mining.price.toFixed(1)} {t('₽/MH · доход начисляется в конце дня · открыть ферму →')}
          </p>
        </button>
      )}

      {/* Banked offline days */}
      {(player.bankedDays ?? 0) > 0 && (
        <button onClick={() => performAction('use_banked_day')} className="btn btn-secondary w-full text-sm">
          <PixelIcon name="clock" size={14} />
          <span>
            {t('Банк офлайн-дней:')} <span className="num">{player.bankedDays}</span> {t('— использовать')}
          </span>
        </button>
      )}
    </div>
  );
};
