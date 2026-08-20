/**
 * Utility functions shared across the engine
 */

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Weighted random pick from items with a `weight` property
 */
export function weightedPick<T extends { weight: number }>(
  items: T[],
  rng: () => number
): T | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return null;

  let roll = rng() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}