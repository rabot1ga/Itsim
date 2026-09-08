import { RefObject, useEffect, useState } from 'react';

/**
 * Crisp when it can be, smooth when it cannot.
 *
 * The sprites are drawn at a 64×32 tile, so on a phone (2–3 device pixels per
 * CSS pixel) a room is displayed at or above 1:1 and `image-rendering:
 * pixelated` keeps every pixel square, exactly as drawn. Squeezed into a
 * narrow column on a 1× screen the same setting would start dropping whole
 * rows of pixels — outlines break up and the art looks cheap. So measure the
 * element and let the browser interpolate only when the picture is being
 * shrunk.
 */
export function useRenderMode(
  ref: RefObject<Element | null>,
  viewportWidth: number
): 'pixelated' | 'auto' {
  const [mode, setMode] = useState<'pixelated' | 'auto'>('pixelated');

  useEffect(() => {
    const el = ref.current;
    if (!el || !viewportWidth) return;

    const update = () => {
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
      const shown = el.getBoundingClientRect().width * dpr;
      setMode(shown >= viewportWidth * 0.99 ? 'pixelated' : 'auto');
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, viewportWidth]);

  return mode;
}
