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
  const { currentView, setView, setScreen, advanceDay, loadNft, moreOpen, setMoreOpen } = useGameStore();
  const player = useGameStore((s) => s.player);

  /** an offer on the table is the one thing worth a marker in the nav */
  const offerWaiting = Boolean(player?.pendingOffers?.length);

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
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Whatever the last action paid out, on its way up the screen */}
      <GainStream />

      {/* Content area */}
      <div id="game-scroll" className="flex-1 overflow-y-auto p-3 space-y-3">
        {renderView()}
      </div>

      {/* «Ещё» sheet — a navigation detour, never a state you can get stuck in.
          Closing it is one tap, one native back press (see App.tsx) or simply
          picking a destination; setView in the store closes it for us. */}
      {moreOpen && (
        <>
          <button
            aria-label="Закрыть меню «Ещё»"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 z-20 bg-black/50 animate-fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ещё"
            className="absolute inset-x-0 bottom-0 z-30 animate-slide-up"
          >
            <div className="border-t border-x border-ink-600 bg-ink-900 rounded-t-[20px] p-3 pb-2 safe-area-pb shadow-[0_-18px_44px_-24px_rgba(0,0,0,0.9)]">
              <div className="h-1 w-9 bg-ink-700 mx-auto mb-3" />
              <div className="flex items-center gap-2 mb-3">
                <PixelIcon name="plus" size={12} className="text-gold-300" />
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-300">Ещё</span>
                <span className="flex-1 border-t border-dashed border-ink-700" />
                <button
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-1.5 text-2xs text-ink-500 hover:text-ink-200 transition-colors touch-target px-1"
                >
                  <PixelIcon name="chevron" size={9} />
                  Закрыть
                </button>
              </div>
              {/* A hub is a list, not a shelf: one destination per row with its
                  icon anchored left, so a glance scans four real places instead
                  of four identical tiles. */}
              <div className="max-h-[min(420px,58vh)] overflow-y-auto -mx-1 px-1">
                {MORE.map((item, i) => {
                  const isCurrent = currentView === item.view;
                  return (
                    <button
                      key={item.view}
                      onClick={() => nav(item.view)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`group flex w-full items-center gap-3 text-left min-h-[52px] py-2 border-b border-ink-800 last:border-0 ${
                        i > 0 ? 'mt-0.5' : ''
                      } ${isCurrent ? '' : 'active:bg-ink-800/60'}`}
                    >
                      {/* the notch: where you are right now */}
                      {isCurrent && <span className="self-stretch w-[3px] shrink-0 bg-gold-300" aria-hidden="true" />}
                      <span
                        className={`w-9 h-9 shrink-0 flex items-center justify-center border-2 bg-ink-800 ${
                          isCurrent
                            ? 'border-gold-700 text-gold-300'
                            : 'border-ink-700 text-ink-300 group-hover:border-ink-600'
                        }`}
                      >
                        <PixelIcon name={item.icon} size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-ink-100">{item.label}</span>
                        <span className="block text-2xs text-ink-500 leading-tight mt-0.5">{item.hint}</span>
                      </span>
                      {isCurrent ? (
                        <span className="text-2xs font-bold uppercase tracking-[0.08em] text-gold-300 shrink-0">
                          здесь
                        </span>
                      ) : (
                        <PixelIcon name="chevron" size={9} className="text-ink-600 -rotate-90 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                className="btn btn-secondary w-full mt-2"
                onClick={() => {
                  setMoreOpen(false);
                  setScreen('menu');
                }}
              >
                Главное меню
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
            setMoreOpen(!moreOpen);
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
