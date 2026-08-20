import React, { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { GameScreen } from './components/GameScreen';
import { MainMenu } from './components/MainMenu';
import { ResourceBar } from './components/ResourceBar';

const App: React.FC = () => {
  const { initialized, player, screen, initGame } = useGameStore();

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

  if (!initialized) {
    return (
      <div className="app-container flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">💻</div>
          <div className="text-lg text-slate-300">Загрузка IT Life Simulator...</div>
          <div className="mt-4 w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
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