import { PlayerState } from '../types';
import { clamp, makeRngSalt } from './utils';
import { bankCap, MAX_BANK_SLOTS } from './energy';

/**
 * Save-state migrations.
 *
 * Saves are JSON blobs written by whatever version of the engine happened to be
 * running that day. `state.version` existed from day one, but nothing ever acted
 * on it: adding a field to `PlayerState` silently produced `undefined`s inside
 * old saves, and the code coped with `?? 0` sprinkled everywhere.
 *
 * From now on every schema change gets a numbered migration here, and the server
 * runs `migrateState()` on load (and persists the result). Rules:
 *
 *  1. Migrations are pure and idempotent — running them twice must not change
 *     anything (they are also run in tests against real-world saves).
 *  2. They never delete data they cannot reconstruct; unknown/legacy keys are
 *     kept as-is so a rollback stays possible.
 *  3. A save from the FUTURE (version > CURRENT_STATE_VERSION) is left untouched
 *     and reported, so an accidental server downgrade cannot corrupt it.
 */

export const CURRENT_STATE_VERSION = 9;

export interface MigrationResult<T = PlayerState> {
  state: T;
  /** names of migrations applied, in order */
  applied: string[];
  /** true if the state object differs from the input (needs persisting) */
  changed: boolean;
  /** save written by a newer engine — left untouched */
  fromFuture: boolean;
}

interface Migration {
  to: number;
  name: string;
  up: (state: any) => void;
}

const MIGRATIONS: Migration[] = [
  {
    to: 2,
    name: 'v2_career_gates_and_cosmetics',
    /**
     * v1 → v2: the balance v2.1 career layer (main skill, review/election
     * bookkeeping, living costs) and the cosmetics layer (room/avatar/pet)
     * were added incrementally without defaults. Fill them in explicitly.
     */
    up(state: any) {
      if (typeof state.mainSkillId !== 'string' || !state.mainSkillId) {
        // Best guess: the deepest skill the player has actually trained.
        const best = Object.entries(state.skills ?? {})
          .map(([id, s]: [string, any]) => ({ id, level: s?.level ?? 0, xp: s?.xp ?? 0 }))
          .sort((a, b) => b.level - a.level || b.xp - a.xp)[0];
        state.mainSkillId = best?.id ?? 'javascript';
      }
      if (typeof state.lastPromotionDay !== 'number') {
        state.lastPromotionDay = state.job
          ? Math.max(0, (state.currentDay ?? 1) - (state.job.daysSinceLastPromotion ?? 0))
          : 0;
      }
      if (typeof state.ctoCooldownUntilDay !== 'number') state.ctoCooldownUntilDay = 0;
      if (typeof state.brokeDays !== 'number') state.brokeDays = 0;
      if (typeof state.burnoutDays !== 'number') state.burnoutDays = 0;
      if (typeof state.lastLivingCost !== 'number') state.lastLivingCost = 0;
      if (!Array.isArray(state.recentEventTags)) state.recentEventTags = [];
      if (!Array.isArray(state.perks)) state.perks = [];
      if (!Array.isArray(state.items)) state.items = [];
      if (!Array.isArray(state.achievements)) state.achievements = [];
      if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
      if (!Array.isArray(state.pendingOffers)) state.pendingOffers = [];
      if (!Array.isArray(state.activeCourses)) state.activeCourses = [];
      if (!state.eventHistory || typeof state.eventHistory !== 'object') state.eventHistory = {};
      if (!state.relationships || typeof state.relationships !== 'object') state.relationships = {};
      if (!state.skills || typeof state.skills !== 'object') state.skills = {};
      if (!state.softSkills || typeof state.softSkills !== 'object') state.softSkills = {};
    },
  },
  {
    to: 3,
    name: 'v3_freelance_bids',
    /**
     * v2 → v3: projects are no longer taken with a button, they are bid for
     * (`freelanceBid`, resolved at the turn of the day). Old saves simply have
     * no pending bid; an active project keeps running untouched.
     */
    up(state: any) {
      if (state.freelanceBid === undefined) state.freelanceBid = null;
    },
  },
  {
    to: 4,
    name: 'v4_cto_tenure',
    /**
     * v3 → v4: победа на выборах борда больше не фиксирует финал в тот же день
     * (В2, docs/PROPOSALS-2026-09-27-endgame.md). CTO — должность, а финал
     * `corporate_god` открывается после `endings.cto.minDaysAsCto` дней в кресле,
     * поэтому сейву нужен день избрания (`ctoSinceDay`).
     *
     * Старые сейвы делятся на два случая, и путать их нельзя:
     *
     *  1. Игрок всё ещё сидит в кресле (`grade === 'cto'` и есть работа) — его
     *     `careerEnding = 'corporate_god'` поставили выборы, а не он сам: до v4
     *     другого пути зафиксировать этот финал не существовало. Такое «окончание
     *     жизни» снимается, день избрания восстанавливается из
     *     `lastPromotionDay` (выборы всегда писали его тем же днём), и игрок
     *     продолжает партию: обычно срок уже выбран, и финал можно забрать сразу.
     *  2. Кресла нет (работу потеряли, либо сейв дошёл до «Новой жизни») —
     *     финал остаётся зафиксированным. Снимать его здесь означало бы
     *     запереть игрока: `canStartNewLife` опирается на `careerEnding`, а
     *     условия CTO-финала без работы недостижимы.
     */
    up(state: any) {
      const sitting = state.grade === 'cto' && Boolean(state.job);
      if (sitting && typeof state.ctoSinceDay !== 'number') {
        const promoted = state.lastPromotionDay;
        const day = typeof state.currentDay === 'number' ? state.currentDay : 1;
        state.ctoSinceDay =
          typeof promoted === 'number' && Number.isFinite(promoted) && promoted >= 0 && promoted <= day
            ? Math.floor(promoted)
            : day;
      }
      if (sitting && state.careerEnding === 'corporate_god') delete state.careerEnding;
    },
  },
  {
    to: 5,
    name: 'v5_identity_removal',
    /**
     * v4 → v5: пиксельная идентичность снята целиком (решение 22.10.2026,
     * docs/PROPOSALS-2026-10-22-room-redesign.md). Генетика, гардероб, кошелёк
     * и кросс-коллекционные бонусы больше не влияют ни на один экран: внешний
     * вид протагониста фиксирован артом, покупки не монтируются в NFT.
     * Поля удаляются из сейва, а не обнуляются — восстановить их всё равно
     * нечем: манифесты, генетика и NFT-мок удалены из контента и сервера.
     */
    up(state: any) {
      delete state.genetics;
      delete state.avatar;
      delete state.walletAddress;
      delete state.crossBonuses;
      delete state.room;
    },
  },
  {
    to: 6,
    name: 'v6_rng_salt',
    /**
     * v5 → v6: серверный RNG (P2.4, docs/PROPOSALS-2026-10-23-rng.md).
     * `rngSalt` — секретная соль бросков баланса (клиенту не отдаётся),
     * `rngSeq` — монотонный счётчик бросков (повтор запроса не даёт
     * «перебросить»). Поля добавляются к любому сейву; формулы и шансы
     * не меняются.
     */
    up(state: any) {
      if (typeof state.rngSalt !== 'string' || !state.rngSalt) state.rngSalt = makeRngSalt();
      if (typeof state.rngSeq !== 'number' || !Number.isFinite(state.rngSeq)) state.rngSeq = 0;
    },
  },
  {
    to: 7,
    name: 'v7_stars_cosmetics_revival',
    /**
     * v6 → v7: Stars-мерч выдавал мёртвые id косметики (гардероб и конструктор
     * комнаты удалены редизайном v5/v6). Обмениваем их на живые эксклюзивные
     * аксессуары питомца; списки `items` и `entitlements` дедуплицируются.
     * Идемпотентно: новые id в таблице не участвуют.
     */
    up(state: any) {
      const SWAP: Record<string, string> = {
        acc_vr_headset: 'pet_halo',
        top_hoodie_corp: 'pet_wings',
        decor_neon: 'pet_visor',
        desk_rgb: 'pet_scarf',
      };
      for (const key of ['items', 'entitlements'] as const) {
        if (!Array.isArray(state[key])) continue;
        state[key] = [...new Set<string>((state[key] as string[]).map((id) => SWAP[id] ?? id))];
      }
    },
  },
  {
    to: 8,
    name: 'v8_hungry_days',
    /**
     * v7 → v8: «еда» стала настоящей потребностью (голодный день бьёт по
     * здоровью, а оно ограничивает мотивацию). Счётчик голодных дней подряд
     * добавляется любому сейву; формулы расходов не меняются.
     */
    up(state: any) {
      if (typeof state.hungryDays !== 'number' || !Number.isFinite(state.hungryDays)) state.hungryDays = 0;
    },
  },
  {
    to: 9,
    name: 'v9_bank_slots',
    /**
     * v8 → v9: «слоты банка дней» (Telegram Stars, по политике монетизации) —
     * расширение ёмкости банка офлайн-дней сверх базовых 7. Счётчик слотов
     * добавляется любому сейву; ёмкость = bankCap(bankSlots).
     */
    up(state: any) {
      if (typeof state.bankSlots !== 'number' || !Number.isFinite(state.bankSlots)) state.bankSlots = 0;
    },
  },
];

const SOFT_SKILL_DEFAULTS: Record<string, { level: number; xp: number }> = {
  communication: { level: 5, xp: 0 },
  english: { level: 10, xp: 0 },
  time_management: { level: 3, xp: 0 },
};

/**
 * Repairs that must hold for EVERY save regardless of version: shape of the
 * required collections, resource clamps, no NaN. Idempotent by construction.
 */
export function normalizeState(state: any): void {
  if (typeof state.rngSalt !== 'string' || !state.rngSalt) state.rngSalt = makeRngSalt();
  if (typeof state.rngSeq !== 'number' || !Number.isFinite(state.rngSeq)) state.rngSeq = 0;
  for (const key of ['skills', 'softSkills', 'eventHistory', 'relationships'] as const) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
  }
  for (const key of [
    'perks',
    'items',
    'achievements',
    'pendingEvents',
    'pendingOffers',
    'activeCourses',
    'recentEventTags',
    'entitlements',
    'badges',
  ] as const) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  for (const [id, def] of Object.entries(SOFT_SKILL_DEFAULTS)) {
    const cur = state.softSkills[id];
    if (!cur || typeof cur.level !== 'number' || !Number.isFinite(cur.level)) state.softSkills[id] = { ...def };
    else if (typeof cur.xp !== 'number' || !Number.isFinite(cur.xp)) cur.xp = 0;
  }

  const num = (value: any, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  state.currentDay = Math.max(1, Math.floor(num(state.currentDay, 1)));
  state.money = Math.max(0, Math.round(num(state.money, 0)));
  // D2: связи — с капом, чтобы старые/кривые сейвы не уезжали за потолок
  state.contacts = clamp(Math.round(num(state.contacts, 0)), 0, 20);
  state.health = clamp(num(state.health, 80), 0, 100);
  state.motivation = clamp(num(state.motivation, 50), 0, 100);
  state.reputation = clamp(num(state.reputation, 0), 0, 100);
  state.maxEnergy = clamp(num(state.maxEnergy, 10), 3, 30);
  state.energy = clamp(num(state.energy, state.maxEnergy), 0, state.maxEnergy);
  // Слоты банка дней — раньше ёмкости банка, иначе оба клипа спорят о потолке.
  state.bankSlots = clamp(Math.floor(num(state.bankSlots, 0)), 0, MAX_BANK_SLOTS);
  state.bankedDays = clamp(num(state.bankedDays, 0), 0, bankCap(state.bankSlots));
  state.housingLevel = clamp(Math.floor(num(state.housingLevel, 0)), 0, 5);
  state.totalActions = Math.max(0, Math.floor(num(state.totalActions, 0)));
  state.daysSinceRegistration = Math.max(1, Math.floor(num(state.daysSinceRegistration, 1)));
  state.jobWarnings = Math.max(0, Math.floor(num(state.jobWarnings, 0)));

  // День избрания CTO: только валидное число, не позже текущего дня. Мусор
  // (строка, NaN, «избран завтра») превращается в отсутствие срока — иначе
  // `ctoTenureDays` вернул бы отрицательное число, а UI напечатал «−12 дней».
  if (state.ctoSinceDay !== undefined) {
    const since = state.ctoSinceDay;
    if (typeof since !== 'number' || !Number.isFinite(since) || since > state.currentDay) delete state.ctoSinceDay;
    else state.ctoSinceDay = Math.max(0, Math.floor(since));
  }

  // A bid without a project id is noise the day cycle would trip over.
  const bid = state.freelanceBid;
  if (bid && (typeof bid.projectId !== 'string' || !bid.projectId)) state.freelanceBid = null;
  else if (bid) {
    bid.chance = clamp(num(bid.chance, 0.3), 0, 1);
    bid.day = Math.max(1, Math.floor(num(bid.day, state.currentDay)));
  } else if (bid === undefined) state.freelanceBid = null;

  // Skill entries can arrive as bare numbers from very old saves
  for (const [id, value] of Object.entries(state.skills as Record<string, any>)) {
    if (typeof value === 'number') state.skills[id] = { level: value, xp: 0 };
    else if (!value || typeof value.level !== 'number') delete state.skills[id];
  }
}

/**
 * Bring a persisted save up to `CURRENT_STATE_VERSION`.
 * Mutates a *copy*: the input object is never modified.
 */
export function migrateState<T = PlayerState>(raw: any): MigrationResult<T> {
  const before = JSON.stringify(raw);
  const state = JSON.parse(before);
  const applied: string[] = [];

  const version = typeof state.version === 'number' && Number.isFinite(state.version) ? state.version : 1;

  if (version > CURRENT_STATE_VERSION) {
    return { state, applied, changed: false, fromFuture: true };
  }

  for (const migration of MIGRATIONS) {
    if (version < migration.to) {
      migration.up(state);
      state.version = migration.to;
      applied.push(migration.name);
    }
  }
  state.version = CURRENT_STATE_VERSION;

  normalizeState(state);

  return { state, applied, changed: JSON.stringify(state) !== before, fromFuture: false };
}

/** True when the save would be changed by `migrateState` (cheap pre-check). */
export function needsMigration(raw: any): boolean {
  const version = typeof raw?.version === 'number' ? raw.version : 1;
  return version < CURRENT_STATE_VERSION;
}
