import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState, SpriteBadge } from '../components/ui';
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
  const [cfg, setCfg] = useState<{ priceBase: number; volatility: number; electricityPerHashrate: number } | null>(
    null
  );
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
        if (m) setCfg({ priceBase: m.priceBase, volatility: m.volatility, electricityPerHashrate: m.electricityPerHashrate });
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

  if (!player) return null;

  const hashrate = mining?.hashrate ?? 0;

  // 7-day forecast: deterministic, mirrors the engine's miningDailyIncome
  const forecast = useMemo(() => {
    if (!cfg || hashrate <= 0) return [] as { day: number; net: number; price: number }[];
    const out: { day: number; net: number; price: number }[] = [];
    const start = player.currentDay;
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
  }, [cfg, hashrate, player.currentDay]);

  const weekNet = forecast.reduce((s, d) => s + d.net, 0);
  const maxAbs = Math.max(1, ...forecast.map((d) => Math.abs(d.net)));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="shop-heading">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <SpriteBadge sprite="box" size={32} />
          Майнинг
        </h2>
        <span className="num text-sm font-semibold text-moss-300" aria-label="Хешрейт">
          {hashrate > 0 ? `${hashrate} MH/s` : 'нет фермы'}
        </span>
      </div>

      {/* Live summary — same numbers as the main screen card, so the two never disagree */}
      {mining ? (
        <article className="panel shop-product" aria-label="Доход фермы">
          <span className="shop-product-art">
            <PixelIcon name="coin" size={36} className="text-gold-300" />
          </span>
          <div className="shop-product-copy">
            <h3>Сегодня</h3>
            <p className="shop-product-effects">
              Курс {mining.price.toFixed(1)} ₽/MH · ферма: {mining.hashrate} MH/s
            </p>
            <p className="text-xs text-ink-500 mt-1">
              Валовый доход {mining.gross.toLocaleString('ru-RU')} ₽, электричество −{mining.electricity.toLocaleString('ru-RU')} ₽
            </p>
          </div>
          <div className="shop-product-buy">
            <span
              className={`num text-sm font-semibold ${mining.net >= 0 ? 'text-moss-300' : 'text-clay-300'}`}
              aria-label="Чистый доход"
            >
              {mining.net >= 0 ? '+' : ''}
              {mining.net.toLocaleString('ru-RU')} ₽/день
            </span>
          </div>
        </article>
      ) : (
        <div className="panel">
          <EmptyState
            icon="box"
            title="Ферма не запущена"
            hint="Купи GPU/риг/асик в магазине, чтобы получать пассивный доход. Чем больше хешрейт — тем выше валовый доход, но и счёт за свет."
          />
          <button className="btn btn-primary w-full mt-2" onClick={() => useGameStore.getState().setView('shop')}>
            В магазин
          </button>
        </div>
      )}

      {/* 7-day forecast (deterministic, no fake randomness) */}
      {hashrate > 0 && forecast.length > 0 && (
        <article className="panel" aria-label="Прогноз на 7 дней">
          <header className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink-100">Прогноз · 7 дней</h3>
            <span
              className={`num text-xs font-semibold ${weekNet >= 0 ? 'text-moss-300' : 'text-clay-300'}`}
              aria-label="Итого за неделю"
            >
              {weekNet >= 0 ? '+' : ''}
              {weekNet.toLocaleString('ru-RU')} ₽
            </span>
          </header>
          <div className="flex items-end gap-1 h-16">
            {forecast.map((d) => {
              const h = Math.max(2, Math.round((Math.abs(d.net) / maxAbs) * 60));
              const isPos = d.net >= 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`День ${d.day}: ${d.net} ₽`}>
                  <span
                    aria-hidden="true"
                    className={`w-full ${isPos ? 'bg-moss-700' : 'bg-clay-700'}`}
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
      <article className="panel" aria-label="Оборудование">
        <h3 className="text-sm font-semibold text-ink-100 mb-2">Оборудование</h3>
        {loadError ? (
          <p className="text-xs text-clay-300">Не удалось загрузить каталог ферм</p>
        ) : items === null ? (
          <Spinner label="Открываем ферму…" />
        ) : farms.length === 0 ? (
          <p className="text-xs text-ink-500">В каталоге пока нет майнинг-оборудования</p>
        ) : (
          <ul className="space-y-1.5">
            {farms.map((f) => (
              <li
                key={f.id}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 border ${
                  f.owned ? 'border-moss-700 bg-moss-900/25' : 'border-ink-700 bg-ink-900'
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-sm ${f.owned ? 'text-moss-300 font-medium' : 'text-ink-200'}`}>{f.name}</p>
                  <p className="text-2xs text-ink-500">
                    {f.hashrate} MH/s
                    {f.electricitySave ? ` · −${Math.round(f.electricitySave * 100)}% свет` : ''}
                  </p>
                </div>
                <span className={`text-2xs shrink-0 ${f.owned ? 'text-moss-300' : 'text-ink-500'}`}>
                  {f.owned ? 'установлено' : `${f.price.toLocaleString('ru-RU')} ₽`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
};
