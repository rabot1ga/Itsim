import React, { useRef, useState } from 'react';
import { LayerManifest, GeneticTraits, GeneticsConfig } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function renderCanvas(
  canvas: HTMLCanvasElement,
  roomManifest: LayerManifest,
  avatarManifest: LayerManifest,
  traits: GeneticTraits,
  geneticsConfig: GeneticsConfig,
  composition: Composition,
  player: any
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const roomLayers = buildLayerStack(roomManifest, composition, traits, geneticsConfig);
  const avatarLayers = buildLayerStack(
    avatarManifest,
    {
      body: 'body_base',
      eyes: traits.eyeShape,
      hair: traits.hairStyle,
      beard: traits.beard,
      top: traits.top,
      accessory: composition.avatarAccessory ?? traits.accessory,
    },
    traits,
    geneticsConfig
  );

  // 1. Room layers
  for (const layer of roomLayers) {
    const img = await loadImage(layer.file);
    ctx.filter = layer.filter ?? 'none';
    ctx.drawImage(img, 0, 0, W, H);
  }
  ctx.filter = 'none';

  // 2. Avatar standing in the room
  const avatarX = Math.round(W * 0.08);
  const avatarY = Math.round(H * 0.5);
  const avatarSize = Math.round(W * 0.34);
  for (const layer of avatarLayers) {
    const img = await loadImage(layer.file);
    ctx.filter = layer.filter ?? 'none';
    ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.filter = 'none';

  // 3. Stats card
  ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
  const cardW = Math.round(W * 0.62);
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
  ctx.fillText(`генетика: ${traits.seed.slice(0, 12)}…`, W / 2, cardY + 172);

  ctx.fillStyle = '#64748b';
  ctx.font = '30px sans-serif';
  ctx.fillText('IT Life Simulator · t.me/itsim_bot', W / 2, cardY + 240);
}

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн ₽`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс ₽`;
  return `${amount} ₽`;
}

export const ShareCard: React.FC<{
  roomManifest: LayerManifest;
  avatarManifest: LayerManifest;
  traits: GeneticTraits;
  geneticsConfig: GeneticsConfig;
  composition: Composition;
  player: any;
}> = ({ roomManifest, avatarManifest, traits, geneticsConfig, composition, player }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const canvas = canvasRef.current!;
      await renderCanvas(canvas, roomManifest, avatarManifest, traits, geneticsConfig, composition, player);
      setDataUrl(canvas.toDataURL('image/png'));
    } catch (err: any) {
      setError(err.message || 'Не удалось сгенерировать карточку');
    } finally {
      setBusy(false);
    }
  };

  const share = () => {
    if (!dataUrl) return;
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

  return (
    <div className="game-card">
      <h3 className="text-sm font-medium text-slate-400 mb-2">📸 Карточка для шеринга</h3>
      <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />
      {dataUrl && <img src={dataUrl} alt="Шар-карточка" className="rounded-lg border border-slate-700 mb-2" />}
      {error && <p className="text-xs text-red-300 mb-2">⚠️ {error}</p>}
      <div className="flex gap-2">
        <button
          onClick={generate}
          disabled={busy}
          className="flex-1 px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg"
        >
          {busy ? 'Рендерим…' : 'Сгенерировать'}
        </button>
        <button
          onClick={share}
          disabled={!dataUrl}
          className="flex-1 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg"
        >
          Поделиться в Telegram
        </button>
      </div>
    </div>
  );
};
