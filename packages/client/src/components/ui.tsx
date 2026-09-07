import React from 'react';

/**
 * Shared feedback states (docs/design.md §14, §15 п.8):
 * spinners for fetches, skeleton for the room, empty states with hints.
 */

/** Inline loading spinner. */
export const Spinner: React.FC<{ label?: string; className?: string }> = ({
  label,
  className = '',
}) => (
  <div className={`flex items-center justify-center gap-2 py-6 text-slate-500 ${className}`} role="status">
    <svg
      className="w-5 h-5 animate-spin text-primary-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
    {label && <span className="text-xs">{label}</span>}
  </div>
);

/** Pulsing placeholder block (skeleton). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-800 rounded-xl ${className}`} aria-hidden="true" />
);

/** Room-shaped skeleton: square + shimmer bars (DESIGN.md §14 «скелетон-квадрат»). */
export const RoomSkeleton: React.FC = () => (
  <div className="animate-fade-in" role="status" aria-label="Загрузка комнаты">
    <div className="aspect-square rounded-2xl bg-slate-800/80 animate-pulse flex flex-col items-center justify-center gap-3">
      <span className="text-4xl opacity-40">🏠</span>
      <span className="text-xs text-slate-500">Загрузка комнаты…</span>
    </div>
  </div>
);

/** Empty state with a hint on what to do next. `bare` = no card wrapper (for use inside cards). */
export const EmptyState: React.FC<{
  icon: string;
  title: string;
  hint?: string;
  bare?: boolean;
  children?: React.ReactNode;
}> = ({ icon, title, hint, bare, children }) => (
  <div className={bare ? 'text-center py-4' : 'game-card text-center py-8'}>
    <div className="text-3xl mb-2">{icon}</div>
    <p className="text-slate-300 text-sm font-medium">{title}</p>
    {hint && <p className="text-slate-500 text-xs mt-1 leading-relaxed">{hint}</p>}
    {children}
  </div>
);
