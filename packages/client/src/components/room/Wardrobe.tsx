import React from 'react';
import {
  LayerManifest,
  GeneticTraits,
  AVATAR_EDITABLE_SLOTS,
  AvatarSlotId,
  HAIRCUT_COST,
  BEARD_COST,
  HAT_COST,
  buildAvatarUnlockContext,
  avatarEntryStatus,
  avatarChangeCost,
  geneticTraitForSlot,
} from '@itsim/shared';
import { useGameStore } from '../../store/gameStore';
import { haptic } from '../../lib/telegram';

/**
 * Wardrobe (docs/design.md §12.5) — change hair/beard/clothes/accessories.
 * Same UX as the room editor: per-slot carousels, locks with hints, tap to apply.
 * Stored as layered ids; the pixel renderer maps them (beard/medal are layered-only).
 */

const SLOT_META: Record<AvatarSlotId, { icon: string; name: string; price?: string }> = {
  hair: { icon: '💇', name: 'Причёска', price: `стрижка — ${HAIRCUT_COST} ₽` },
  beard: { icon: '🪒', name: 'Борода', price: `барбер — ${BEARD_COST} ₽` },
  top: { icon: '👕', name: 'Одежда' },
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
  acc_none: 'Нет', acc_headphones: 'Наушники', acc_glasses: 'Очки',
  acc_vr_headset: 'VR-шлем', acc_cap: 'Кепка', acc_medal: 'Медаль', acc_beanie: 'Шапка',
};

function entryName(id: string): string {
  return ENTRY_NAMES[id] ?? id.replace(/^(hair|beard|top|acc)_/, '').replace(/_/g, ' ');
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
      <p className="text-[11px] text-slate-500 -mb-1">
        Глаза не меняются — это родословная 🧬 А всё остальное — барбер, шкаф и шляпная лавка.
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
              <h4 className="text-xs font-semibold text-slate-300">
                {meta.icon} {meta.name}
              </h4>
              <span className="text-[10px] text-slate-500">
                {override ? entryName(override) : `своё: ${activeEntry ? entryName(activeEntry) : '—'}`}
                {meta.price ? ` · ${meta.price}` : ''}
              </span>
            </div>
            <div className="scroll-row flex gap-2 overflow-x-auto pb-1 snap-x">
              {/* Back to genetic */}
              <button
                onClick={() => void apply(slotId, null)}
                className={`snap-start shrink-0 w-[76px] rounded-xl border p-1.5 text-center transition-all active:scale-95 ${
                  !override
                    ? 'border-primary-500/60 bg-primary-600/10'
                    : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                <span className="text-2xl">🧬</span>
                <p className="text-[10px] text-slate-300 mt-0.5">Своё</p>
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
                    className={`snap-start shrink-0 w-[76px] rounded-xl border p-1.5 text-center transition-all active:scale-95 ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-600/10'
                        : status.unlocked
                          ? 'border-slate-700 bg-slate-800/50'
                          : 'border-slate-800 bg-slate-900/60'
                    }`}
                  >
                    <span className="relative block h-11 rounded-lg overflow-hidden bg-slate-800">
                      {entry.file ? (
                        <img
                          src={`/layers/${entry.file}`}
                          alt=""
                          draggable={false}
                          className={`w-full h-full object-cover select-none ${status.unlocked ? '' : 'grayscale opacity-40'}`}
                        />
                      ) : (
                        <span className="text-xl leading-[44px]">🚫</span>
                      )}
                      {!status.unlocked && (
                        <span className="absolute inset-0 flex items-center justify-center text-base">🔒</span>
                      )}
                      {active && <span className="absolute top-0.5 right-0.5 text-[10px]">✅</span>}
                    </span>
                    <p className={`text-[10px] mt-1 leading-tight truncate ${status.unlocked ? 'text-slate-300' : 'text-slate-500'}`}>
                      {entryName(entry.id)}
                    </p>
                    {!status.unlocked ? (
                      <p className="text-[8px] text-slate-600 leading-tight mt-0.5 line-clamp-2">{status.hint}</p>
                    ) : cost > 0 && !active ? (
                      <p className="text-[8px] text-amber-400/90 leading-tight mt-0.5">{cost} ₽</p>
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
