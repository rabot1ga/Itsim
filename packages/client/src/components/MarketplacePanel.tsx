import { t, fmtNumber } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { useGameStore, apiRequest } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { SectionTitle } from './ui';
import { PET_SKIN_EMOJI } from '../lib/petSkins';
/**
 * Торговая площадка редких питомцев (роадмап «Деньги и рост»):
 * витрина дня — детерминированная подборка редких питомцев (новая каждый
 * день) + P2P-объявления игроков (эскроу-лайт): продажа питомца другому
 * игроку, деньги сидят в эскроу до «Забрать». Покупки — игровые ₽.
 */
interface MarketListing {
  itemId: string;
  name: string;
  description: string;
  price: number;
  rarity: string;
  owned: boolean;
}
interface MarketOffer {
  id: string;
  itemId: string;
  name: string;
  description: string;
  price: number;
  status: 'active' | 'sold_escrow' | 'paid_out' | 'cancelled' | 'expired';
  own: boolean;
}
const RARITY_LABEL: Record<string, string> = {
  rare: 'редкий',
  legendary: 'легендарный',
};
const OFFER_STATUS: Record<MarketOffer['status'], string> = {
  active: 'на витрине',
  sold_escrow: 'продан · деньги в эскроу',
  paid_out: 'выплачено',
  cancelled: 'снято',
  expired: 'истекло · питомец вернулся',
};
export const MarketplacePanel: React.FC = () => {
  const refreshState = useGameStore((s) => s.refreshState);
  const player = useGameStore((s) => s.player);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [mine, setMine] = useState<MarketOffer[]>([]);
  const [policy, setPolicy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sellItemId, setSellItemId] = useState<string>('');
  const [sellPrice, setSellPrice] = useState<string>('');
  const ownedPets = (player?.items ?? []).filter((i: string) => i in PET_SKIN_EMOJI);
  const load = async () => {
    const [view, board] = await Promise.all([apiRequest('/game/marketplace'), apiRequest('/game/marketplace/offers')]);
    if (view.ok) {
      setListings(view.data.listings ?? []);
      setPolicy(view.data.policy ?? null);
    }
    if (board.ok) {
      setOffers(board.data.offers ?? []);
      setMine(board.data.mine ?? []);
    }
    setLoaded(true);
  };
  useEffect(() => {
    load();
  }, []);
  const after = async (msg: string | undefined) => {
    haptic('success');
    setNote(msg ?? t('Готово'));
    await refreshState();
    await load();
    setSellItemId('');
    setSellPrice('');
  };
  const buy = async (listing: MarketListing) => {
    setBusy(listing.itemId);
    setNote(null);
    haptic('tap');
    const { ok, data } = await apiRequest('/game/marketplace/buy', {
      method: 'POST',
      body: JSON.stringify({ itemId: listing.itemId }),
    });
    setBusy(null);
    if (ok) await after(data.state?._lastEvent ?? t('🐾 Питомец куплен'));
    else {
      haptic('error');
      setNote(data?.error ?? t('Не получилось купить'));
    }
  };
  const sell = async () => {
    if (!sellItemId || !sellPrice) return;
    setBusy('sell');
    setNote(null);
    haptic('tap');
    const { ok, data } = await apiRequest('/game/marketplace/sell', {
      method: 'POST',
      body: JSON.stringify({ itemId: sellItemId, price: Number(sellPrice) }),
    });
    setBusy(null);
    if (ok) await after(data.state?._lastEvent ?? t('Объявление создано'));
    else {
      haptic('error');
      setNote(data?.error ?? t('Не получилось выставить'));
    }
  };
  const offerAction = async (offer: MarketOffer, action: 'buy' | 'payout' | 'cancel') => {
    setBusy(`${action}:${offer.id}`);
    setNote(null);
    haptic('tap');
    const { ok, data } = await apiRequest(`/game/marketplace/offers/${offer.id}/${action}`, { method: 'POST' });
    setBusy(null);
    if (ok) await after(data.state?._lastEvent ?? t('Готово'));
    else {
      haptic('error');
      setNote(data?.error ?? t('Не получилось'));
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
        <>
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
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => void buy(l)}
                  >
                    {t('Купить · {p0} ₽', { p0: fmtNumber(l.price) })}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* P2P: объявления других игроков */}
          <h3 className="market-sub">{t('Объявления игроков')}</h3>
          {offers.length === 0 ? (
            <p className="story-footnote">{t('Сейчас никто не продаёт. Загляни завтра!')}</p>
          ) : (
            <div className="market-list">
              {offers.map((o) => (
                <div key={o.id} className="market-row">
                  <span className="market-emoji" aria-hidden="true">
                    {PET_SKIN_EMOJI[o.itemId] ?? '🐾'}
                  </span>
                  <div className="market-copy">
                    <p className="market-name">{o.name}</p>
                    <p className="market-desc">{o.description}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => void offerAction(o, 'buy')}
                  >
                    {t('Купить · {p0} ₽', { p0: fmtNumber(o.price) })}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* P2P: мои объявления (эскроу-статусы) */}
          {mine.length > 0 && (
            <>
              <h3 className="market-sub">{t('Мои объявления')}</h3>
              <div className="market-list">
                {mine.map((o) => (
                  <div key={o.id} className="market-row">
                    <span className="market-emoji" aria-hidden="true">
                      {PET_SKIN_EMOJI[o.itemId] ?? '🐾'}
                    </span>
                    <div className="market-copy">
                      <p className="market-name">{o.name}</p>
                      <p className="market-desc">
                        {t(OFFER_STATUS[o.status])} · {fmtNumber(o.price)} ₽
                      </p>
                    </div>
                    {o.status === 'active' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy !== null}
                        onClick={() => void offerAction(o, 'cancel')}
                      >
                        {t('Снять')}
                      </button>
                    )}
                    {o.status === 'sold_escrow' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy !== null}
                        onClick={() => void offerAction(o, 'payout')}
                      >
                        {t('Забрать {p0} ₽', { p0: fmtNumber(o.price) })}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* P2P: выставить питомца */}
          {ownedPets.length > 0 && (
            <>
              <h3 className="market-sub">{t('Продать питомца')}</h3>
              <div className="market-sell">
                <select
                  className="market-input"
                  aria-label={t('Питомец на продажу')}
                  value={sellItemId}
                  onChange={(e) => setSellItemId(e.target.value)}
                >
                  <option value="">{t('Выбери питомца')}</option>
                  {ownedPets.map((id: string) => (
                    <option key={id} value={id}>
                      {PET_SKIN_EMOJI[id]} {id}
                    </option>
                  ))}
                </select>
                <input
                  className="market-input"
                  type="number"
                  min={0}
                  step={100}
                  placeholder={t('Цена, ₽')}
                  aria-label={t('Цена, ₽')}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy !== null || !sellItemId || !sellPrice}
                  onClick={() => void sell()}
                >
                  {t('Выставить')}
                </button>
              </div>
              <p className="story-footnote">
                {t(
                  'Питомец уходит в «эскроу» до продажи; деньги приходят после твоей кнопки «Забрать». Объявление живёт 2 дня.'
                )}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
};
