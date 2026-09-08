import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { haptic, openInvoice } from '../lib/telegram';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * Telegram Stars section of the shop (`content/monetization.json`).
 *
 * Rules of the catalogue, enforced by the content schema and repeated here for
 * the player: cosmetics, banked days and «спасибо» — never progress.
 *
 * Flow: POST /api/payments/stars → invoice link → `openInvoice` in Telegram.
 * Without a bot token (local dev) the server answers with a mock link and a
 * `devComplete` endpoint that simulates the purchase.
 */

interface StarsProduct {
  id: string;
  title: string;
  description: string;
  stars: number;
  repeatable: boolean;
  dailyLimit?: number;
  owned: boolean;
  blocked: string | null;
}

export const StarsShop: React.FC = () => {
  const refreshState = useGameStore((s) => s.refreshState);
  const [products, setProducts] = useState<StarsProduct[]>([]);
  const [policy, setPolicy] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { ok, data } = await apiRequest('/payments/products');
    if (ok) {
      setProducts(data.products ?? []);
      setPolicy(data.policy ?? null);
      setMock(Boolean(data.mock));
    }
    setLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  const buy = async (product: StarsProduct) => {
    setBusy(product.id);
    setNote(null);
    haptic('tap');

    const { ok, data } = await apiRequest('/payments/stars', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id }),
    });

    if (!ok) {
      setBusy(null);
      haptic('error');
      setNote(data?.error ?? 'Не удалось создать счёт');
      return;
    }

    if (data.mock && data.devComplete) {
      // Local development: no Bot API, so complete the purchase directly.
      const res = await apiRequest('/payments/dev-complete', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id }),
      });
      setBusy(null);
      if (res.ok) {
        haptic('success');
        setNote(`(dev) ${res.data.applied?.join(', ') || 'куплено'}`);
        await Promise.all([load(), refreshState()]);
      } else {
        haptic('error');
        setNote(res.data?.error ?? 'Покупка не прошла');
      }
      return;
    }

    openInvoice(data.invoiceLink, async (status) => {
      setBusy(null);
      if (status === 'paid') {
        haptic('success');
        setNote('✅ Оплачено — награда уже в игре');
        // The webhook grants asynchronously; give it a beat, then re-read.
        setTimeout(() => {
          load();
          refreshState();
        }, 1500);
      } else if (status === 'failed') {
        haptic('error');
        setNote('Оплата не прошла');
      }
    });
  };

  if (!loaded || products.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow !text-ink-300">
          <PixelIcon name="star" size={11} className="text-gold-300" />
          За Telegram Stars
        </h3>
        {mock && <span className="chip !text-ink-500 ml-2">dev</span>}
      </div>
      {policy && <p className="text-xs text-ink-500 leading-relaxed">{policy}</p>}
      {note && (
        <div className="panel !py-2 !px-3 text-xs text-ink-200">{note}</div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {products.map((product) => {
          const disabled = Boolean(product.blocked) || busy === product.id;
          return (
            <div
              key={product.id}
              className={`panel !p-3 flex items-center gap-3 ${
                product.owned ? 'panel-note panel-note-moss' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-100">{product.title}</div>
                <div className="text-xs text-ink-500 leading-relaxed">{product.description}</div>
                {product.blocked && (
                  <div className="text-2xs text-ochre-400 mt-0.5">{product.blocked}</div>
                )}
              </div>
              <button
                onClick={() => buy(product)}
                disabled={disabled}
                className={`btn !min-h-[36px] !px-3 text-xs ${
                  disabled ? 'btn-secondary' : 'btn-primary'
                }`}
              >
                {busy === product.id ? (
                  '…'
                ) : (
                  <>
                    <PixelIcon name="star" size={10} />
                    <span className="num">{product.stars}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
