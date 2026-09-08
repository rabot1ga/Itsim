import React, { useEffect, useState } from 'react';
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
import { AchievementsView } from '../screens/AchievementsView';
import { LeaderboardView } from '../screens/LeaderboardView';
import { EndingView } from '../screens/EndingView';
import { MiningView } from '../screens/MiningView';
import { WalletView } from '../screens/WalletView';
import { PetView } from '../screens/PetView';
import { SettingsView } from '../screens/SettingsView';
import { PixelIcon } from './pixel/PixelIcon';
import { GainStream } from './GainStream';
import { EventCard, EventOutcomeCard, type EventChoice } from './EventCard';
import { DayEndDock } from './DayEndDock';

/**
 * Five destinations stay visible; everything else lives in «⋮».
 *
 * «Отдых» took the fifth slot from «Друзья»: rest is a daily decision, the
 * friends roster is a place you visit — it opens from «Отдых» and from «⋮».
 */
const TABS = [
  { view: 'main', icon: 'house', label: 'Главная' },
  { view: 'career', icon: 'briefcase', label: 'Работа' },
  { view: 'skills', icon: 'book', label: 'Обучение' },
  { view: 'rest', icon: 'heart', label: 'Отдых' },
  { view: 'shop', icon: 'bag', label: 'Магазин' },
] as const;

/**
 * «⋮» — an index, not a home for orphans.
 *
 * Every destination below also has a contextual door: офис и финалы — на
 * «Работе», майнинг и кошелёк — в «Магазине», питомец и дом — на «Отдыхе»,
 * цели и топ — в «Профиле», профиль — по портрету в HUD. The sheet stays as a
 * compact grid for the times you know where you want to go.
 */
const MORE = [
  { view: 'profile', emoji: '👤', label: 'Профиль' },
  { view: 'room', emoji: '🏠', label: 'Дом' },
  { view: 'friends', emoji: '👥', label: 'Друзья' },
  { view: 'pet', emoji: '🐾', label: 'Питомец' },
  { view: 'achievements', emoji: '🎯', label: 'Цели' },
  { view: 'leaderboard', emoji: '🏆', label: 'Топ' },
  { view: 'office', emoji: '🖥', label: 'Офис' },
  { view: 'mining', emoji: '⛏', label: 'Майнинг' },
  { view: 'wallet', emoji: '💼', label: 'Кошелёк' },
  { view: 'endings', emoji: '🏁', label: 'Финалы' },
  { view: 'settings', emoji: '⚙️', label: 'Настройки' },
] as const;

/**
 * Tabs where a day is being spent, so the «Завершить день» dock belongs there.
 * Side screens (профиль, дом, настройки…) stay quiet — you go there to look,
 * not to burn the turn.
 */
const DOCK_VIEWS = new Set<string>(['main', 'career', 'skills', 'rest', 'shop', 'office', 'pet']);

export const GameScreen: React.FC = () => {
  const { currentView, setView, loadNft, moreOpen, setMoreOpen } = useGameStore();
  const player = useGameStore((s) => s.player);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const error = useGameStore((s) => s.error);
  /** the choice just made, kept on screen as a receipt until dismissed */
  const [outcome, setOutcome] = useState<{ title: string; tags: string[]; choice: EventChoice } | null>(null);

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

  // Preload NFT info when opening the room or the wallet
  useEffect(() => {
    if (currentView === 'room' || currentView === 'wallet') loadNft();
  }, [currentView, loadNft]);

  const renderView = () => {
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
      case 'achievements':
        return <AchievementsView />;
      case 'leaderboard':
        return <LeaderboardView />;
      case 'endings':
        return <EndingView />;
      case 'office':
        return <OfficeView />;
      case 'mining':
        return <MiningView />;
      case 'wallet':
        return <WalletView />;
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

      {/* Content area */}
      <div id="game-scroll" className="flex-1 overflow-y-auto space-y-3">
        {renderView()}
      </div>

      {/* «⋮» sheet — a navigation detour, never a state you can get stuck in. */}
      {moreOpen && (
        <>
          <button
            aria-label="Закрыть меню"
            onClick={() => setMoreOpen(false)}
            className="sheet-backdrop animate-fade-in"
          />
          <div role="dialog" aria-modal="true" aria-label="Меню" className="sheet animate-slide-up safe-area-pb">
            <div className="sheet-grip" />
            <div className="menu-grid">
              {MORE.map((item) => {
                const isCurrent = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    onClick={() => nav(item.view)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className="menu-tile"
                  >
                    <span className="emoji" aria-hidden="true">
                      {item.emoji}
                    </span>
                    <span className="menu-tile-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* End of the turn — docked above the nav so it never needs scrolling to */}
      <DayEndDock visible={DOCK_VIEWS.has(currentView) && !activeEvent && !outcome} />

      {/* Bottom navigation */}
      <nav className="tabbar" aria-label="Основная навигация">
        {TABS.map((tab) => (
          <NavButton
            key={tab.view}
            icon={tab.icon}
            label={tab.label}
            active={currentView === tab.view && !moreOpen}
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
