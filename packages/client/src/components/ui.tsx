import { t } from '../lib/i18n';
import React from 'react';
import { IsoIcon } from './iso/IsoIcon';
import { PixelIcon } from './pixel/PixelIcon';
/**
 * Shared primitives of the IT LIFE design system (docs/design-system.md).
 *
 * Хром без эмодзи (B1, 25.10.2026): заголовки, статы и чипы носят
 * pixel-иконки и текст. Эмодзи остаются только за контентом (имена скиллов,
 * предметов, тексты событий) и пиксель-арт-поверхностями.
 */
/** Inline loading indicator: three blinking pixels, no spinning ring. */
export const Spinner: React.FC<{
  label?: string;
  className?: string;
}> = ({ label, className = '' }) => (
  <div className={`flex items-center justify-center gap-2 py-6 text-ink-500 ${className}`} role="status">
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-ink-600 animate-pulse-soft"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
    {label && <span className="text-xs">{label}</span>}
  </div>
);
/** Pulsing placeholder block (skeleton). */
export const Skeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => (
  <div className={`animate-pulse-soft bg-ink-800 rounded-xl ${className}`} aria-hidden="true" />
);
/** Room-shaped skeleton: square + hint. */
export const RoomSkeleton: React.FC = () => (
  <div className="animate-fade-in" role="status" aria-label={t('Загрузка комнаты')}>
    <div className="aspect-square rounded-2xl border border-ink-700 bg-ink-800 flex flex-col items-center justify-center gap-3">
      <PixelIcon name="house" size={28} />
      <span className="text-xs text-ink-500">{t('Загрузка комнаты…')}</span>
    </div>
  </div>
);
/**
 * A screen's emblem: one of the room's own sprites on a dark plate. Used where
 * the pixel world is the subject (shop crates, the bookshelf, housing).
 */
export const SpriteBadge: React.FC<{
  sprite: string;
  size?: number;
}> = ({ sprite, size = 36 }) => (
  <span className="plate shrink-0 p-0.5" style={{ width: size, height: size }}>
    <IsoIcon sprite={sprite} size={size - 8} />
  </span>
);
/**
 * Screen heading: optional pixel icon + title + optional right-hand meta.
 * One shape for every screen, so the app feels like one product.
 */
export const ScreenTitle: React.FC<{
  icon?: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ icon, children, meta }) => (
  <div className="screen-title">
    <h2>
      {icon && <PixelIcon name={icon} size={18} />}
      {children}
    </h2>
    {meta && <div className="screen-title-meta">{meta}</div>}
  </div>
);
/** Section rule inside a screen: «Активные задачи», «Слоты декора». */
export const SectionTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => <h3 className={`section-title ${className}`}>{children}</h3>;
/**
 * Content-owned emoji (skills, achievements, items) rendered in a neutral slot,
 * so the OS emoji palette stops fighting the interface palette.
 */
/**
 * Ref для тела аккордеона (`.accordion-body`): пока свёрнуто — `inert`, поэтому
 * клик и Tab мертвы СРАЗУ, не дожидаясь 0.22s-задержки `visibility` в CSS
 * (см. index.css `.accordion-inner`). Без этого в окне анимации сворачивания
 * строки внутри тела оставались фокусируемыми — e2e accordion.spec это ловил.
 */
export const accordionBodyRef =
  (open: boolean) =>
  (el: HTMLElement | null): void => {
    if (el) el.inert = !open;
  };
export const EmojiToken: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span
    className={`inline-flex items-center justify-center shrink-0 w-8 h-8 rounded-[10px] border border-ink-700 bg-ink-950 text-[15px] leading-none ${className}`}
    aria-hidden="true"
  >
    {children}
  </span>
);
/** Colour token of every resource — fixed across the whole app. */
export const RESOURCE: Record<
  string,
  {
    icon: string;
    color: string;
    label: string;
  }
> = {
  energy: { icon: 'bolt', color: 'var(--res-energy)', label: t('Энергия') },
  mood: { icon: 'flame', color: 'var(--res-mood)', label: t('Настроение') },
  motivation: { icon: 'flame', color: 'var(--res-mood)', label: t('Настроение') },
  health: { icon: 'heart', color: 'var(--res-health)', label: t('Здоровье') },
  xp: { icon: 'star', color: 'var(--res-xp)', label: t('Опыт') },
  money: { icon: 'coin', color: 'var(--res-money)', label: t('Деньги') },
  coin: { icon: 'coin', color: 'var(--res-coin)', label: t('Монеты') },
  reputation: { icon: 'trophy', color: 'var(--res-rep)', label: t('Репутация') },
  productivity: { icon: 'chart', color: 'var(--res-productivity)', label: t('Продуктивность') },
  luck: { icon: 'dice', color: 'var(--res-luck)', label: t('Удача') },
};
/**
 * Resource meter — label + pixel icon on the left, `value / max` on the right,
 * a pill track underneath filled in the resource's own colour.
 *
 * `compact` collapses it to a single line (icon · track · number) for tight
 * places such as the home HUD next to the portrait; the label survives as the
 * accessible name and the tooltip.
 */
export const StatBar: React.FC<{
  resource?: keyof typeof RESOURCE | string;
  icon?: string;
  label?: string;
  color?: string;
  value: number;
  max: number;
  compact?: boolean;
  className?: string;
}> = ({ resource, icon, label, color, value, max, compact = false, className = '' }) => {
  const token = resource ? RESOURCE[resource] : undefined;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const pct = (safeValue / safeMax) * 100;
  const name = label ?? token?.label ?? '';
  const glyph = icon ?? token?.icon;
  const track = (
    <span
      className="stat-bar-track"
      role="progressbar"
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(safeValue)}
    >
      <span className="stat-bar-fill" style={{ width: `${pct}%`, background: color ?? token?.color }} />
    </span>
  );
  if (compact) {
    return (
      <div
        className={`stat-bar is-compact ${pct < 25 ? 'is-low' : ''} ${className}`}
        title={`${name}: ${Math.round(safeValue)}/${safeMax}`}
      >
        {glyph ? <PixelIcon name={glyph} size={12} /> : <span aria-hidden="true">{'\u00B7'}</span>}
        {track}
        <span className="stat-bar-value num">{Math.round(safeValue)}</span>
      </div>
    );
  }
  return (
    <div
      className={`stat-bar ${pct < 25 ? 'is-low' : ''} ${className}`}
      title={`${name}: ${Math.round(safeValue)}/${safeMax}`}
    >
      <span className="stat-bar-name">
        {glyph ? <PixelIcon name={glyph} size={12} /> : null}
        {name}
      </span>
      <span className="stat-bar-value num">
        {Math.round(safeValue)}
        <small> / {safeMax}</small>
      </span>
      {track}
    </div>
  );
};
/** `+15 XP`, `−500 ₽`, `+2 энергии` — the smallest unit of feedback in the game. */
export const ResChip: React.FC<{
  tone?: 'positive' | 'negative' | 'gold' | 'blue' | 'orange' | 'purple' | 'neutral';
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`res-chip ${tone === 'neutral' ? '' : tone} num ${className}`}>{children}</span>
);
/** Switch used in Settings. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="toggle"
    onClick={() => onChange(!checked)}
  />
);
/** Empty state with a hint on what to do next. `bare` = no card wrapper. */
export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  hint?: string;
  bare?: boolean;
  children?: React.ReactNode;
}> = ({ icon = 'box', title, hint, bare, children }) => (
  <div className={bare ? 'text-center py-5' : 'card text-center py-8'}>
    <div className="mb-2.5 flex justify-center">
      <PixelIcon name={icon} size={28} />
    </div>
    <p className="text-base font-semibold text-ink-200">{title}</p>
    {hint && <p className="text-xs text-ink-500 mt-1 leading-relaxed max-w-[34ch] mx-auto">{hint}</p>}
    {children}
  </div>
);
