import { create } from 'zustand';
import { haptic } from '../lib/telegram';

export type Screen = 'menu' | 'game' | 'loading';

const API_BASE = '/api';

// Auth: keep the Telegram initData — it is validated on every request
// (Telegram-canonical pattern; no JWT lifecycle to break the preview)
let authInitData: string | null = null;

/**
 * Authenticated API call. Exported as `apiRequest` for screens that fetch on
 * their own (leaderboard) — every endpoint behind `telegramAuthHook` needs the
 * `Authorization: tma <initData>` header, a bare `fetch()` gets a 401 in prod.
 */
async function api(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const headers: Record<string, string> = {
    Authorization: authInitData ? `tma ${authInitData}` : '',
    ...(init.headers as Record<string, string> | undefined),
  };
  // Only send Content-Type when there is a body (Fastify rejects empty JSON bodies)
  if (init.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const apiRequest = api;

/**
 * Fire-and-forget product telemetry (roadmap P0.3). The server appends to
 * NDJSON; a failure must never slow down or break the game.
 */
function track(event: string, payload?: Record<string, unknown>): void {
  api('/telemetry', { method: 'POST', body: JSON.stringify({ event, payload }) }).catch(() => {
    /* telemetry is best-effort */
  });
}

/**
 * A number that just changed, on its way up the screen.
 *
 * Idle games live on this: a tap has to *pay out* visibly, or the loop feels
 * dead. The server returns the whole new state, so instead of parsing rewards
 * we diff the two states and float whatever moved.
 */
export interface Gain {
  id: number;
  /** pixel icon name */
  icon: string;
  text: string;
  tone: 'good' | 'bad';
}

const GAIN_FIELDS: Array<{ key: string; icon: string; unit?: string; round?: number }> = [
  { key: 'money', icon: 'coin', unit: '₽' },
  { key: 'energy', icon: 'bolt' },
  { key: 'motivation', icon: 'flame' },
  { key: 'health', icon: 'heart' },
  { key: 'reputation', icon: 'star' },
];

let gainId = 0;

/** What moved between two states, as floating labels. */
export function diffGains(prev: any, next: any): Gain[] {
  if (!prev || !next) return [];
  const out: Gain[] = [];
  for (const f of GAIN_FIELDS) {
    const delta = Math.round((next[f.key] ?? 0) - (prev[f.key] ?? 0));
    if (!delta) continue;
    const sign = delta > 0 ? '+' : '−';
    const value = Math.abs(delta).toLocaleString('ru-RU');
    out.push({
      id: ++gainId,
      icon: f.icon,
      text: `${sign}${value}${f.unit ? ` ${f.unit}` : ''}`,
      tone: delta > 0 ? 'good' : 'bad',
    });
  }
  const levels = (st: any) =>
    Object.values(st?.skills ?? {}).reduce((sum: number, sk: any) => sum + (sk?.level ?? 0), 0);
  const up = levels(next) - levels(prev);
  if (up > 0) out.push({ id: ++gainId, icon: 'book', text: `+${up} ур.`, tone: 'good' });
  return out;
}

interface GameState {
  initialized: boolean;
  screen: Screen;
  player: any;
  currentView: string;
  /** is the «Ещё» sheet open? kept in the store so the native BackButton can close it first */
  moreOpen: boolean;
  error: string | null;
  activeEvent: any;
  /** promotion/election outlook from the server (career gates) */
  careerOutlook: any;
  /** daily money pressure: «твой день стоит …» */
  costOfDay: any;
  inventory: any[];
  heldCollections: string[];
  mining: any;
  /** numbers that just changed, rendered as floating labels */
  gains: Gain[];

  // Actions
  initGame: (initData: string) => Promise<void>;
  /** daily check-in result from the server: { claimed, streak, money, nextMoney } | null */
  checkIn: any;
  /** re-read /game/state (after a Stars purchase or a background change) */
  refreshState: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  setView: (view: string) => void;
  setMoreOpen: (open: boolean) => void;
  performAction: (actionId: string, params?: any) => Promise<boolean>;
  advanceDay: () => Promise<void>;
  /** prestige reset (P1.1): fresh career, meta ledger + achievements survive */
  startNewLife: () => Promise<boolean>;
  chooseEvent: (eventId: string, choiceIndex: number) => Promise<void>;
  applyToCompany: (companyId: string) => Promise<boolean>;
  acceptOffer: (companyId: string) => Promise<boolean>;
  declineOffer: (companyId: string) => Promise<boolean>;
  clearError: () => void;
  /** drop a floating label once it has finished its flight */
  dropGain: (id: number) => void;
  loadNft: () => Promise<void>;
  bindWallet: (address: string) => Promise<boolean>;
  setMockCollections: (collections: string[]) => Promise<void>;
  unlockPerk: (perkId: string) => Promise<boolean>;
  setMainSkill: (skillId: string) => Promise<boolean>;
  startInterview: () => Promise<any>;
  answerInterview: (questionId: string, choiceIndex: number) => Promise<any>;
  finishInterview: () => Promise<any>;
}

export const useGameStore = create<GameState>((set, get) => ({
  initialized: false,
  screen: 'loading',
  player: null,
  currentView: 'main',
  moreOpen: false,
  error: null,
  activeEvent: null,
  careerOutlook: null,
  costOfDay: null,
  inventory: [],
  heldCollections: [],
  mining: null,
  checkIn: null,
  gains: [],

  initGame: async (initData: string) => {
    try {
      authInitData = initData;

      // 1. Auth: validate initData (server-side check + health ping)
      const auth = await api('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      });
      if (!auth.ok) {
        throw new Error(auth.data?.error || 'Auth failed');
      }

      // 2. Load game state (auth via tma initData, no token lifecycle)
      const stateRes = await api('/game/state');
      if (!stateRes.ok) {
        throw new Error(stateRes.data?.error || 'Failed to load game state');
      }

      set({
        initialized: true,
        player: stateRes.data.state,
        activeEvent: stateRes.data.activeEvent ?? null,
        mining: stateRes.data.mining ?? null,
        careerOutlook: stateRes.data.careerOutlook ?? null,
        costOfDay: stateRes.data.costOfDay ?? null,
        checkIn: stateRes.data.checkIn ?? null,
        screen: stateRes.data.isNew ? 'game' : 'menu',
      });
    } catch (err: any) {
      console.error('Init error:', err);
      // For demo/dev: show menu anyway
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

  refreshState: async () => {
    const res = await api('/game/state');
    if (res.ok && res.data?.state) {
      set({
        player: res.data.state,
        mining: res.data.mining ?? null,
        careerOutlook: res.data.careerOutlook ?? null,
        costOfDay: res.data.costOfDay ?? null,
        checkIn: res.data.checkIn ?? get().checkIn,
      });
    }
  },

  setScreen: (screen) => set({ screen, moreOpen: false }),
  setView: (view) => {
    set({ currentView: view, moreOpen: false });
    track('screen_view', { view });
  },
  setMoreOpen: (open) => set({ moreOpen: open }),
  clearError: () => set({ error: null }),

  dropGain: (id) => set((s) => ({ gains: s.gains.filter((g) => g.id !== id) })),

  performAction: async (actionId, params) => {
    const { player } = get();
    if (!player) return false;

    try {
      const res = await api('/game/action', {
        method: 'POST',
        body: JSON.stringify({
          actionId,
          params,
          idempotencyKey: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        }),
      });
      if (res.data?.state) {
        set((s) => ({
          player: res.data.state,
          activeEvent: res.data.activeEvent ?? null,
          mining: res.data.mining ?? null,
          careerOutlook: res.data.careerOutlook ?? get().careerOutlook,
          costOfDay: res.data.costOfDay ?? get().costOfDay,
          error: null,
          gains: [...s.gains, ...diffGains(player, res.data.state)].slice(-6),
        }));
      }
      if (!res.ok) {
        haptic('error');
        set({ error: res.data?.error || 'Действие не выполнено' });
        return false;
      }
      // Feel the action: purchases thud, offers celebrate, the rest just tap.
      if (actionId === 'accept_offer') haptic('success');
      else if (actionId === 'buy_item' || actionId === 'upgrade_housing') haptic('medium');
      else if (actionId === 'customize_room' || actionId === 'customize_avatar') haptic('selection');
      else haptic('tap');
      track('action', { actionId });
      return true;
    } catch (err) {
      console.error('Action error:', err);
      haptic('error');
      set({ error: 'Сервер недоступен' });
      return false;
    }
  },

  advanceDay: async () => {
    const before = get().player;
    try {
      const res = await api('/game/advance-day', { method: 'POST' });
      if (res.data?.state) {
        set((s) => ({
          gains: [...s.gains, ...diffGains(before, res.data.state)].slice(-6),
          player: res.data.state,
          activeEvent: res.data.activeEvent ?? null,
          mining: res.data.mining ?? null,
          careerOutlook: res.data.careerOutlook ?? null,
          costOfDay: res.data.costOfDay ?? null,
          error: null,
        }));
      }
      if (!res.ok) {
        haptic('error');
        set({ error: res.data?.error || 'Не удалось завершить день' });
      } else {
        haptic('medium');
        track('day_end', { day: res.data?.state?.currentDay });
      }
    } catch (err) {
      console.error('Advance day error:', err);
      haptic('error');
      set({ error: 'Сервер недоступен' });
    }
  },

  startNewLife: async () => {
    try {
      const res = await api('/game/new-life', { method: 'POST' });
      if (res.data?.state) {
        haptic('success');
        set({
          player: res.data.state,
          activeEvent: null,
          error: null,
          gains: [],
          mining: null,
          careerOutlook: null,
          costOfDay: null,
        });
        // Repopulate check-in / mining / outlook from the fresh state
        await get().refreshState();
        return true;
      }
      haptic('error');
      set({ error: res.data?.error || 'Не удалось начать новую жизнь' });
      return false;
    } catch (err) {
      console.error('New life error:', err);
      haptic('error');
      set({ error: 'Сервер недоступен' });
      return false;
    }
  },

  chooseEvent: async (eventId, choiceIndex) => {
    const before = get().player;
    try {
      const res = await api('/game/event-choice', {
        method: 'POST',
        body: JSON.stringify({ eventId, choiceIndex }),
      });
      if (res.data?.state) {
        haptic('selection');
        set((s) => ({
          player: res.data.state,
          activeEvent: null,
          error: null,
          gains: [...s.gains, ...diffGains(before, res.data.state)].slice(-6),
        }));
        track('event_choice', { eventId });
      }
      if (!res.ok) {
        haptic('error');
        set({ error: res.data?.error || 'Выбор не принят' });
      }
    } catch (err) {
      console.error('Event choice error:', err);
      haptic('error');
      set({ error: 'Сервер недоступен' });
    }
  },

  applyToCompany: async (companyId) => {
    return await get().performAction('apply_job', { companyId });
  },

  acceptOffer: async (companyId) => {
    return await get().performAction('accept_offer', { companyId });
  },

  declineOffer: async (companyId) => {
    return await get().performAction('decline_offer', { companyId });
  },

  loadNft: async () => {
    try {
      const [invRes, ccRes] = await Promise.all([api('/nft/inventory'), api('/nft/cross-collections')]);
      if (invRes.ok) set({ inventory: invRes.data?.nfts ?? [] });
      if (ccRes.ok) set({ heldCollections: ccRes.data?.held ?? [] });
    } catch (err) {
      console.error('loadNft error:', err);
    }
  },

  bindWallet: async (address) => {
    try {
      const res = await api('/nft/bind-wallet', {
        method: 'POST',
        body: JSON.stringify({ address }),
      });
      if (res.ok && res.data?.state) {
        haptic('success');
        set({ player: res.data.state, error: null });
        await get().loadNft();
        return true;
      }
      haptic('error');
      set({ error: res.data?.error || 'Не удалось привязать кошелёк' });
      return false;
    } catch (err) {
      console.error('bindWallet error:', err);
      haptic('error');
      set({ error: 'Сервер недоступен' });
      return false;
    }
  },

  setMockCollections: async (collections) => {
    try {
      const res = await api('/nft/mock-collections', {
        method: 'POST',
        body: JSON.stringify({ collections }),
      });
      if (res.ok) {
        set({ heldCollections: res.data?.held ?? [], player: res.data?.state ?? get().player });
      }
    } catch (err) {
      console.error('setMockCollections error:', err);
    }
  },

  unlockPerk: async (perkId) => {
    try {
      const res = await api('/game/unlock-perk', {
        method: 'POST',
        body: JSON.stringify({ perkId }),
      });
      if (res.data?.state) {
        haptic('success');
        set({ player: res.data.state, error: null });
        return true;
      }
      haptic('error');
      set({ error: res.data?.error || 'Не удалось открыть перк' });
      return false;
    } catch (err) {
      console.error('unlockPerk error:', err);
      set({ error: 'Сервер недоступен' });
      return false;
    }
  },

  setMainSkill: async (skillId) => {
    try {
      const res = await api('/game/main-skill', {
        method: 'POST',
        body: JSON.stringify({ skillId }),
      });
      if (res.data?.state) {
        haptic('selection');
        set({ player: res.data.state, error: null });
        track('skill_pick', { skillId });
        return true;
      }
      haptic('error');
      set({ error: res.data?.error || 'Не удалось выбрать навык' });
      return false;
    } catch (err) {
      console.error('setMainSkill error:', err);
      set({ error: 'Сервер недоступен' });
      return false;
    }
  },

  startInterview: async () => {
    try {
      const res = await api('/game/interview/start', { method: 'POST', body: JSON.stringify({}) });
      if (res.data?.state) set({ player: res.data.state, error: null });
      if (!res.ok) set({ error: res.data?.error || 'Не удалось начать собеседование' });
      return res.data;
    } catch (err) {
      console.error('startInterview error:', err);
      set({ error: 'Сервер недоступен' });
      return null;
    }
  },

  answerInterview: async (questionId, choiceIndex) => {
    try {
      const res = await api('/game/interview/answer', {
        method: 'POST',
        body: JSON.stringify({ questionId, choiceIndex }),
      });
      if (res.data?.state) set({ player: res.data.state, error: null });
      return res.data;
    } catch (err) {
      console.error('answerInterview error:', err);
      set({ error: 'Сервер недоступен' });
      return null;
    }
  },

  finishInterview: async () => {
    try {
      const res = await api('/game/interview/finish', { method: 'POST', body: JSON.stringify({}) });
      if (res.data?.state) set({ player: res.data.state, error: null });
      if (!res.ok) set({ error: res.data?.error || 'Не удалось завершить собеседование' });
      return res.data;
    } catch (err) {
      console.error('finishInterview error:', err);
      set({ error: 'Сервер недоступен' });
      return null;
    }
  },
}));
