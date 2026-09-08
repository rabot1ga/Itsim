import React, { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  hideMainButton,
  isMainButtonSupported,
  isMainButtonVisible,
  setMainButtonProgress,
  showMainButton,
} from '../lib/telegram';

/**
 * «Завершить день» — the one button that moves the game forward.
 *
 * It used to live at the bottom of the home screen, below the room, the goal
 * of the day, the action grid, the sprint and the mining card: a sticky dock
 * that could only stick after the player had already scrolled to it. Now it is
 * docked outside the scroll area, above the tab bar, so the end of the turn is
 * always one tap away — on every tab where a day is actually spent.
 *
 * Inside Telegram the native MainButton does this job instead; the dock hides
 * itself so the two never stack.
 */

interface DayEndDockProps {
  /** false while a story card is waiting for an answer, or on side screens */
  visible: boolean;
}

export const DayEndDock: React.FC<DayEndDockProps> = ({ visible }) => {
  const player = useGameStore((s) => s.player);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const [finishing, setFinishing] = useState(false);
  /** the client claimed to support MainButton but never drew it */
  const [nativeFailed, setNativeFailed] = useState(false);
  const useNativeCta = isMainButtonSupported() && !nativeFailed;
  const currentDay = player?.currentDay ?? 1;
  const shown = visible && Boolean(player);

  const finishDay = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    setMainButtonProgress(true);
    try {
      await advanceDay();
    } finally {
      setFinishing(false);
      setMainButtonProgress(false);
      // The day summary + new event render at the top — take the player there.
      document.getElementById('game-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [finishing, advanceDay]);

  // Native Telegram MainButton replaces the in-page dock when available.
  useEffect(() => {
    if (!useNativeCta) return;
    if (!shown) {
      hideMainButton();
      return;
    }
    const handler = () => {
      void finishDay();
    };
    showMainButton(`Завершить день ${currentDay}`, handler);
    return () => hideMainButton(handler);
  }, [useNativeCta, shown, finishDay, currentDay]);

  /**
   * Trust, then verify: if the native button never becomes visible (an old
   * client, a rejected API call), the dock takes the job back rather than
   * leaving the player with no way to end the day.
   */
  useEffect(() => {
    if (!useNativeCta || !shown) return;
    const timer = window.setTimeout(() => {
      if (!isMainButtonVisible()) setNativeFailed(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [useNativeCta, shown, currentDay]);

  if (!shown || useNativeCta || !player) return null;

  const energy = player.energy ?? 0;
  const spent = energy <= 0;

  return (
    <div className="day-dock">
      <button
        onClick={() => void finishDay()}
        disabled={finishing}
        className="btn btn-primary btn-lg w-full"
        aria-describedby={spent ? 'day-dock-hint' : undefined}
      >
        {finishing ? (
          'Считаем день…'
        ) : (
          <>
            Завершить день <span className="num">{currentDay}</span> →
          </>
        )}
      </button>
      {spent && !finishing && (
        <p id="day-dock-hint" className="day-dock-hint">
          Энергия кончилась — день пора закрыть
        </p>
      )}
    </div>
  );
};
