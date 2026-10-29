import { t } from '../lib/i18n';
import React, { useRef, useState } from 'react';
import { PixelIcon } from './pixel/PixelIcon';
import { haptic } from '../lib/telegram';
import { playSfx } from '../lib/sfx';

/**
 * Карточка стека (DESIGN-DECK §2): одно решение за раз.
 *
 * Жест — свайп влево/вправо; под карточкой те же действия кнопками
 * (доступность + e2e, детерминированные селекторы). Класс `deck-card`
 * намеренно НЕ `story-card` — тот контракт (packages/e2e) закреплён за
 * сюжетными карточками событий.
 */
export interface DeckAction {
  label: string;
  run: () => void | Promise<void>;
  tone?: 'primary' | 'ghost';
}

/** Вариант-модификатор: новый выбор, открытый перком/предметом (§7.3) */
export interface DeckVariant extends DeckAction {
  hint?: string;
  /** бейдж источника: «Наставник», «Кофемашина» */
  badge?: string;
}

export const DeckCard: React.FC<{
  id: string;
  icon: string;
  title: string;
  meta?: React.ReactNode;
  flavor?: string;
  tone?: 'day' | 'action' | 'hook' | 'end';
  left?: DeckAction;
  right?: DeckAction;
  busy?: boolean;
  variants?: DeckVariant[];
  children?: React.ReactNode;
}> = ({ id, icon, title, meta, flavor, tone = 'action', left, right, busy, variants, children }) => {
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState<0 | 1 | -1>(0);
  const start = useRef<number | null>(null);
  const width = typeof window !== 'undefined' ? window.innerWidth : 360;
  const threshold = Math.max(72, width * 0.22);

  const resolve = async (dir: -1 | 1) => {
    const action = dir === 1 ? right : left;
    if (!action || busy) return;
    haptic('tap');
    playSfx('tap'); // звук жеста (преф «Звук», выключен по умолчанию)
    setFlying(dir);
    await new Promise((r) => setTimeout(r, 160)); // улёт карточки
    setFlying(0);
    setDx(0);
    await action.run();
  };

  return (
    // data-deck-id живёт на обёртке: кнопки-дублёры жеста — часть карточки
    <div className="deck-slot" data-deck-id={id}>
      <section
        className={`deck-card deck-card-${tone} ${flying ? `deck-fly-${flying > 0 ? 'right' : 'left'}` : ''}`}
        data-deck-body=""
        style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : undefined}
        onPointerDown={(e) => {
          if (busy) return;
          start.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (start.current === null) return;
          setDx(e.clientX - start.current);
        }}
        onPointerUp={() => {
          if (start.current === null) return;
          const delta = dx;
          start.current = null;
          setDx(0);
          if (delta > threshold) void resolve(1);
          else if (delta < -threshold) void resolve(-1);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <header className="deck-card-head">
          <PixelIcon name={icon} size={18} />
          <h3 className="deck-card-title">{title}</h3>
        </header>
        {meta && <div className="deck-card-meta">{meta}</div>}
        {children && <div className="deck-card-body">{children}</div>}
        {flavor && <p className="deck-card-flavor">{flavor}</p>}
        {variants && variants.length > 0 && (
          <ul className="deck-variants">
            {variants.map((v) => (
              <li key={v.label}>
                <button className="deck-variant" data-deck-variant="1" disabled={busy} onClick={() => void v.run()}>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="deck-variant-label">{v.label}</span>
                    {v.hint && <span className="deck-variant-hint">{v.hint}</span>}
                  </span>
                  {v.badge && <span className="deck-variant-badge">{v.badge}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(left || right) && (
        <div className="deck-actions">
          {left ? (
            <button
              className="btn btn-ghost deck-btn"
              data-deck-action="left"
              disabled={busy}
              onClick={() => void resolve(-1)}
            >
              {left.label}
            </button>
          ) : (
            <span className="deck-btn-spacer" />
          )}
          {right && (
            <button
              className={`btn ${right.tone === 'ghost' ? 'btn-ghost' : 'btn-primary'} deck-btn`}
              data-deck-action="right"
              disabled={busy}
              onClick={() => void resolve(1)}
            >
              {right.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** Строка-мета: цена действия и награда видны ДО решения */
export const DeckCost: React.FC<{ energy?: number; cost?: number; reward?: string }> = ({ energy, cost, reward }) => (
  <span className="deck-cost num">
    {energy ? `−${energy} ${t('энергия')}` : ''}
    {energy && cost ? ' · ' : ''}
    {cost ? `−${cost} ₽` : ''}
    {reward ? <span className="deck-reward"> → {reward}</span> : null}
  </span>
);
