/**
 * Sprite recolouring.
 *
 * A sprite's manifest lists, per role, the exact shading ramp the artist used
 * (dark → light). To recolour, we rebuild that ramp around a new base colour
 * and swap pixel for pixel: shadows stay shadows, highlights stay highlights,
 * the pixel art stays pixel art. Nothing is blurred or blended, so the result
 * is still a hard-edged sprite.
 *
 * The pixel-level function is pure so it can run in Node (asset previews) as
 * well as in the browser.
 */

export type Roles = Record<string, string[]>;
export type Choice = Record<string, string>;

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: clamp(a.r + (b.r - a.r) * t),
  g: clamp(a.g + (b.g - a.g) * t),
  b: clamp(a.b + (b.b - a.b) * t),
});

const lum = (c: RGB) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

/** Ink-tinted shadow and a warm highlight, so recolours match the art style. */
const SHADOW = { r: 0x1e, g: 0x24, b: 0x30 };
const LIGHT = { r: 0xff, g: 0xf6, b: 0xe2 };

/**
 * Build the replacement for one ramp: the source ramp's relative brightness is
 * preserved, only the hue moves.
 */
function rampFor(source: string[], target: string): number[] {
  const base = parseHex(target);
  const cols = source.map(parseHex);
  const ls = cols.map(lum);
  const min = Math.min(...ls);
  const max = Math.max(...ls);
  const span = Math.max(1, max - min);

  return cols.map((_, i) => {
    // 0 = darkest colour in the ramp, 1 = lightest
    const t = (ls[i] - min) / span;
    const out = t < 0.5 ? mix(mix(base, SHADOW, 0.55), base, t * 2) : mix(base, mix(base, LIGHT, 0.5), (t - 0.5) * 2);
    return (out.r << 16) | (out.g << 8) | out.b;
  });
}

/** Packed-RGB → packed-RGB lookup for one set of role choices. */
export function buildColourMap(roles: Roles, choice: Choice): Map<number, number> {
  const map = new Map<number, number>();
  for (const [role, ramp] of Object.entries(roles)) {
    const target = choice[role];
    if (!target || ramp.length === 0) continue;
    const replacement = rampFor(ramp, target);
    ramp.forEach((hex, i) => {
      const c = parseHex(hex);
      map.set((c.r << 16) | (c.g << 8) | c.b, replacement[i]);
    });
  }
  return map;
}

/** Apply a colour map to raw RGBA pixels, in place. */
export function recolourPixels(data: Uint8ClampedArray | Uint8Array, map: Map<number, number>): void {
  if (map.size === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const to = map.get(key);
    if (to === undefined) continue;
    data[i] = (to >> 16) & 255;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
}

// ── browser side ──────────────────────────────────────────────────────────

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function variantKey(file: string, choice: Choice): string {
  const parts = Object.keys(choice)
    .sort()
    .map((k) => `${k}:${choice[k]}`);
  return `${file}|${parts.join(',')}`;
}

/** Cached recolour of a sprite file; resolves to a data URL. */
export function recolourSprite(file: string, roles: Roles, choice: Choice): Promise<string> {
  const key = variantKey(file, choice);
  const done = cache.get(key);
  if (done) return Promise.resolve(done);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const job = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(file);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        recolourPixels(pixels.data, buildColourMap(roles, choice));
        ctx.putImageData(pixels, 0, 0);
        const url = canvas.toDataURL('image/png');
        cache.set(key, url);
        resolve(url);
      } catch {
        resolve(file); // tainted canvas or no 2d context: ship the original
      }
    };
    img.onerror = () => resolve(file);
    img.src = file;
  });

  pending.set(key, job);
  return job;
}
