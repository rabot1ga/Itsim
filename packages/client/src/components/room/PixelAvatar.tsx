import React, { useEffect, useRef } from 'react';
import { renderPixelArt, scaleNearest } from '@itsim/shared';
import { PixelAvatarData } from './pixelAvatar';

/**
 * Pixel avatar renderer — draws a composition into a canvas with the shared
 * engine (docs/pixel-art.md). No sprites and no CSS filters: it is the same code
 * path as `pixelgen render`, so what QA reviewed in the gallery is exactly what
 * the player gets, and the image stays crisp at any display size.
 *
 * The bitmap is rendered at `scale` × 32 and shown at 100% of the parent box
 * with `image-rendering: pixelated` — the only allowed upscale (nearest, ТЗ §8).
 */
export const PixelAvatar: React.FC<{
  data: PixelAvatarData;
  /** pixel size of the backing bitmap (browser zoom/DPR crispness) */
  scale?: number;
  className?: string;
  background?: string;
  title?: string;
}> = ({ data, scale = 8, className, background, title }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const buffer = renderPixelArt(data.file, data.combo, { scheme: data.scheme });
    const scaled = scaleNearest(buffer, Math.max(1, Math.floor(scale)));
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, scaled.width, scaled.height);
    // putImageData wants a Uint8ClampedArray whose TS type demands ReadableWritable
    ctx.putImageData(new ImageData(new Uint8ClampedArray(scaled.data) as ImageDataArray, scaled.width, scaled.height), 0, 0);
  }, [data, scale]);

  return (
    <canvas
      ref={ref}
      title={title}
      aria-label="Пиксельный аватар игрока"
      className={`aspect-square ${className ?? ''}`}
      style={{ imageRendering: 'pixelated', width: '100%', height: 'auto', background }}
    />
  );
};
