import { create } from 'zustand';

export type Screen = 'menu' | 'game' | 'loading';

interface GameState {
  initialized: boolean;
  screen: Screen;
  player: any;
  currentView: string;
  error: string | null;

  // Actions
  initGame: (initData: string) => Promise<void>;
  setScreen: (screen: Screen) => void;
  setView: (view: string) => void;
  performAction: (actionId: string, params?: any) => Promise<void>;
  advanceDay: () => Promise<void>;
}

const API_BASE = '/api';

export const useGameStore = create<GameState>((set, get) => ({
  initialized: false,
  screen: 'loading',
  player: null,
  currentView: 'main',
  error: null,

  initGame: async (initData: string) => {
    try {
      // Auth
      const authRes = await fetch(`${API_BASE}/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const auth = await authRes.json();

      if (!authRes.ok) {
        throw new Error(auth.error || 'Auth failed');
      }

      // Get game state
      const stateRes = await fetch(`${API_BASE}/game/state`, {
        headers: { Authorization: `tma ${initData}` },
      });
      const gameData = await stateRes.json();

      set({
        initialized: true,
        player: gameData.state,
        screen: gameData.isNew ? 'game' : 'menu',
      });
    } catch (err: any) {
      console.error('Init error:', err);
      // For demo: show menu anyway
      set({
        initialized: true,
        screen: 'menu',
        player: {
          currentDay: 1,
          grade: 'unemployed',
          money: 10000,
          health: 80,
          motivation: 50,
          energy: 10,
          maxEnergy: 10,
          reputation: 0,
          skills: {},
          housingLevel: 0,
          items: [],
        },
      });
    }
  },

  setScreen: (screen) => set({ screen }),
  setView: (view) => set({ currentView: view }),

  performAction: async (actionId, params) => {
    const { player } = get();
    if (!player) return;

    try {
      const res = await fetch(`${API_BASE}/game/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'tma mock',
        },
        body: JSON.stringify({
          actionId,
          params,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (data.state) {
        set({ player: data.state });
      }
    } catch (err) {
      console.error('Action error:', err);
    }
  },

  advanceDay: async () => {
    const { player } = get();
    if (!player) return;

    try {
      const res = await fetch(`${API_BASE}/game/advance-day`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'tma mock',
        },
      });
      const data = await res.json();
      if (data.state) {
        set({ player: data.state });
      }
    } catch (err) {
      console.error('Advance day error:', err);
    }
  },
}));