import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { ProfileView } from '../screens/ProfileView';
import { FriendsView } from '../screens/FriendsView';
import { DayView } from '../screens/DayView';
import { OfficeView } from '../screens/OfficeView';
import { SkillsView } from '../screens/SkillsView';
import { RestView } from '../screens/RestView';
import { CareerView } from '../screens/CareerView';
import { ShopView } from '../screens/ShopView';
import { RoomView } from '../screens/RoomView';
import { ProgressView } from '../screens/ProgressView';
import { LeaderboardView } from '../screens/LeaderboardView';
import { MiningView } from '../screens/MiningView';
import { PetView } from '../screens/PetView';
import { SettingsView } from '../screens/SettingsView';
import { PixelIcon } from './pixel/PixelIcon';
import { GainStream } from './GainStream';
import { EventCard, EventOutcomeCard, type EventChoice } from './EventCard';
import { DaySummaryCard } from './DaySummaryCard';
import { ErrorToast } from './ErrorToast';
import { DayEndDock } from './DayEndDock';
/**
 * Новая IA (A2, 25.10.2026): четыре таба — Сегодня / Работа / Развитие /
 * Прогресс. «Мир» (дом, питомец, друзья, офис, майнинг, магазин) живёт в
 * контекстных дверях внутри экранов (NavLinks), лист «⋮» упразднён — один и
 * тот же экран больше не достигается тремя путями.
 */
const TABS = [
  { view: 'main', icon: 'calendar', label: t('Сегодня') },
  { view: 'career', icon: 'briefcase', label: t('Работа') },
  { view: 'skills', icon: 'book', label: t('Развитие') },
  { view: 'progress', icon: 'chart', label: t('Прогресс') },
] as const;
/**
 * Tabs where a day is being spent, so the «Завершить день» dock belongs there.
 * Side screens (профиль, дом, настройки…) stay quiet — you go there to look,
 * not to burn the turn.
 */
const DOCK_VIEWS = new Set<string>(['main', 'career', 'skills', 'rest', 'shop', 'office', 'pet']);
export const GameScreen: React.FC = () => {
  const { currentView, setView } = useGameStore();
  const player = useGameStore((s) => s.player);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const daySummary = useGameStore((s) => s.daySummary);
  const dismissDaySummary = useGameStore((s) => s.dismissDaySummary);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const error = useGameStore((s) => s.error);
  /** the choice just made, kept on screen as a receipt until dismissed */
  const [outcome, setOutcome] = useState<{
    title: string;
    tags: string[];
    choice: EventChoice;
  } | null>(null);
  /**
   * An event can arrive from any action, not only from ending the day — so it
   * is rendered above every tab. Otherwise studying on «Обучение» would hand
   * the server an event nobody can answer.
   */
  const decide = async (event: any, index: number) => {
    const choice = event.choices?.[index];
    await chooseEvent(event.id, index);
    if (!useGameStore.getState().activeEvent && choice) {
      setOutcome({ title: event.title, tags: event.tags ?? [], choice });
    }
  };
  /** an offer on the table is the one thing worth a marker in the nav */
  const offerWaiting = Boolean(player?.pendingOffers?.length);
  const renderView = () => {
    // Сводка дня — первый экран после хода: «чем закончился мой день?».
    // Ждущее событие откроется сразу за ней (у карточки есть «Далее»).
    if (daySummary) {
      return <DaySummaryCard summary={daySummary} onDismiss={dismissDaySummary} />;
    }
    if (activeEvent && player) {
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
    switch (currentView) {
      case 'profile':
        return <ProfileView />;
      case 'friends':
        return <FriendsView />;
      case 'main':
        return <DayView />;
      case 'skills':
        return <SkillsView />;
      case 'rest':
        return <RestView />;
      case 'career':
        return <CareerView />;
      case 'shop':
        return <ShopView />;
      case 'room':
        return <RoomView />;
      case 'progress':
      case 'achievements':
      case 'endings':
        // Старые адреса ведут в «Прогресс»: финалы и цели больше не отдельные экраны
        return <ProgressView />;
      case 'leaderboard':
        return <LeaderboardView />;
      case 'office':
        return <OfficeView />;
      case 'mining':
        return <MiningView />;
      case 'pet':
        return <PetView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DayView />;
    }
  };
  // Wrap tab switches with selection haptics
  const nav = (view: string) => {
    if (view !== currentView) haptic('selection');
    setView(view);
  };
  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Whatever the last action paid out, on its way up the screen */}
      <GainStream />

      {/* Ошибки — один тост на все экраны; событие показывает свою инлайн-ошибку */}
      {!activeEvent && <ErrorToast />}

      {/* Content area */}
      <div id="game-scroll" className="flex-1 overflow-y-auto space-y-3">
        {renderView()}
      </div>

      {/* End of the turn — docked above the nav so it never needs scrolling to */}
      <DayEndDock visible={DOCK_VIEWS.has(currentView) && !activeEvent && !outcome && !daySummary} />

      {/* Bottom navigation */}
      <nav className="tabbar" aria-label={t('Основная навигация')}>
        {TABS.map((tab) => (
          <NavButton
            key={tab.view}
            icon={tab.icon}
            label={tab.label}
            active={currentView === tab.view}
            dot={tab.view === 'career' && offerWaiting}
            onClick={() => nav(tab.view)}
          />
        ))}
      </nav>
    </div>
  );
};
const NavButton: React.FC<{
  icon: string;
  label: string;
  active: boolean;
  /** something is waiting behind this tab */
  dot?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, dot, onClick }) => (
  <button onClick={onClick} className="tabbar-item" data-active={active} aria-current={active}>
    {dot && <span className="tabbar-dot" aria-hidden="true" />}
    <PixelIcon name={icon} size={20} />
    <span className="tabbar-label">{label}</span>
  </button>
);
