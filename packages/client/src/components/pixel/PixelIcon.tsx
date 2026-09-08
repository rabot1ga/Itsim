import React, { useMemo } from 'react';
import { PIXEL_ICONS, ICON_SIZE } from './icons';

/** Horizontal runs of pixels — fewer SVG nodes than one rect per pixel. */
function buildRuns(rows: string[]): { x: number; y: number; w: number; solid: boolean }[] {
  const runs: { x: number; y: number; w: number; solid: boolean }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') {
        x += 1;
        continue;
      }
      let w = 1;
      while (row[x + w] === ch) w += 1;
      runs.push({ x, y, w, solid: ch === '#' });
      x += w;
    }
  });
  return runs;
}

const RUN_CACHE = new Map<string, ReturnType<typeof buildRuns>>();

export interface PixelIconProps {
  name: keyof typeof PIXEL_ICONS | string;
  /** Rendered box in px. Multiples of 12 stay perfectly crisp (12, 24, 36…). */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Renders a 12×12 pixel sprite in `currentColor`.
 * `shapeRendering="crispEdges"` keeps the pixels hard at any scale.
 */
export const PixelIcon: React.FC<PixelIconProps> = ({ name, size = 16, className = '', title }) => {
  const rows = PIXEL_ICONS[name as string];
  const runs = useMemo(() => {
    if (!rows) return [];
    const cached = RUN_CACHE.get(name as string);
    if (cached) return cached;
    const built = buildRuns(rows);
    RUN_CACHE.set(name as string, built);
    return built;
  }, [name, rows]);

  if (!rows) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {runs.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fillOpacity={r.solid ? 1 : 0.45}
        />
      ))}
    </svg>
  );
};
