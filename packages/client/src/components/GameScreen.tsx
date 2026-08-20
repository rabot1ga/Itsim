import React from 'react';
import { useGameStore } from '../store/gameStore';
import { DayView } from '../screens/DayView';
import { SkillsView } from '../screens/SkillsView';
import { CareerView } from '../screens/CareerView';
import { ShopView } from '../screens/ShopView';

export const GameScreen: React.FC = () => {
  const { currentView, setView, player, advanceDay } = useGameStore();

  const handleAdvanceDay = async () => {
    await advanceDay();
  };

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
      default:
        return <DayView onAdvanceDay={handleAdvanceDay} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {renderView()}
      </div>

      {/* Bottom navigation */}
      <div className="bg-slate-900 border-t border-slate-700 flex safe-area-pb">
        <NavButton icon="📋" label="День" active={currentView === 'main'} onClick={() => setView('main')} />
        <NavButton icon="📚" label="Навыки" active={currentView === 'skills'} onClick={() => setView('skills')} />
        <NavButton icon="💼" label="Карьера" active={currentView === 'career'} onClick={() => setView('career')} />
        <NavButton icon="🏪" label="Магазин" active={currentView === 'shop'} onClick={() => setView('shop')} />
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
    className={`flex-1 flex flex-col items-center py-2 transition-colors ${
      active ? 'text-primary-400' : 'text-slate-500'
    }`}
  >
    <span className="text-lg">{icon}</span>
    <span className="text-xs mt-0.5">{label}</span>
  </button>
);