import React from 'react';
import {
  LayerManifest,
  GeneticTraits,
  AVATAR_EDITABLE_SLOTS,
  AvatarSlotId,
  HAIRCUT_COST,
  BEARD_COST,
  HAT_COST,
  PANTS_COST,
  buildAvatarUnlockContext,
  avatarEntryStatus,
  avatarChangeCost,
  geneticTraitForSlot,
} from '@itsim/shared';
import { useGameStore } from '../../store/gameStore';
import { haptic } from '../../lib/telegram';
import { PixelIcon } from '../pixel/PixelIcon';
import { EmojiToken } from '../ui';

/**
 * Wardrobe (docs/design.md §12.5) — change hair/beard/clothes/accessories.
 * Same UX as the room editor: per-slot carousels, locks with hints, tap to apply.
 * Stored as layered ids; the pixel renderer maps them (beard/medal are layered-only).
 */

const SLOT_META: Record<AvatarSlotId, { icon: string; name: string; price?: string }> = {
  hair: { icon: '💇', name: 'Причёска', price: `стрижка — ${HAIRCUT_COST} ₽` },
  beard: { icon: '🪒', name: 'Борода', price: `барбер — ${BEARD_COST} ₽` },
  top: { icon: '👕', name: 'Одежда' },
  bottom: { icon: '👖', name: 'Штаны', price: `швейный цех — ${PANTS_COST} ₽` },
  accessory: { icon: '🎧', name: 'Аксессуар', price: `кепка/шапка — ${HAT_COST} ₽` },
};

const ENTRY_NAMES: Record<string, string> = {
  hair_buzzcut: 'Ёжик', hair_short: 'Короткие', hair_messy: 'Взъерошенные',
  hair_long: 'Длинные', hair_bald: 'Лысый', hair_manbun: 'Пучок',
  hair_curly: 'Кудри', hair_undercut: 'Андеркат', hair_spiky: 'Ирокез', hair_ponytail: 'Хвостик',
  beard_none: 'Гладко', beard_stubble: 'Щетина', beard_goatee: 'Эспаньолка',
  beard_full: 'Борода', beard_mustache: 'Усы',
  top_hoodie_gray: 'Серое худи', top_hoodie_localhost: 'localhost', top_hoodie_corp: 'Корп. мерч',
  top_tshirt: 'Футболка', top_shirt: 'Рубашка', top_jacket: 'Куртка', top_hoodie_cat: 'Кот-худи',
  bottom_jeans: 'Джинсы', bottom_sweatpants: 'Спортивки', bottom_chinos: 'Чиносы',
  bottom_shorts: 'Шорты', bottom_suit: 'Костюмные',
  acc_none: 'Нет', acc_headphones: 'Наушники', acc_glasses: 'Очки',
  acc_vr_headset: 'VR-шлем', acc_cap: 'Кепка', acc_medal: 'Медаль', acc_beanie: 'Шапка',
};

function entryName(id: string): string {
  return ENTRY_NAMES[id] ?? id.replace(/^(hair|beard|top|bottom|acc)_/, '').replace(/_/g, ' ');
}

export const Wardrobe: React.FC<{
  avatarManifest: LayerManifest;
  traits: GeneticTraits;
  player: any;
}> = ({ avatarManifest, traits, player }) => {
  const performAction = useGameStore((s) => s.performAction);
  const ctx = buildAvatarUnlockContext(player);
  const overrides: Record<string, string | null> = player?.avatar ?? {};

  const apply = async (slot: string, entryId: string | null) => {
    const ok = await performAction('customize_avatar', { slot, entryId });
    if (!ok) haptic('error');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-[11px] text-ink-500 -mb-1">
        Глаза не меняются — это родословная. Всё остальное решают барбер, шкаф и шляпная лавка.
      </p>
      {AVATAR_EDITABLE_SLOTS.map((slotId) => {
        const slot = avatarManifest.slots.find((s) => s.id === slotId);
        if (!slot) return null;
        const meta = SLOT_META[slotId];
        const override = overrides[slotId] ?? null;
        const genetic = geneticTraitForSlot(traits, slotId);
        const activeEntry = override ?? genetic ?? null;

        return (
          <div key={slotId}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold text-ink-300">
                <EmojiToken className="!w-5 !h-5 !text-[11px]">{meta.icon}</EmojiToken>
                {meta.name}
              </h4>
              <span className="text-2xs text-ink-500">
                {override ? entryName(override) : `своё: ${activeEntry ? entryName(activeEntry) : '—'}`}
                {meta.price ? ` · ${meta.price}` : ''}
              </span>
            </div>
            <div className="scroll-row flex gap-2 overflow-x-auto pb-1 snap-x">
              {/* Back to genetic */}
              <button
                onClick={() => void apply(slotId, null)}
                className={`snap-start shrink-0 w-[76px] rounded-lg border p-1.5 text-center transition-colors ${
                  !override ? 'border-gold-700 bg-gold-900/20' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <PixelIcon name="person" size={16} className="text-ink-300 mx-auto h-11" />
                <p className="text-2xs text-ink-300 mt-0.5">Своё</p>
              </button>

              {slot.entries.map((entry) => {
                const status = avatarEntryStatus(ctx, slotId, entry.id);
                const active = activeEntry === entry.id;
                const cost = status.unlocked ? avatarChangeCost(slotId, entry.id, activeEntry ?? undefined) : 0;
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
                    className={`snap-start shrink-0 w-[76px] rounded-lg border p-1.5 text-center transition-colors ${
                      active
                        ? 'border-gold-700 bg-gold-900/20'
                        : status.unlocked
                          ? 'border-ink-700 bg-ink-900'
                          : 'border-ink-800 bg-ink-950'
                    }`}
                  >
                    <span className="relative flex items-center justify-center h-11 rounded-md overflow-hidden bg-ink-800">
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
                    {!status.unlocked ? (
                      <p className="text-[9px] text-ink-600 leading-tight mt-0.5 line-clamp-2">{status.hint}</p>
                    ) : cost > 0 && !active ? (
                      <p className="text-[8px] text-gold-400/90 leading-tight mt-0.5">{cost} ₽</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
