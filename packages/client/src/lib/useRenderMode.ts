import { RefObject, useEffect, useState } from 'react';

/**
 * Crisp when it can be, smooth when it cannot.
 *
 * `SPEC.md` §6 allows exactly one kind of upscale — nearest neighbour. That is
 * a statement about scale, not about the surface: an art source shown at or
 * above its own size must stay square-pixel, while the same source squeezed
 * smaller has to be interpolated or it starts dropping whole rows of pixels and
 * outlines break up. So measure the element against `sourceWidth` (the art's
 * intrinsic width in CSS pixels: a 64×32 iso tile canvas width for the office,
 * `manifest.resolution.width` for the flat stacks) and pick accordingly.
 */
export function useRenderMode(
  ref: RefObject<Element | null>,
  sourceWidth: number
): 'pixelated' | 'auto' {
  const [mode, setMode] = useState<'pixelated' | 'auto'>('pixelated');

  useEffect(() => {
    const el = ref.current;
    if (!el || !sourceWidth) return;

    const update = () => {
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
      const shown = el.getBoundingClientRect().width * dpr;
      // 0.99 — допуск на округление dpr и рамку карточки: «почти 1:1» уже
      // считается увеличением, мыло на границе заметнее, чем лишний nearest.
      setMode(shown >= sourceWidth * 0.99 ? 'pixelated' : 'auto');
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, sourceWidth]);

  return mode;
}
