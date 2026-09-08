import React from 'react';
import { PixelIcon } from './pixel/PixelIcon';
import { IsoIcon } from './iso/IsoIcon';

/**
 * Shared feedback states (docs/design.md §14, §15 п.8):
 * spinners for fetches, skeleton for the room, empty states with hints.
 * All of them speak the same quiet language: hairline borders, no glow, pixel icons.
 */

/** Inline loading indicator: three blinking pixels, no spinning ring. */
export const Spinner: React.FC<{ label?: string; className?: string }> = ({
  label,
  className = '',
}) => (
  <div
    className={`flex items-center justify-center gap-2 py-6 text-ink-500 ${className}`}
    role="status"
  >
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-ink-400 animate-pulse-soft"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
    {label && <span className="text-xs">{label}</span>}
  </div>
);

/** Pulsing placeholder block (skeleton). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse-soft bg-ink-800 ${className}`} aria-hidden="true" />
);

/** Room-shaped skeleton: square + hint (DESIGN.md §14 «скелетон-квадрат»). */
export const RoomSkeleton: React.FC = () => (
  <div className="animate-fade-in" role="status" aria-label="Загрузка комнаты">
    <div className="aspect-square border-2 border-ink-700 bg-ink-800 flex flex-col items-center justify-center gap-3">
      <PixelIcon name="house" size={36} className="text-ink-600" />
      <span className="text-xs text-ink-500">Загрузка комнаты…</span>
    </div>
  </div>
);

/**
 * A screen's emblem: one of the room's own sprites on a dark plate. Every tab
 * is headed by the object it is about — the shop by a crate, skills by the
 * bookshelf — so the menus and the room speak the same language.
 */
export const SpriteBadge: React.FC<{ sprite: string; size?: number }> = ({ sprite, size = 36 }) => (
  <span
    className="shrink-0 inline-flex items-end justify-center bg-ink-900 border-2 border-ink-700 p-0.5"
    style={{ width: size, height: size }}
  >
    <IsoIcon sprite={sprite} size={size - 8} />
  </span>
);

/**
 * Screen heading: pixel icon + title + optional right-hand meta.
 * One shape for every tab, so the tabs feel like one product.
 */
export const ScreenTitle: React.FC<{
  icon: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ icon, children, meta }) => (
  <div className="flex items-center justify-between gap-3 min-h-[24px]">
    <h2 className="flex items-center gap-2 text-base font-semibold text-white tracking-[-0.01em]">
      <PixelIcon name={icon} size={14} className="text-gold-300" />
      {children}
    </h2>
    {meta && <div className="text-xs text-ink-500 shrink-0">{meta}</div>}
  </div>
);

/**
 * Content-owned emoji (skills, achievements, items) rendered in a neutral slot,
 * so the OS emoji palette stops fighting the interface palette.
 */
export const EmojiToken: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center justify-center shrink-0 w-7 h-7 border-2 border-ink-700 bg-ink-900 text-[14px] leading-none ${className}`}
    style={{ filter: 'saturate(0.8)' }}
    aria-hidden="true"
  >
    {children}
  </span>
);

/** Empty state with a hint on what to do next. `bare` = no panel wrapper. */
export const EmptyState: React.FC<{
  icon: string;
  title: string;
  hint?: string;
  bare?: boolean;
  children?: React.ReactNode;
}> = ({ icon, title, hint, bare, children }) => (
  <div className={bare ? 'text-center py-5' : 'game-card text-center py-8'}>
    <PixelIcon name={icon} size={28} className="text-ink-600 mx-auto mb-2.5" />
    <p className="text-sm font-semibold text-ink-200">{title}</p>
    {hint && <p className="text-xs text-ink-500 mt-1 leading-relaxed max-w-[34ch] mx-auto">{hint}</p>}
    {children}
  </div>
);
