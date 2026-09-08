import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { ProfileView } from '../screens/ProfileView';
import { FriendsView } from '../screens/FriendsView';
import { DayView } from '../screens/DayView';
import { OfficeView } from '../screens/OfficeView';
import { SkillsView } from '../screens/SkillsView';
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

/** The reference's five destinations stay visible; everything else lives in «⋮». */
const TABS = [
  { view: 'main', icon: 'house', label: 'Главная' },
  { view: 'career', icon: 'briefcase', label: 'Работа' },
  { view: 'skills', icon: 'book', label: 'Обучение' },
  { view: 'shop', icon: 'bag', label: 'Магазин' },
  { view: 'friends', icon: 'people', label: 'Друзья' },
] as const;

/** «⋮» menu — a list of rows, because a list is scanned in one second. */
const MORE = [
  { view: 'profile', emoji: '👤', label: 'Профиль', hint: 'Статистика, опыт, достижения' },
  { view: 'room', emoji: '🏠', label: 'Дом', hint: 'Комната, декор, гардероб' },
  { view: 'achievements', emoji: '🎯', label: 'Цели', hint: 'Цели, ачивки и награды' },
  { view: 'leaderboard', emoji: '🏆', label: 'Топ игроков', hint: 'Рейтинг по карьере и репутации' },
  { view: 'office', emoji: '🖥', label: 'Офис', hint: 'Команда, задачи, настроение' },
  { view: 'mining', emoji: '⛏', label: 'Майнинг', hint: 'Ферма, доход, прогноз' },
  { view: 'wallet', emoji: '💼', label: 'Кошелёк', hint: 'NFT-инвентарь и Solana' },
  { view: 'pet', emoji: '🐾', label: 'Питомец', hint: 'Еда, настроение, аксессуары' },
  { view: 'endings', emoji: '🏁', label: 'Финалы', hint: 'Шесть путей завершить карьеру' },
  { view: 'settings', emoji: '⚙️', label: 'Настройки', hint: 'Уведомления, звук, данные' },
] as const;

export const GameScreen: React.FC = () => {
  const { currentView, setView, advanceDay, loadNft, moreOpen, setMoreOpen } = useGameStore();
  const player = useGameStore((s) => s.player);

  /** an offer on the table is the one thing worth a marker in the nav */
  const offerWaiting = Boolean(player?.pendingOffers?.length);

  const handleAdvanceDay = async () => {
    await advanceDay();
  };

  // Preload NFT info when opening the room or the wallet
  useEffect(() => {
    if (currentView === 'room' || currentView === 'wallet') loadNft();
  }, [currentView, loadNft]);

  const renderView = () => {
    switch (currentView) {
      case 'profile':
        return <ProfileView />;
      case 'friends':
        return <FriendsView />;
      case 'main':
        return <DayView onAdvanceDay={handleAdvanceDay} />;
      case 'skills':
        return <SkillsView />;
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
        return <DayView onAdvanceDay={handleAdvanceDay} />;
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
            <div className="sheet-list">
              {MORE.map((item) => {
                const isCurrent = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    onClick={() => nav(item.view)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className="menu-row"
                  >
                    <span className="emoji" aria-hidden="true">
                      {item.emoji}
                    </span>
                    <span className="menu-row-copy">
                      <span className="menu-row-title">{item.label}</span>
                      <span className="menu-row-hint">{item.hint}</span>
                    </span>
                    {isCurrent ? (
                      <span className="menu-row-mark">здесь</span>
                    ) : (
                      <PixelIcon name="chevron" size={9} className="menu-row-chevron -rotate-90" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

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
