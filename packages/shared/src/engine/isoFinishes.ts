/**
 * Room finishes — the paint and the flooring.
 *
 * These are the two levers that make one flat look nothing like another before
 * a single piece of furniture arrives. Twelve paints × ten floors is 120
 * shells; multiplied by room size, the furniture the player owns and the seeded
 * arrangement, no two players share a room. Every finish is also a thing the
 * player can pick in the editor, so the ids are stable and named in Russian.
 */

export interface WallPaint {
  id: string;
  name: string;
  left: string;
  right: string;
  trim: string;
  skirting: string;
  /** housing levels this finish shows up on by default */
  tiers: number[];
}

export interface FloorStyle {
  id: string;
  name: string;
  a: string;
  b: string;
  line: string;
  pattern: 'planks' | 'tiles' | 'carpet' | 'concrete';
  tiers: number[];
}

export const WALL_PAINTS: WallPaint[] = [
  { id: 'concrete', name: 'Бетон', left: '#2b3140', right: '#343b4c', trim: '#454d61', skirting: '#232936', tiers: [0] },
  { id: 'plaster', name: 'Штукатурка', left: '#333a49', right: '#3e4657', trim: '#525c72', skirting: '#262c39', tiers: [0, 1] },
  { id: 'dorm_green', name: 'Общажный зелёный', left: '#2c3a37', right: '#364643', trim: '#4a5f59', skirting: '#212b29', tiers: [0, 1] },
  { id: 'warm_grey', name: 'Тёплый серый', left: '#2f3646', right: '#3a4254', trim: '#505b72', skirting: '#262c39', tiers: [1, 2] },
  { id: 'sky', name: 'Небесный', left: '#2f3f52', right: '#3a4c63', trim: '#5b7692', skirting: '#25313f', tiers: [1, 2, 3] },
  { id: 'sage', name: 'Шалфей', left: '#334036', right: '#3e4d42', trim: '#5c7361', skirting: '#28322b', tiers: [1, 2, 3] },
  { id: 'clay', name: 'Терракота', left: '#3f3130', right: '#4c3b39', trim: '#71544f', skirting: '#2f2524', tiers: [2, 3] },
  { id: 'indigo', name: 'Индиго', left: '#2c3350', right: '#363e61', trim: '#4f5a8a', skirting: '#232842', tiers: [2, 3, 4] },
  { id: 'evening', name: 'Вечерний синий', left: '#2c3547', right: '#374258', trim: '#4e5c76', skirting: '#232b3a', tiers: [3, 4] },
  { id: 'ink', name: 'Чернильный', left: '#252c3b', right: '#2f3849', trim: '#5b6a86', skirting: '#1d2431', tiers: [3, 4] },
  { id: 'wine', name: 'Винный', left: '#3a2831', right: '#46313c', trim: '#6d4a58', skirting: '#2b1e25', tiers: [3, 4] },
  { id: 'gallery', name: 'Галерейный белый', left: '#4a5060', right: '#565d70', trim: '#79839a', skirting: '#343a47', tiers: [4] },
];

export const FLOOR_STYLES: FloorStyle[] = [
  { id: 'lino', name: 'Линолеум', a: '#6b5a46', b: '#75634d', line: '#584a3a', pattern: 'tiles', tiers: [0] },
  { id: 'screed', name: 'Бетонная стяжка', a: '#4f5561', b: '#555c69', line: '#414652', pattern: 'concrete', tiers: [0, 1] },
  { id: 'pine', name: 'Сосна', a: '#8a6238', b: '#95693c', line: '#6d4d2c', pattern: 'planks', tiers: [0, 1, 2] },
  { id: 'oak', name: 'Дуб', a: '#a2794f', b: '#ae8357', line: '#7d5b39', pattern: 'planks', tiers: [1, 2, 3] },
  { id: 'walnut', name: 'Орех', a: '#7a5535', b: '#845c3a', line: '#5e4128', pattern: 'planks', tiers: [2, 3, 4] },
  { id: 'ash', name: 'Беленый ясень', a: '#9d8b74', b: '#a9977f', line: '#7a6a57', pattern: 'planks', tiers: [3, 4] },
  { id: 'checker', name: 'Шахматная плитка', a: '#3c4351', b: '#8d94a3', line: '#2c323d', pattern: 'tiles', tiers: [1, 2, 3, 4] },
  { id: 'terracotta', name: 'Терракотовая плитка', a: '#8d5a44', b: '#99634b', line: '#6b4433', pattern: 'tiles', tiers: [2, 3, 4] },
  { id: 'carpet_moss', name: 'Ковролин моховой', a: '#4a5f4c', b: '#506753', line: '#3d4f3f', pattern: 'carpet', tiers: [2, 3, 4] },
  { id: 'carpet_wine', name: 'Ковролин бордо', a: '#5a3a42', b: '#634048', line: '#4a2f36', pattern: 'carpet', tiers: [3, 4] },
];

export function wallPaint(id: string | undefined): WallPaint | null {
  return WALL_PAINTS.find((p) => p.id === id) ?? null;
}

export function floorStyle(id: string | undefined): FloorStyle | null {
  return FLOOR_STYLES.find((f) => f.id === id) ?? null;
}

/** The finishes a given housing level is allowed to show. */
export function paintsFor(tier: number): WallPaint[] {
  const list = WALL_PAINTS.filter((p) => p.tiers.includes(tier));
  return list.length ? list : WALL_PAINTS;
}

export function floorsFor(tier: number): FloorStyle[] {
  const list = FLOOR_STYLES.filter((f) => f.tiers.includes(tier));
  return list.length ? list : FLOOR_STYLES;
}

/** Is this finish available at that housing level? */
export function paintAllowed(id: string, tier: number): boolean {
  const paint = wallPaint(id);
  return !!paint && paint.tiers.includes(Math.max(0, Math.min(4, tier)));
}

export function floorAllowed(id: string, tier: number): boolean {
  const floor = floorStyle(id);
  return !!floor && floor.tiers.includes(Math.max(0, Math.min(4, tier)));
}
