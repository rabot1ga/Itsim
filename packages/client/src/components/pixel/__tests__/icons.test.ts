import { describe, it, expect } from 'vitest';
import { PIXEL_ICONS, ICON_SIZE } from '../icons';

/**
 * The icon set is hand-drawn ASCII art, so the only thing standing between a typo
 * and a broken sprite is this test: every icon must be a square 12×12 grid made of
 * known characters, and no icon may be empty.
 */
describe('pixel icons', () => {
  const names = Object.keys(PIXEL_ICONS);

  it('ships a non-trivial set', () => {
    expect(names.length).toBeGreaterThanOrEqual(40);
  });

  it.each(names)('%s is a valid %ix%i grid', (name) => {
    const rows = PIXEL_ICONS[name];
    expect(rows).toHaveLength(ICON_SIZE);
    for (const row of rows) {
      expect(row).toHaveLength(ICON_SIZE);
      expect(row).toMatch(/^[.#+]+$/);
    }
    const filled = rows.join('').replace(/\./g, '').length;
    expect(filled).toBeGreaterThan(8);
  });

  it('has icons for every bottom-tab and resource', () => {
    for (const required of [
      'calendar', 'book', 'briefcase', 'house', 'bag', 'trophy', 'chart',
      'bolt', 'heart', 'flame', 'star', 'coin',
    ]) {
      expect(PIXEL_ICONS[required], required).toBeDefined();
    }
  });
});
