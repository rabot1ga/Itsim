import React, { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { GameScreen } from './components/GameScreen';
import { MainMenu } from './components/MainMenu';
import { ResourceBar } from './components/ResourceBar';
import { showBackButton, hideBackButton, applyTelegramChrome } from './lib/telegram';
import { PixelText } from './components/pixel/PixelText';

const App: React.FC = () => {
  const { initialized, screen, currentView, moreOpen, setScreen, setView, setMoreOpen, initGame } = useGameStore();

  useEffect(() => {
    // Paint Telegram's own header/background in our ink so the app has no seams.
    applyTelegramChrome();
    // Try to authenticate and load game state
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      initGame(initData);
    } else {
      // Fallback for local dev
      initGame('user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Dev%22%7D');
    }
    // Auth happens exactly once per mount — initGame is stable in the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native Telegram BackButton: «Ещё» sheet → (any tab → Day tab → main menu →
  // hidden, app can close). Office is a Career sub-screen, so it goes back to
  // Career. The sheet is a detour, so the first back press only closes it —
  // it never throws the player out of their current tab.
  useEffect(() => {
    if (!initialized || screen !== 'game') {
      hideBackButton();
      return;
    }
    if (moreOpen) {
      const closeSheet = () => setMoreOpen(false);
      showBackButton(closeSheet);
      return () => hideBackButton(closeSheet);
    }
    if (currentView === 'main') {
      const toMenu = () => setScreen('menu');
      showBackButton(toMenu);
      return () => hideBackButton(toMenu);
    }
    if (currentView === 'office') {
      const toCareer = () => setView('career');
      showBackButton(toCareer);
      return () => hideBackButton(toCareer);
    }
    const toMain = () => setView('main');
    showBackButton(toMain);
    return () => hideBackButton(toMain);
  }, [initialized, screen, currentView, moreOpen, setScreen, setView, setMoreOpen]);

  if (!initialized) {
    return (
      <div className="app-container items-center justify-center">
        <div className="text-center animate-fade-in">
          <PixelText scale={4} className="text-gold-300 mx-auto">
            IT LIFE
          </PixelText>
          <div className="mt-2 text-2xs font-semibold uppercase tracking-[0.42em] text-ink-500 pl-1">Simulator</div>
          <div className="mt-7 flex justify-center gap-1" aria-label="Загрузка">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-ink-600 animate-pulse-soft"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {screen === 'menu' && <MainMenu />}
      {screen === 'game' && (
        <>
          <ResourceBar />
          <GameScreen />
        </>
      )}
    </div>
  );
};

export default App;
