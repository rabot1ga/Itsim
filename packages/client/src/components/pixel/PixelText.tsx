import React from 'react';

/**
 * Minimal 5×7 pixel typeface — used only for the wordmark and screen titles,
 * so the interface has a piece of type that belongs to the same world as the
 * pixel rooms and avatars. Body copy stays in the system UI font (readable
 * Cyrillic beats retro charm at 13px).
 */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
};

const GLYPH_H = 7;
const LETTER_GAP = 1;

export interface PixelTextProps {
  children: string;
  /** Pixel size in CSS px (1 = native). */
  scale?: number;
  className?: string;
}

/** Renders an uppercase string as crisp pixels. Unknown characters are skipped. */
export const PixelText: React.FC<PixelTextProps> = ({ children, scale = 3, className = '' }) => {
  const letters = children
    .toUpperCase()
    .split('')
    .map((ch) => GLYPHS[ch])
    .filter(Boolean) as string[][];

  if (!letters.length) return null;

  const width =
    letters.reduce((sum, g) => sum + g[0].length, 0) + LETTER_GAP * (letters.length - 1);

  let cursor = 0;
  const rects: React.ReactElement[] = [];
  letters.forEach((glyph, gi) => {
    glyph.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== '#') {
          x += 1;
          continue;
        }
        let w = 1;
        while (row[x + w] === '#') w += 1;
        rects.push(
          <rect key={`${gi}-${y}-${x}`} x={cursor + x} y={y} width={w} height={1} />
        );
        x += w;
      }
    });
    cursor += glyph[0].length + LETTER_GAP;
  });

  return (
    <svg
      width={width * scale}
      height={GLYPH_H * scale}
      viewBox={`0 0 ${width} ${GLYPH_H}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      role="img"
      aria-label={children}
    >
      {rects}
    </svg>
  );
};
