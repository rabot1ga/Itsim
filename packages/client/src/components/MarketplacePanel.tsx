import { t, fmtNumber } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { SectionTitle } from './ui';
import { PET_SKIN_EMOJI } from '../lib/petSkins';
/**
 * Торговая площадка редких питомцев (роадмап «Деньги и рост», v1):
 * витрина дня — детерминированная подборка редких питомцев, новая каждый
 * день. Покупка — игровые ₽ (косметика и настроение, не прогресс).
 */
interface MarketListing {
  itemId: string;
  name: string;
  description: string;
  price: number;
  rarity: string;
  owned: boolean;
}
const RARITY_LABEL: Record<string, string> = {
  rare: 'редкий',
  legendary: 'легендарный',
};
export const MarketplacePanel: React.FC = () => {
  const refreshState = useGameStore((s) => s.refreshState);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [policy, setPolicy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    const { ok, data } = await apiRequest('/game/marketplace');
    if (ok) {
      setListings(data.listings ?? []);
      setPolicy(data.policy ?? null);
    }
    setLoaded(true);
  };
  useEffect(() => {
    load();
  }, []);
  const buy = async (listing: MarketListing) => {
    setBusy(listing.itemId);
    setNote(null);
    haptic('tap');
    const { ok, data } = await apiRequest('/game/marketplace/buy', {
      method: 'POST',
      body: JSON.stringify({ itemId: listing.itemId }),
    });
    setBusy(null);
    if (ok) {
      haptic('success');
      setNote(data.state?._lastEvent ?? t('🐾 Питомец куплен'));
      await refreshState();
      await load();
    } else {
      haptic('error');
      setNote(data?.error ?? t('Не получилось купить'));
    }
  };
  return (
    <section className="card">
      <SectionTitle>{t('Торговая площадка питомцев')}</SectionTitle>
      <p className="story-footnote">
        {policy ?? t('Редкие питомцы — косметика и настроение. Новая подборка — каждый день.')}
      </p>
      {note && <p className="shop-note">{note}</p>}
      {!loaded ? (
        <p className="story-footnote">{t('Загружаем витрину…')}</p>
      ) : (
        <div className="market-list">
          {listings.map((l) => (
            <div key={l.itemId} className="market-row">
              <span className="market-emoji" aria-hidden="true">
                {PET_SKIN_EMOJI[l.itemId] ?? '🐾'}
              </span>
              <div className="market-copy">
                <p className="market-name">
                  {l.name} <span className="res-chip">{t(RARITY_LABEL[l.rarity] ?? 'редкий')}</span>
                </p>
                <p className="market-desc">{l.description}</p>
              </div>
              {l.owned ? (
                <span className="res-chip">{t('в коллекции')}</span>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void buy(l)}>
                  {t('Купить · {p0} ₽', { p0: fmtNumber(l.price) })}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
