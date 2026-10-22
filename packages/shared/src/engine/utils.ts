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
export function weightedPick<T extends { weight: number }>(items: T[], rng: () => number): T | null {
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
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
/**
 * xmur3: hash a string into a 32-bit seed (deterministic across engines).
 * Жил в genetics.ts; после снятия идентичности (22.10.2026) остался нужен
 * детерминированным дневным роллам (`_day.ts`) — переехал в utils.
 */
function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG — deterministic integer-math RNG */
export function seededRng(seed: string): () => number {
  let a = hashStringToSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic weighted pick with a per-slot salt
 */
export function seededWeightedPick<T extends { weight: number }>(items: T[], seed: string, salt: string): T {
  const rng = seededRng(`${seed}:${salt}`);
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0];

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
