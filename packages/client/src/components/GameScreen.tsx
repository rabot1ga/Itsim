import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { DayView } from '../screens/DayView';
import { OfficeView } from '../screens/OfficeView';
import { SkillsView } from '../screens/SkillsView';
import { CareerView } from '../screens/CareerView';
import { ShopView } from '../screens/ShopView';
import { RoomView } from '../screens/RoomView';
import { AchievementsView } from '../screens/AchievementsView';
import { LeaderboardView } from '../screens/LeaderboardView';
import { PixelIcon } from './pixel/PixelIcon';

const TABS = [
  { view: 'main', icon: 'calendar', label: 'День' },
  { view: 'skills', icon: 'book', label: 'Навыки' },
  { view: 'career', icon: 'briefcase', label: 'Карьера' },
  { view: 'room', icon: 'house', label: 'Дом' },
  { view: 'shop', icon: 'bag', label: 'Магазин' },
  { view: 'achievements', icon: 'trophy', label: 'Трофеи' },
  { view: 'leaderboard', icon: 'chart', label: 'Топ' },
] as const;

export const GameScreen: React.FC = () => {
  const { currentView, setView, advanceDay, loadNft } = useGameStore();

  const handleAdvanceDay = async () => {
    await advanceDay();
  };

  // Preload NFT info when opening the room
  useEffect(() => {
    if (currentView === 'room') loadNft();
  }, [currentView, loadNft]);

  const renderView = () => {
    switch (currentView) {
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
      case 'office':
        return <OfficeView />;
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Content area */}
      <div id="game-scroll" className="flex-1 overflow-y-auto p-3 space-y-3">
        {renderView()}
      </div>

      {/* Bottom navigation */}
      <nav className="tabbar safe-area-pb">
        {TABS.map((tab) => (
          <NavButton
            key={tab.view}
            icon={tab.icon}
            label={tab.label}
            active={currentView === tab.view}
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
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className="tabbar-item" data-active={active} aria-current={active}>
    <PixelIcon name={icon} size={18} />
    <span className="tabbar-label">{label}</span>
  </button>
);