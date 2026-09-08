import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { GameScreen } from './components/GameScreen';
import { ResourceBar } from './components/ResourceBar';
import { showBackButton, hideBackButton, applyTelegramChrome } from './lib/telegram';
import { OnboardingView, ONBOARDING_KEY } from './screens/OnboardingView';

const App: React.FC = () => {
  const { initialized, screen, currentView, moreOpen, setView, setMoreOpen, initGame } = useGameStore();
  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      return true;
    }
  });

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

  // Native back: close overflow first, office → career, other tabs → home.
  // Home has no intermediate landing page and can close normally in Telegram.
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
      hideBackButton();
      return;
    }
    if (currentView === 'office') {
      const toCareer = () => setView('career');
      showBackButton(toCareer);
      return () => hideBackButton(toCareer);
    }
    const toMain = () => setView('main');
    showBackButton(toMain);
    return () => hideBackButton(toMain);
  }, [initialized, screen, currentView, moreOpen, setView, setMoreOpen]);

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* storage unavailable — the tour simply repeats next launch */
    }
    setOnboarded(true);
  };

  if (!initialized) {
    return (
      <div className="app-container">
        <div className="splash animate-fade-in">
          <div className="splash-word">IT LIFE</div>
          <div className="splash-sub">Simulator</div>
          <div className="mt-4 flex justify-center gap-1.5" aria-label="Загрузка">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-ink-600 animate-pulse-soft"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="app-container">
        <OnboardingView onDone={finishOnboarding} />
      </div>
    );
  }

  return (
    <div className="app-container" data-ui-revision="09">
      {(screen === 'game' || screen === 'menu') && (
        <>
          <ResourceBar />
          <GameScreen />
        </>
      )}
    </div>
  );
};

export default App;
