import React, { useEffect, useState } from 'react';
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
import { GainStream } from './GainStream';

/**
 * Four tabs carry the loop: the day, what you learn, where you work, where you
 * live. Everything you visit once in a while lives behind «Ещё» — seven equal
 * tabs made every one of them look equally unimportant.
 */
const TABS = [
  { view: 'main', icon: 'calendar', label: 'День' },
  { view: 'skills', icon: 'book', label: 'Навыки' },
  { view: 'career', icon: 'briefcase', label: 'Карьера' },
  { view: 'room', icon: 'house', label: 'Дом' },
] as const;

const MORE = [
  { view: 'shop', icon: 'bag', label: 'Магазин', hint: 'Техника, мебель, жильё' },
  { view: 'achievements', icon: 'trophy', label: 'Трофеи', hint: 'Ачивки и челленджи' },
  { view: 'leaderboard', icon: 'chart', label: 'Топ', hint: 'Рейтинг игроков' },
  { view: 'office', icon: 'people', label: 'Офис', hint: 'Команда и задачи' },
] as const;

const MORE_VIEWS: string[] = MORE.map((m) => m.view);

export const GameScreen: React.FC = () => {
  const { currentView, setView, advanceDay, loadNft } = useGameStore();
  const player = useGameStore((s) => s.player);
  const [moreOpen, setMoreOpen] = useState(false);

  /** an offer on the table is the one thing worth a marker in the nav */
  const offerWaiting = Boolean(player?.pendingOffers?.length);

  const handleAdvanceDay = async () => {
    await advanceDay();
  };

  // Preload NFT info when opening the room
  useEffect(() => {
    if (currentView === 'room') loadNft();
  }, [currentView, loadNft]);

  // The sheet is a navigation detour, never a state you can get stuck in.
  useEffect(() => {
    setMoreOpen(false);
  }, [currentView]);

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
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Whatever the last action paid out, on its way up the screen */}
      <GainStream />

      {/* Content area */}
      <div id="game-scroll" className="flex-1 overflow-y-auto p-3 space-y-3">
        {renderView()}
      </div>

      {/* «Ещё» sheet */}
      {moreOpen && (
        <>
          <button
            aria-label="Закрыть"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 z-20 bg-black/50 animate-fade-in"
          />
          <div className="absolute inset-x-0 bottom-0 z-30 animate-slide-up">
            <div className="border-t-2 border-x-2 border-ink-700 bg-ink-900 p-3 pb-2">
              <div className="h-1 w-9 bg-ink-700 mx-auto mb-3" />
              <div className="grid grid-cols-2 gap-2">
                {MORE.map((item) => (
                  <button
                    key={item.view}
                    onClick={() => nav(item.view)}
                    className={`tile flex items-start gap-2.5 ${
                      currentView === item.view ? 'panel-note panel-note-gold' : ''
                    }`}
                  >
                    <PixelIcon
                      name={item.icon}
                      size={15}
                      className={currentView === item.view ? 'text-gold-300 mt-0.5' : 'text-ink-300 mt-0.5'}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-100">{item.label}</span>
                      <span className="block text-2xs text-ink-500 leading-tight mt-0.5">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={() => setMoreOpen(false)} className="btn btn-ghost w-full mt-2 !min-h-[40px] text-sm">
                Закрыть
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bottom navigation */}
      <nav className="tabbar safe-area-pb">
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
        <NavButton
          icon="plus"
          label="Ещё"
          active={moreOpen || MORE_VIEWS.includes(currentView)}
          onClick={() => {
            haptic('selection');
            setMoreOpen((v) => !v);
          }}
        />
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
