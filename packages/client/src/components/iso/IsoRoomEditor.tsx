import React from 'react';
import { REPAINT_COST, FLOOR_STYLES, WALL_PAINTS, floorsFor, paintsFor } from '@itsim/shared';
import { useGameStore } from '../../store/gameStore';
import { haptic } from '../../lib/telegram';
import { PixelIcon } from '../pixel/PixelIcon';

/**
 * Room finishes editor.
 *
 * The flat is generated, not authored — but the paint and the flooring are the
 * player's call. Each swatch shows the real colours the room will be drawn
 * with, locked finishes show what unlocks them, and every tap goes straight to
 * the server (`customize_room`), which validates the choice with the same
 * shared rules. "Авто" hands the decision back to the seed.
 */
export const IsoRoomEditor: React.FC<{
  player: { housingLevel?: number; money?: number; room?: { paint?: string; floor?: string } };
}> = ({ player }) => {
  const performAction = useGameStore((s) => s.performAction);
  const tier = Math.max(0, Math.min(4, player.housingLevel ?? 0));

  const apply = async (slot: 'paint' | 'floor', entryId: string | null) => {
    haptic('selection');
    await performAction('customize_room', { slot, entryId });
  };

  const canAfford = (current?: string, next?: string | null) =>
    current === next || (player.money ?? 0) >= REPAINT_COST;

  const paints = paintsFor(tier);
  const floors = floorsFor(tier);

  const Swatch: React.FC<{
    active: boolean;
    disabled?: boolean;
    title: string;
    colours: string[];
    onClick: () => void;
  }> = ({ active, disabled, title, colours, onClick }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 w-[64px] rounded-lg border p-1.5 text-left transition-all active:scale-[0.97] ${
        active ? 'border-gold-300 bg-gold-300/10' : 'border-ink-700 bg-ink-800'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="flex h-6 w-full overflow-hidden rounded">
        {colours.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span className="mt-1 block truncate text-2xs text-ink-300">{title}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-2xs text-ink-500">
        Ремонт стоит {REPAINT_COST} ₽ за раз. «Авто» — вернуть отделку, которую комната выбирает сама.
      </p>

      <div>
        <h4 className="eyebrow mb-2 flex items-center gap-1.5">
          <PixelIcon name="house" size={10} className="text-ink-500" />
          Стены
        </h4>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Swatch
            active={!player.room?.paint}
            title="Авто"
            colours={['#3a4456', '#2a3240']}
            onClick={() => apply('paint', null)}
          />
          {paints.map((p) => (
            <Swatch
              key={p.id}
              active={player.room?.paint === p.id}
              disabled={!canAfford(player.room?.paint, p.id)}
              title={p.name}
              colours={[p.left, p.right, p.trim]}
              onClick={() => apply('paint', p.id)}
            />
          ))}
        </div>
        {paints.length < WALL_PAINTS.length && (
          <p className="mt-1 text-2xs text-ink-600">
            Ещё {WALL_PAINTS.length - paints.length} вариантов откроются с новым жильём.
          </p>
        )}
      </div>

      <div>
        <h4 className="eyebrow mb-2 flex items-center gap-1.5">
          <PixelIcon name="box" size={10} className="text-ink-500" />
          Пол
        </h4>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Swatch
            active={!player.room?.floor}
            title="Авто"
            colours={['#8a6238', '#95693c']}
            onClick={() => apply('floor', null)}
          />
          {floors.map((f) => (
            <Swatch
              key={f.id}
              active={player.room?.floor === f.id}
              disabled={!canAfford(player.room?.floor, f.id)}
              title={f.name}
              colours={[f.a, f.b, f.line]}
              onClick={() => apply('floor', f.id)}
            />
          ))}
        </div>
        {floors.length < FLOOR_STYLES.length && (
          <p className="mt-1 text-2xs text-ink-600">
            Ещё {FLOOR_STYLES.length - floors.length} покрытий откроются с новым жильём.
          </p>
        )}
      </div>
    </div>
  );
};
