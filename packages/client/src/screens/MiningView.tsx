import { t, fmtNumber } from '../lib/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState, ScreenTitle, SectionTitle } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
/**
 * Mining — пассивный доход от майнинг-фермы.
 *
 * Экран построен на той же `mining` summary, что возвращает `/state`, плюс
 * список предметов-ферм из `/api/content/items` (id начинается с `mining_`).
 * Прогноз на 7 дней — детерминированная симуляция через `miningDailyIncome`
 * (движок). Если фермы нет, показываем пустое состояние и CTA в магазин.
 */
export const MiningView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const mining = useGameStore((s) => s.mining);
  const [items, setItems] = useState<any[] | null>(null);
  const [cfg, setCfg] = useState<{
    priceBase: number;
    volatility: number;
    electricityPerHashrate: number;
  } | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    Promise.all([
      fetch('/api/content/items', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/content/balance', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([itemsData, balanceData]) => {
        if (Array.isArray(itemsData?.items)) setItems(itemsData.items.filter((i: any) => i.id.startsWith('mining_')));
        const m = balanceData?.balance?.mining;
        if (m)
          setCfg({
            priceBase: m.priceBase,
            volatility: m.volatility,
            electricityPerHashrate: m.electricityPerHashrate,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, []);
  const farms = useMemo(() => {
    if (!items || !player) return [];
    const owned = new Set(player.items ?? []);
    return items.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      hashrate: it.effects?.hashrate ?? 0,
      electricitySave: it.effects?.electricitySave ?? 0,
      description: it.description,
      owned: owned.has(it.id),
    }));
  }, [items, player]);
  const hashrate = mining?.hashrate ?? 0;
  const currentDay = player?.currentDay ?? 1;
  // 7-day forecast: deterministic, mirrors the engine's miningDailyIncome.
  // Declared before the early return so the hook order never changes.
  const forecast = useMemo(() => {
    if (!cfg || hashrate <= 0)
      return [] as {
        day: number;
        net: number;
        price: number;
      }[];
    const out: {
      day: number;
      net: number;
      price: number;
    }[] = [];
    const start = currentDay;
    for (let i = 1; i <= 7; i++) {
      const day = start + i;
      // Match the engine's noise: priceBase * (1 + volatility * miningDayNoise)
      const x = Math.sin(day * 12.9898) * 43758.5453;
      const noise = (x - Math.floor(x)) * 2 - 1;
      const price = cfg.priceBase * (1 + cfg.volatility * noise);
      const electricity = hashrate * cfg.electricityPerHashrate;
      const net = hashrate * price - electricity;
      out.push({ day, net: Math.round(net), price });
    }
    return out;
  }, [cfg, hashrate, currentDay]);
  const weekNet = forecast.reduce((s, d) => s + d.net, 0);
  const maxAbs = Math.max(1, ...forecast.map((d) => Math.abs(d.net)));
  if (!player) return null;
  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => useGameStore.getState().setView('shop')} className="link-back">
        {t('← Магазин')}
      </button>
      <ScreenTitle
        icon="chip"
        meta={
          <span className="num" aria-label={t('Хешрейт')}>
            {hashrate > 0 ? `${hashrate} MH/s` : t('нет фермы')}
          </span>
        }
      >
        {t('Майнинг')}
      </ScreenTitle>

      {/* Live summary — same numbers as the main screen card, so the two never disagree */}
      {mining ? (
        <article className="card shop-product" aria-label={t('Доход фермы')}>
          <PixelIcon name="coin" size={14} />
          <div className="shop-product-copy">
            <h3>{t('Сегодня')}</h3>
            <p className="shop-product-effects">
              {t('Курс')} {mining.price.toFixed(1)} {t('₽/MH · ферма:')} {mining.hashrate} MH/s
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {t('Валовый доход')} {fmtNumber(mining.gross)} {t('₽, электричество −')}
              {fmtNumber(mining.electricity)} ₽
            </p>
          </div>
          <div className="shop-product-buy">
            <span
              className={`num text-sm font-semibold ${mining.net >= 0 ? 'text-moss-300' : 'text-clay-300'}`}
              aria-label={t('Чистый доход')}
            >
              {mining.net >= 0 ? '+' : ''}
              {fmtNumber(mining.net)} {t('₽/день')}
            </span>
          </div>
        </article>
      ) : (
        <div className="card">
          <EmptyState
            bare
            icon="chip"
            title={t('Ферма не запущена')}
            hint={t(
              'Купи GPU/риг/асик в магазине, чтобы получать пассивный доход. Чем больше хешрейт — тем выше валовый доход, но и счёт за свет.'
            )}
          />
          <button className="btn btn-primary w-full mt-3" onClick={() => useGameStore.getState().setView('shop')}>
            {t('В магазин')}
          </button>
        </div>
      )}

      {/* 7-day forecast (deterministic, no fake randomness) */}
      {hashrate > 0 && forecast.length > 0 && (
        <article className="card" aria-label={t('Прогноз на 7 дней')}>
          <header className="flex items-center justify-between mb-3">
            <SectionTitle>{t('Прогноз · 7 дней')}</SectionTitle>
            <span
              className={`num text-xs font-semibold ${weekNet >= 0 ? 'text-moss-300' : 'text-clay-300'}`}
              aria-label={t('Итого за неделю')}
            >
              {weekNet >= 0 ? '+' : ''}
              {fmtNumber(weekNet)} ₽
            </span>
          </header>
          <div className="flex items-end gap-1 h-16">
            {forecast.map((d) => {
              const h = Math.max(2, Math.round((Math.abs(d.net) / maxAbs) * 60));
              const isPos = d.net >= 0;
              return (
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center justify-end gap-1"
                  title={t('День {p0}: {p1} ₽', { p0: d.day, p1: d.net })}
                >
                  <span
                    aria-hidden="true"
                    className={`w-full rounded-t-md ${isPos ? 'bg-moss-500' : 'bg-clay-500'}`}
                    style={{ height: `${h}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            {forecast.map((d) => (
              <span key={d.day} className="text-2xs text-ink-500 flex-1 text-center">
                {d.day}
              </span>
            ))}
          </div>
        </article>
      )}

      {/* Farm inventory + shop teaser */}
      <article className="card" aria-label={t('Оборудование')}>
        <SectionTitle className="mb-3">{t('Оборудование')}</SectionTitle>
        {loadError ? (
          <p className="text-xs text-clay-300">{t('Не удалось загрузить каталог ферм')}</p>
        ) : items === null ? (
          <Spinner label={t('Открываем ферму…')} />
        ) : farms.length === 0 ? (
          <p className="subtle">{t('В каталоге пока нет майнинг-оборудования')}</p>
        ) : (
          <ul className="space-y-1.5">
            {farms.map((f) => (
              <li
                key={f.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${f.owned ? 'border-moss-500 bg-moss-900/25' : 'border-ink-700 bg-ink-950'}`}
              >
                <div className="min-w-0">
                  <p className={`text-sm ${f.owned ? 'text-moss-300 font-medium' : 'text-ink-200'}`}>{f.name}</p>
                  <p className="text-2xs text-ink-500">
                    {f.hashrate} MH/s
                    {f.electricitySave ? t('· −{p0}% свет', { p0: Math.round(f.electricitySave * 100) }) : ''}
                  </p>
                </div>
                <span className={`text-2xs shrink-0 ${f.owned ? 'text-moss-300' : 'text-ink-500'}`}>
                  {f.owned ? t('установлено') : `${fmtNumber(f.price)} ₽`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
};
