import React from 'react';
import { useGameStore } from '../store/gameStore';
import { SectionTitle } from './ui';

/**
 * Contextual doors to the screens that used to hide behind «⋮».
 *
 * A section is not «somewhere in the menu» — it belongs next to the thing it
 * continues: офис — к работе, майнинг — к технике, питомец — к отдыху.
 */
export interface NavLink {
  view: string;
  emoji: string;
  label: string;
  hint: string;
}

export const NavLinks: React.FC<{ title?: string; links: NavLink[] }> = ({ title = 'Куда дальше', links }) => {
  const setView = useGameStore((s) => s.setView);
  if (links.length === 0) return null;
  return (
    <section aria-label={title}>
      <SectionTitle className="mb-2">{title}</SectionTitle>
      <div className="grid gap-2">
        {links.map((link) => (
          <button
            key={link.view}
            onClick={() => setView(link.view)}
            className="tile flex items-center gap-3"
            aria-label={link.label}
          >
            <span className="tile-icon" aria-hidden="true">
              {link.emoji}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ink-100 leading-tight">{link.label}</span>
              <span className="block text-xs text-ink-500 leading-tight mt-0.5">{link.hint}</span>
            </span>
            <span className="text-ink-600 shrink-0" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
