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
      <div className="bg-slate-900/95 backdrop-blur-md border-t border-slate-700/70 flex px-1 pt-1 safe-area-pb">
        <NavButton icon="📋" label="День" active={currentView === 'main'} onClick={() => nav('main')} />
        <NavButton icon="📚" label="Навыки" active={currentView === 'skills'} onClick={() => nav('skills')} />
        <NavButton icon="💼" label="Карьера" active={currentView === 'career'} onClick={() => nav('career')} />
        <NavButton icon="🏠" label="Дом" active={currentView === 'room'} onClick={() => nav('room')} />
        <NavButton icon="🏪" label="Магазин" active={currentView === 'shop'} onClick={() => nav('shop')} />
        <NavButton icon="🏆" label="Трофеи" active={currentView === 'achievements'} onClick={() => nav('achievements')} />
        <NavButton icon="📊" label="Топ" active={currentView === 'leaderboard'} onClick={() => nav('leaderboard')} />
      </div>
    </div>
  );
};

const NavButton: React.FC<{
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex-1 flex flex-col items-center justify-center py-1.5 mx-0.5 my-1 rounded-xl transition-all touch-target active:scale-95 ${
      active ? 'bg-primary-600/15 text-primary-300' : 'text-slate-500 hover:text-slate-300'
    }`}
  >
    <span className={`text-xl leading-none ${active ? '' : 'opacity-80'}`}>{icon}</span>
    <span className="text-[10px] font-medium mt-1 leading-none">{label}</span>
    {active && <span className="absolute bottom-0.5 w-6 h-0.5 rounded-full bg-primary-400" />}
  </button>
);