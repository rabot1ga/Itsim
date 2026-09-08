import React from 'react';
import { ResChip } from './ui';
import { formatMoney, type ActionDef } from '../screens/actionCatalogue';

/**
 * A grid of action tiles — the single way the game offers «spend energy, get
 * something». Every tab renders its own slice of the catalogue through it, so
 * a tile looks and behaves the same whether it is a sprint task or a walk.
 */

export interface ActionTile {
  id: string;
  emoji: string;
  name: string;
  energy: number;
  cost?: number;
  hint?: string;
  /** requirement the player cannot pay their way out of */
  locked?: boolean;
  lockLabel?: string;
  /** extra chips after the cost — payouts, bonuses */
  gain?: React.ReactNode;
}

export const toTile = (action: ActionDef, hasJob: boolean): ActionTile => ({
  id: action.id,
  emoji: action.emoji,
  name: action.name,
  energy: action.energy,
  cost: action.cost,
  hint: action.hint,
  locked: Boolean(action.requiresJob && !hasJob),
  lockLabel: 'Нужна работа',
});

export const ActionGrid: React.FC<{
  actions: ActionTile[];
  energy: number;
  money: number;
  busy?: boolean;
  onRun: (id: string) => void;
  /** accessible name of the group */
  label?: string;
}> = ({ actions, energy, money, busy = false, onRun, label }) => (
  <div className="action-grid" role="group" aria-label={label}>
    {actions.map((action) => {
      const cost = action.cost ?? 0;
      const affordable = money >= cost;
      const enough = energy >= action.energy;
      const disabled = busy || action.locked || !affordable || !enough;
      return (
        <button
          key={action.id}
          onClick={() => onRun(action.id)}
          disabled={disabled}
          aria-label={action.name}
          title={action.locked ? action.lockLabel : action.name}
          className="tile tile-action"
        >
          <span className="tile-icon" aria-hidden="true">
            {action.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-100 leading-tight mb-1.5">{action.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <ResChip tone="blue">−{action.energy} ⚡</ResChip>
              {cost > 0 && <ResChip tone="negative">−{formatMoney(cost)} ₽</ResChip>}
              {action.gain}
              {action.locked && action.lockLabel && <ResChip tone="orange">🔒 {action.lockLabel}</ResChip>}
            </span>
            {action.hint && <span className="block text-2xs text-ink-600 mt-1 leading-tight">{action.hint}</span>}
          </span>
        </button>
      );
    })}
  </div>
);
