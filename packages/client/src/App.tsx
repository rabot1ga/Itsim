import React, { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { GameScreen } from './components/GameScreen';
import { MainMenu } from './components/MainMenu';
import { ResourceBar } from './components/ResourceBar';
import { showBackButton, hideBackButton } from './lib/telegram';

const App: React.FC = () => {
  const { initialized, player, screen, currentView, setScreen, setView, initGame } = useGameStore();

  useEffect(() => {
    // Try to authenticate and load game state
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      initGame(initData);
    } else {
      // Fallback for local dev
      initGame('user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Dev%22%7D');
    }
  }, []);

  // Native Telegram BackButton: any tab → Day tab → main menu → (hidden, app can close).
  // Office is a Career sub-screen, so it goes back to Career.
  useEffect(() => {
    if (!initialized || screen !== 'game') {
      hideBackButton();
      return;
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
  }, [initialized, screen, currentView, setScreen, setView]);

  if (!initialized) {
    return (
      <div className="app-container flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-5 animate-float">💻</div>
          <div className="text-xl font-bold text-gradient animate-gradient">IT Life Simulator</div>
          <div className="text-sm text-slate-500 mt-1 mb-6">Загрузка симулятора жизни...</div>
          <div className="w-10 h-10 border-3 border-primary-500/30 border-t-primary-400 rounded-full animate-spin mx-auto" />
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