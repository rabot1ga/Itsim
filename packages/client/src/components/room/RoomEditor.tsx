import React from 'react';
import {
  LayerManifest,
  GeneticTraits,
  GeneticsConfig,
  ROOM_EDITABLE_SLOTS,
  RoomSlotId,
  REPAINT_COST,
  buildRoomUnlockContext,
  roomEntryStatus,
} from '@itsim/shared';
import { useGameStore } from '../../store/gameStore';
import { haptic } from '../../lib/telegram';
import { Composition } from './layers';
import { PixelIcon } from '../pixel/PixelIcon';
import { EmojiToken } from '../ui';

/**
 * Room editor (docs/design.md §12.2) — per-slot carousels with live room preview.
 * Every tap applies immediately via `customize_room` (server-validated with the
 * same shared rules that render the locks, so they can never disagree).
 */

const SLOT_META: Record<RoomSlotId, { icon: string; name: string }> = {
  bg: { icon: '🧱', name: 'Стены' },
  window: { icon: '🪟', name: 'Окно' },
  decor: { icon: '🖼', name: 'Декор' },
  desk: { icon: '🪑', name: 'Стол' },
  setup: { icon: '🖥', name: 'Сетап' },
  chair: { icon: '💺', name: 'Кресло' },
  atmosphere: { icon: '🪴', name: 'Атмосфера' },
  pet: { icon: '🐾', name: 'Питомец' },
};

const ENTRY_NAMES: Record<string, string> = {
  bg_0: 'Общага', bg_1: 'Однушка', bg_2: 'Центр', bg_3: 'Ипотека', bg_4: 'Пентхаус',
  window_square: 'Квадратное', window_panoramic: 'Панорамное', window_round: 'Круглое',
  window_arched: 'Арочное', window_blinds: 'Жалюзи',
  decor_poster_js: 'JS-постер', decor_neon: 'Неон', decor_server: 'Серверная',
  decor_books: 'Книги', decor_whiteboard: 'Доска', decor_madlads_poster: 'Mad Lads',
  decor_pirate_poster: 'Пиратский', decor_clock: 'Часы', decor_poster_python: 'Python-постер',
  decor_garland: '🎄 Гирлянда', decor_fir: '🎄 Ёлка',
  desk_parata: 'Парта', desk_ikea: 'IKEA', desk_office: 'Офисный', desk_standing: 'Standing',
  desk_rgb: 'RGB-стол',
  setup_laptop: 'Ноутбук', setup_monitor: 'Монитор', setup_dual: 'Два монитора',
  setup_gaming: 'Игровой ПК', setup_macbook: 'MacBook', setup_ultrawide: 'Ультравайд',
  chair_stool: 'Табуретка', chair_office: 'Офисное', chair_gaming: 'Геймерское',
  chair_herman_miller: 'Herman Miller', chair_throne: 'Трон',
  atmo_none: 'Пусто', atmo_plant: 'Растение', atmo_cactus: 'Кактус', atmo_coffee: 'Кофе',
  atmo_rug: 'Ковёр', atmo_lamp: 'Лампа',
  pet_none: 'Нет', pet_cat: 'Кот', pet_dog: 'Корги', pet_cactus: 'Кактус',
  pet_robo: 'Пылесос', pet_spider: 'Паук', pet_bulldog: 'Бульдог',
  pet_parrot: 'Попугай Кеша', pet_hamster: 'Хомяк Байт', pet_fish: 'Рыбка Гит',
};

export function entryName(id: string): string {
  return ENTRY_NAMES[id] ?? id.replace(/^(bg|window|decor|desk|setup|chair|atmo|pet)_/, '').replace(/_/g, ' ');
}

/** Approximate a wall palette tint as a displayable swatch color. */
function swatchColor(p: { hue: number; sat: number; light: number }): string {
  const s = Math.max(4, Math.min(90, p.sat * 40));
  const l = Math.max(22, Math.min(78, p.light * 48));
  return `hsl(${p.hue}, ${s}%, ${l}%)`;
}

export const RoomEditor: React.FC<{
  roomManifest: LayerManifest;
  geneticsConfig: GeneticsConfig;
  traits: GeneticTraits;
  player: any;
  heldCollections: string[];
  composition: Composition;
}> = ({ roomManifest, geneticsConfig, traits, player, heldCollections, composition }) => {
  const performAction = useGameStore((s) => s.performAction);
  const ctx = buildRoomUnlockContext(player, heldCollections ?? []);
  const overrides: Record<string, string | null> = player?.room?.slots ?? {};

  const apply = async (slot: string, entryId: string | null) => {
    const ok = await performAction('customize_room', { slot, entryId });
    if (!ok) haptic('error');
  };

  const wallPalette = geneticsConfig.wallPalette ?? [];
  const currentWall = player?.room?.wallColor ?? traits.wallColor;

  return (
    <div className="space-y-4 animate-fade-in">
      {ROOM_EDITABLE_SLOTS.map((slotId) => {
        const slot = roomManifest.slots.find((s) => s.id === slotId);
        if (!slot) return null;
        const meta = SLOT_META[slotId];
        const override = overrides[slotId] ?? null;
        const activeEntry = override ?? composition[slotId] ?? null;

        return (
          <div key={slotId}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold text-ink-300">
                <EmojiToken className="!w-5 !h-5 !text-[11px]">{meta.icon}</EmojiToken>
                {meta.name}
              </h4>
              <span className="text-2xs text-ink-500">
                {override ? entryName(override) : `авто: ${activeEntry ? entryName(activeEntry) : '—'}`}
              </span>
            </div>
            <div className="scroll-row flex gap-2 overflow-x-auto pb-1 snap-x">
              {/* Back to automatic */}
              <button
                onClick={() => void apply(slotId, null)}
                className={`snap-start shrink-0 w-[76px] border p-1.5 text-center transition-colors ${
                  !override ? 'border-gold-700 bg-gold-900/20' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <PixelIcon name="star" size={16} className="text-ink-300 mx-auto h-11" />
                <p className="text-2xs text-ink-300 mt-0.5">Авто</p>
              </button>

              {slot.entries.map((entry) => {
                const status = roomEntryStatus(ctx, slotId, entry.id);
                const active = activeEntry === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      if (!status.unlocked) {
                        haptic('error');
                        return;
                      }
                      void apply(slotId, entry.id);
                    }}
                    title={status.unlocked ? entryName(entry.id) : status.hint}
                    className={`snap-start shrink-0 w-[76px] border p-1.5 text-center transition-colors ${
                      active
                        ? 'border-gold-700 bg-gold-900/20'
                        : status.unlocked
                          ? 'border-ink-700 bg-ink-900'
                          : 'border-ink-800 bg-ink-950'
                    }`}
                  >
                    <span className="relative flex items-center justify-center h-11 overflow-hidden bg-ink-800">
                      {entry.file ? (
                        <img
                          src={`/layers/${entry.file}`}
                          alt=""
                          draggable={false}
                          className={`w-full h-full object-cover select-none pixelated ${status.unlocked ? '' : 'grayscale opacity-40'}`}
                        />
                      ) : (
                        <PixelIcon name="lock" size={14} className="text-ink-600" />
                      )}
                      {!status.unlocked && (
                        <span className="absolute inset-0 flex items-center justify-center"><PixelIcon name="lock" size={12} className="text-ink-300" /></span>
                      )}
                      {active && <PixelIcon name="check" size={9} className="absolute top-1 right-1 text-gold-300" />}
                    </span>
                    <p className={`text-2xs mt-1 leading-tight truncate ${status.unlocked ? 'text-ink-300' : 'text-ink-500'}`}>
                      {entryName(entry.id)}
                    </p>
                    {!status.unlocked && (
                      <p className="text-[9px] text-ink-600 leading-tight mt-0.5 line-clamp-2">{status.hint}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Wall repaint */}
      {wallPalette.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-400">Цвет стен</h4>
            <span className="num text-2xs text-ink-500">банка краски — {REPAINT_COST} ₽</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {wallPalette.map((p: any) => {
              const active = currentWall === p.id;
              const genetic = traits.wallColor === p.id && !player?.room?.wallColor;
              return (
                <button
                  key={p.id}
                  onClick={() => void apply('wallColor', p.id)}
                  title={p.name}
                  className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 border transition-all active:scale-95 touch-target ${
                    active ? 'border-moss-500/60 bg-moss-600/10' : 'border-ink-700 bg-ink-800/50'
                  }`}
                >
                  <span
                    className="w-6 h-6 border-2 border-black/40 shrink-0"
                    style={{ background: swatchColor(p) }}
                  />
                  <span className="text-[10px] text-ink-300">
                    {p.name}
                    {genetic ? ' · своё' : ''}
                    {active ? ' ✅' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
