import { RoomSlotId, PlayerState } from '../types/index';

/**
 * Room editor unlock rules (docs/design.md §12.2).
 *
 * Shared by the server (validates `customize_room`) and the client (lock badges
 * + "where to get" hints), so the editor can never show an option the server
 * would reject.
 */

export const REPAINT_COST = 500;

/**
 * Seasonal drops (docs/design.md §15.9): winter decor is unlocked every December
 * (server-local time on the server, device time on the client — close enough for
 * a cosmetic drop; the server has the final say).
 */
export function isFestiveSeason(now: Date = new Date()): boolean {
  return now.getMonth() === 11;
}

/** Minimal player shape the rules need (works with the client's `any` player too). */
export interface RoomUnlockContext {
  housingLevel: number;
  items: string[];
  achievements: string[];
  skillLevel: (id: string) => number;
  totalLevels: number;
  hasJob: boolean;
  heldCollections: string[];
}

export function buildRoomUnlockContext(
  player: Pick<PlayerState, 'housingLevel' | 'items' | 'achievements' | 'skills' | 'job'>,
  heldCollections: string[] = []
): RoomUnlockContext {
  const skills = player.skills ?? {};
  return {
    housingLevel: player.housingLevel ?? 0,
    items: player.items ?? [],
    achievements: player.achievements ?? [],
    skillLevel: (id: string) => skills[id]?.level ?? 0,
    totalLevels: Object.values(skills).reduce((sum, s) => sum + (s?.level ?? 0), 0),
    hasJob: player.job != null,
    heldCollections,
  };
}

export interface RoomEntryStatus {
  unlocked: boolean;
  /** shown under locked options: where to get it */
  hint: string;
}

const DESK_ORDER = ['desk_parata', 'desk_ikea', 'desk_office', 'desk_standing', 'desk_rgb'];

export function roomEntryStatus(
  ctx: RoomUnlockContext,
  slot: RoomSlotId,
  entryId: string
): RoomEntryStatus {
  const has = (item: string) => ctx.items.includes(item);
  const ach = (id: string) => ctx.achievements.includes(id);
  const cross = (id: string) => ctx.heldCollections.includes(id);
  const lock = (hint: string): RoomEntryStatus => ({ unlocked: false, hint });

  switch (slot) {
    case 'bg': {
      const m = /^bg_(\d)$/.exec(entryId);
      if (!m) return lock('Неизвестный фон');
      const need = Number(m[1]);
      return need <= ctx.housingLevel
        ? { unlocked: true, hint: '' }
        : lock(`Нужно жильё уровня ${need} 🏠`);
    }
    case 'desk': {
      const idx = DESK_ORDER.indexOf(entryId);
      if (idx < 0) return lock('Неизвестный стол');
      return idx <= ctx.housingLevel
        ? { unlocked: true, hint: '' }
        : lock(`Нужно жильё уровня ${idx} 🏠`);
    }
    case 'window': {
      switch (entryId) {
        case 'window_square':
          return { unlocked: true, hint: '' };
        case 'window_blinds':
          return ctx.housingLevel >= 1 ? { unlocked: true, hint: '' } : lock('Нужно жильё 1+ 🏠');
        case 'window_panoramic':
          return ctx.housingLevel >= 2 ? { unlocked: true, hint: '' } : lock('Нужно жильё 2+ 🏠');
        case 'window_arched':
          return ctx.housingLevel >= 3 ? { unlocked: true, hint: '' } : lock('Нужно жильё 3+ 🏠');
        case 'window_round':
          return ach('events_50') ? { unlocked: true, hint: '' } : lock('Ачивка «🎲 50 событий»');
        default:
          return lock('Неизвестное окно');
      }
    }
    case 'decor': {
      switch (entryId) {
        case 'decor_poster_js':
          return { unlocked: true, hint: '' };
        case 'decor_books':
          return ctx.totalLevels >= 10
            ? { unlocked: true, hint: '' }
            : lock(`Нужно Σ уровней навыков: 10 (сейчас ${ctx.totalLevels})`);
        case 'decor_neon':
          return ctx.housingLevel >= 1 ? { unlocked: true, hint: '' } : lock('Нужно жильё 1+ 🏠');
        case 'decor_whiteboard':
          return ctx.hasJob ? { unlocked: true, hint: '' } : lock('Устройся на работу 💼');
        case 'decor_clock':
          return ctx.housingLevel >= 2 ? { unlocked: true, hint: '' } : lock('Нужно жильё 2+ 🏠');
        case 'decor_poster_python':
          return ctx.skillLevel('python') >= 10
            ? { unlocked: true, hint: '' }
            : lock(`Нужен Python 10+ (сейчас ${ctx.skillLevel('python')})`);
        case 'decor_server':
          return has('mining_gpu') || has('mining_rig') || has('mining_asic') || ach('mining_100k')
            ? { unlocked: true, hint: '' }
            : lock('Займись майнингом ⛏');
        case 'decor_madlads_poster':
          return cross('mad_lads') ? { unlocked: true, hint: '' } : lock('Держи Mad Lads 🌐');
        case 'decor_pirate_poster':
          return cross('smb_gen2') ? { unlocked: true, hint: '' } : lock('Держи SMB Gen2 🌐');
        case 'decor_garland':
        case 'decor_fir':
          return isFestiveSeason()
            ? { unlocked: true, hint: '' }
            : lock('🎄 Зимний дроп — вернётся в декабре');
        default:
          return lock('Неизвестный декор');
      }
    }
    case 'chair': {
      switch (entryId) {
        case 'chair_stool':
          return { unlocked: true, hint: '' };
        case 'chair_office':
          return ctx.housingLevel >= 1 || has('office_chair')
            ? { unlocked: true, hint: '' }
            : lock('Жильё 1+ или кресло из магазина 🏪');
        case 'chair_gaming':
          return has('gaming_chair') ? { unlocked: true, hint: '' } : lock('Купи геймерское кресло 🏪');
        case 'chair_herman_miller':
          return has('herman_miller') ? { unlocked: true, hint: '' } : lock('Купи Herman Miller 🏪');
        case 'chair_throne':
          return ach('reached_teamlead') ? { unlocked: true, hint: '' } : lock('Стань тимлидом 👑');
        default:
          return lock('Неизвестное кресло');
      }
    }
    case 'setup': {
      switch (entryId) {
        case 'setup_laptop':
          return { unlocked: true, hint: '' };
        case 'setup_monitor':
          return has('cheap_pc') || has('mechanical_keyboard')
            ? { unlocked: true, hint: '' }
            : lock('Купи ПК или клавиатуру 🏪');
        case 'setup_dual':
          return ach('reached_middle') ? { unlocked: true, hint: '' } : lock('Стань мидлом 📈');
        case 'setup_gaming':
          return has('gaming_pc') ? { unlocked: true, hint: '' } : lock('Купи игровой ПК 🏪');
        case 'setup_macbook':
          return has('macbook') ? { unlocked: true, hint: '' } : lock('Купи MacBook 🏪');
        case 'setup_ultrawide':
          return ach('first_million') ? { unlocked: true, hint: '' } : lock('Ачивка «🤑 Первый миллион»');
        default:
          return lock('Неизвестный сетап');
      }
    }
    case 'atmosphere': {
      switch (entryId) {
        case 'atmo_none':
          return { unlocked: true, hint: '' };
        case 'atmo_rug':
          return ctx.housingLevel >= 1 ? { unlocked: true, hint: '' } : lock('Нужно жильё 1+ 🏠');
        case 'atmo_plant':
          return ctx.housingLevel >= 2 ? { unlocked: true, hint: '' } : lock('Нужно жильё 2+ 🏠');
        case 'atmo_lamp':
          return ctx.housingLevel >= 3 ? { unlocked: true, hint: '' } : lock('Нужно жильё 3+ 🏠');
        case 'atmo_cactus':
          return has('desk_plant') ? { unlocked: true, hint: '' } : lock('Купи кактус на стол 🏪');
        case 'atmo_coffee':
          return has('coffee_maker') ? { unlocked: true, hint: '' } : lock('Купи кофемашину 🏪');
        default:
          return lock('Неизвестная атмосфера');
      }
    }
    case 'pet': {
      if (entryId === 'pet_none') return { unlocked: true, hint: '' };
      if (entryId === 'pet_bulldog') {
        return has('pet_bulldog') || cross('degods')
          ? { unlocked: true, hint: '' }
          : lock('Купи бульдога или держи DeGods 🐾');
      }
      const petItems: Record<string, string> = {
        pet_cat: 'pet_cat',
        pet_dog: 'pet_dog',
        pet_cactus: 'pet_cactus',
        pet_robo: 'pet_robo',
        pet_spider: 'pet_spider',
      };
      const item = petItems[entryId];
      if (!item) return lock('Неизвестный питомец');
      return has(item) ? { unlocked: true, hint: '' } : lock('Купи питомца в магазине 🐾');
    }
  }
}

/** All room slots the editor can customize (manifest order, decor before furniture). */
export const ROOM_EDITABLE_SLOTS: RoomSlotId[] = [
  'bg',
  'window',
  'decor',
  'desk',
  'setup',
  'chair',
  'atmosphere',
  'pet',
];

export function isRoomSlotId(slot: string): slot is RoomSlotId {
  return (ROOM_EDITABLE_SLOTS as string[]).includes(slot);
}
