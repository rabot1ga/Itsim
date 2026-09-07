import React, { useRef, useState } from 'react';
import { GeneticTraits } from '@itsim/shared';
import { haptic } from '../../lib/telegram';
import { drawIsoRoom } from '../iso/canvas';

/**
 * Share card — DESIGN.md section 5.
 * Renders the player's unique room + avatar + stats into an offscreen
 * canvas, exports a PNG and shares it via the Telegram WebApp API.
 */

const W = 1080;
const H = 1080;

const GRADE_LABELS: Record<string, string> = {
  unemployed: 'Безработный',
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

/** Share frame themes (docs/design.md §15.10) — picked in UI, drawn on canvas. */
export type ShareFrame = 'minimal' | 'neon' | 'gold' | 'meme';

const FRAMES: { id: ShareFrame; name: string; need?: { ach: string; label: string } }[] = [
  { id: 'minimal', name: 'Минимализм' },
  { id: 'neon', name: 'Неон' },
  { id: 'gold', name: 'Золото', need: { ach: 'first_million', label: 'Первый миллион' } },
  { id: 'meme', name: 'Мем', need: { ach: 'events_50', label: '50 событий' } },
];

function loadFrame(): ShareFrame {
  try {
    const saved = localStorage.getItem('itsim_share_frame');
    if (saved && FRAMES.some((f) => f.id === saved)) return saved as ShareFrame;
  } catch {
    /* private mode */
  }
  return 'minimal';
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: ShareFrame, player: any): void {
  if (frame === 'neon') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(1, '#e879f9');
    ctx.strokeStyle = g;
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, W - 18, H - 18);
  } else if (frame === 'gold') {
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, W - 72, H - 72);
  } else if (frame === 'meme') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, 150);
    ctx.fillRect(0, H - 150, W, 150);
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.font = 'bold 62px Impact, sans-serif';
    ctx.fillText(`КОГДА СТАЛ ${(GRADE_LABELS[player.grade] ?? player.grade).toUpperCase()}`, W / 2, 102);
    ctx.fillText(`ЗА ${player.currentDay} ДНЕЙ`, W / 2, H - 52);
  } else {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
  }
}

async function renderCanvas(
  canvas: HTMLCanvasElement,
  traits: GeneticTraits,
  player: any,
  frame: ShareFrame
): Promise<void> {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  // 1. Backdrop — the app's ink, so the card reads as the same product
  ctx.fillStyle = '#11151c';
  ctx.fillRect(0, 0, W, H);

  // 2. The player's actual room, drawn by the same engine as the app
  await drawIsoRoom(ctx, player, { x: 40, y: 40, w: W - 80, h: Math.round(H * 0.62) });

  // 3. Stats card
  ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
  const cardW = Math.round(W * 0.72);
  const cardH = 330;
  const cardX = Math.round((W - cardW) / 2);
  const cardY = H - cardH - 40;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
  } else {
    ctx.rect(cardX, cardY, cardW, cardH);
  }
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(`День ${player.currentDay} · ${GRADE_LABELS[player.grade] ?? player.grade}`, W / 2, cardY + 66);

  ctx.font = '26px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `💰 ${formatMoney(player.money)}   ⭐ ${player.reputation?.toFixed(0) ?? 0}   🏆 ${player.ratingScore ?? 0} pts`,
    W / 2,
    cardY + 122
  );

  ctx.fillStyle = '#38bdf8';
  ctx.font = '22px monospace';
  ctx.fillText(`генетика: ${(traits?.seed ?? '').slice(0, 12)}…`, W / 2, cardY + 172);

  ctx.fillStyle = '#64748b';
  ctx.font = '30px sans-serif';
  ctx.fillText('IT Life Simulator · t.me/itsim_bot', W / 2, cardY + 240);

  // 4. Frame theme
  drawFrame(ctx, frame, player);
}

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}

export const ShareCard: React.FC<{
  traits: GeneticTraits;
  player: any;
}> = ({ traits, player }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<ShareFrame>(loadFrame);

  const generate = async (useFrame: ShareFrame = frame) => {
    setBusy(true);
    setError(null);
    haptic('tap');
    try {
      const canvas = canvasRef.current!;
      await renderCanvas(canvas, traits, player, useFrame);
      setDataUrl(canvas.toDataURL('image/png'));
      haptic('success');
    } catch (err: any) {
      haptic('error');
      setError(err.message || 'Не удалось сгенерировать карточку');
    } finally {
      setBusy(false);
    }
  };

  const pickFrame = (f: (typeof FRAMES)[number]) => {
    const locked = f.need && !(player?.achievements ?? []).includes(f.need.ach);
    if (locked) {
      haptic('error');
      setError(`🔒 Рамка «${f.name}» — ачивка «${f.need!.label}»`);
      return;
    }
    haptic('selection');
    setFrame(f.id);
    try {
      localStorage.setItem('itsim_share_frame', f.id);
    } catch {
      /* private mode */
    }
    void generate(f.id);
  };

  const share = () => {
    if (!dataUrl) return;
    haptic('medium');
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.switchInlineQuery) {
      // Opens a share picker in Telegram (chat/user selection)
      tg.switchInlineQuery('Смотри, моя IT-берлога! 🏠', ['users', 'groups']);
    } else {
      // Fallback: download
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'itsim-room.png';
      a.click();
    }
  };

  const achs: string[] = player?.achievements ?? [];

  return (
    <div className="game-card">
      <h3 className="section-title mb-2">Карточка для шеринга</h3>
      <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />
      {dataUrl && <img src={dataUrl} alt="Шар-карточка" className="rounded-lg border border-ink-700 mb-2" />}
      {error && <p className="text-xs text-clay-300 mb-2">⚠️ {error}</p>}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {FRAMES.map((f) => {
          const locked = f.need && !achs.includes(f.need.ach);
          return (
            <button
              key={f.id}
              onClick={() => pickFrame(f)}
              disabled={busy}
              title={locked ? `🔒 ${f.need!.label}` : f.name}
              className={`px-1 py-2 text-[11px] leading-tight rounded-lg border transition-all ${
                frame === f.id
                  ? 'bg-sky-600/30 border-sky-400 text-ink-100'
                  : 'bg-ink-800/60 border-ink-700 text-ink-300'
              } ${locked ? 'opacity-50' : ''}`}
            >
              {locked ? `🔒 ${f.name}` : f.name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => generate()}
          disabled={busy}
          className="flex-1 px-3 py-2.5 text-sm bg-sky-600 hover:bg-sky-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl touch-target font-medium transition-all"
        >
          {busy ? 'Рендерим…' : 'Сгенерировать'}
        </button>
        <button
          onClick={share}
          disabled={!dataUrl}
          className="flex-1 px-3 py-2.5 text-sm bg-moss-600 hover:bg-moss-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl touch-target font-medium transition-all"
        >
          Поделиться в Telegram
        </button>
      </div>
    </div>
  );
};
