import { t } from '../lib/i18n';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { SectionTitle } from './ui';
import { PixelIcon } from './pixel/PixelIcon';
/**
 * Contextual doors to the screens of the «мир» (A2, 25.10.2026).
 *
 * A section is not «somewhere in the menu» — it belongs next to the thing it
 * continues: офис — к работе, майнинг — к технике, питомец — к отдыху.
 * Хром без эмодзи: вместо эмодзи — pixel-иконки.
 */
export interface NavLink {
  view: string;
  icon: string;
  label: string;
  hint: string;
}
export const NavLinks: React.FC<{
  title?: string;
  links: NavLink[];
}> = ({ title = t('Куда дальше'), links }) => {
  const setView = useGameStore((s) => s.setView);
  if (links.length === 0) return null;
  return (
    <section aria-label={title}>
      <SectionTitle className="mb-2">{title}</SectionTitle>
      <div className="grid gap-2 grid-cols-[minmax(0,1fr)]">
        {links.map((link) => (
          <button
            key={link.view}
            onClick={() => setView(link.view)}
            className="tile flex items-center gap-3"
            aria-label={link.label}
          >
            <span className="tile-icon" aria-hidden="true">
              <PixelIcon name={link.icon} size={18} />
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
