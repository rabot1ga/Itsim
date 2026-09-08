import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState, ScreenTitle, SectionTitle } from '../components/ui';

/**
 * Wallet — NFT-инвентарь и активные кросс-коллекции.
 *
 * Сервер (`/api/nft/*`) — единственный источник правды: инвентарь читается
 * через mock `MockNftProvider` (см. DESIGN.md 3.2). Привязка кошелька
 * пересчитывает генотип игрока — это уже делает `bind-wallet`.
 */
export const WalletView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const bindWallet = useGameStore((s) => s.bindWallet);
  const [inventory, setInventory] = useState<any[] | null>(null);
  const [cross, setCross] = useState<{ held: string[]; active: { type: string; value: number }[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/nft/inventory', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/nft/cross-collections', { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([inv, cc]) => {
        if (Array.isArray(inv?.nfts)) setInventory(inv.nfts);
        if (cc && Array.isArray(cc.held)) setCross({ held: cc.held, active: cc.active ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Не удалось загрузить кошелёк');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (player?.walletAddress) setDraft(player.walletAddress);
  }, [player?.walletAddress]);

  const grouped = useMemo(() => {
    if (!inventory) return null;
    const byId = new Map<string, { name: string; count: number; rarity: string | null; image: string | null }>();
    for (const nft of inventory) {
      const id = String(nft.attributes?.find((a: any) => a.trait_type === 'ItemId')?.value ?? nft.name ?? 'unknown');
      const rarity = (nft.attributes?.find((a: any) => a.trait_type === 'Rarity')?.value as string) ?? null;
      const prev = byId.get(id);
      if (prev) prev.count += 1;
      else byId.set(id, { name: nft.name ?? id, count: 1, rarity, image: nft.image ?? null });
    }
    return Array.from(byId.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [inventory]);

  if (!player) return null;

  const wallet = player.walletAddress ?? null;
  const isBound = Boolean(wallet);

  const submitBind = async () => {
    if (busy) return;
    setBusy('bind');
    setError(null);
    try {
      const ok = await bindWallet(draft.trim());
      if (!ok) setError(useGameStore.getState().error ?? 'Не удалось привязать кошелёк');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👛" meta={<span className="num">{inventory ? `${inventory.length} NFT` : '…'}</span>}>
        Кошелёк
      </ScreenTitle>

      <article className="card" aria-label="Привязка кошелька">
        <SectionTitle className="mb-1">Solana-кошелёк</SectionTitle>
        <p className="subtle mb-3">
          Привязка кошелька пересчитывает генотип (DESIGN.md 3.1) и открывает NFT-баффы. В демо режиме используется
          мок-провайдер — реальный адрес сохраняется как есть.
        </p>
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`chip ${isBound ? 'chip-green' : 'chip-orange'}`}>
            {isBound ? 'привязан' : 'не привязан'}
          </span>
          {wallet && (
            <span className="num text-2xs text-ink-500 break-all flex-1" title={wallet}>
              {wallet.slice(0, 6)}…{wallet.slice(-4)}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            inputMode="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Адрес Solana (base58)"
            className="input flex-1 text-xs"
            aria-label="Адрес кошелька"
          />
          <button disabled={busy !== null || !draft.trim()} onClick={submitBind} className="btn btn-sm btn-primary">
            {busy === 'bind' ? '…' : isBound ? 'Сменить' : 'Привязать'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-clay-300 mt-1" role="alert">
            {error}
          </p>
        )}
      </article>

      <article className="card" aria-label="Кросс-коллекции">
        <SectionTitle className="mb-1">Кросс-коллекции</SectionTitle>
        <p className="subtle mb-3">
          Бонусы от сторонних коллекций, которые кошелёк держит. Сейчас читается моком, в проде — Helius RPC.
        </p>
        {cross === null ? (
          <Spinner label="Читаем коллекции…" />
        ) : cross.held.length === 0 ? (
          <p className="subtle">Нет активных коллекций</p>
        ) : (
          <div className="space-y-1">
            {cross.held.map((c) => (
              <div key={c} className="well flex items-center justify-between gap-2">
                <span className="text-sm text-ink-100">{c}</span>
                <span className="text-2xs text-moss-300">в кошельке</span>
              </div>
            ))}
            {cross.active.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cross.active.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-2xs text-moss-300"
                    aria-label={`Бонус: ${b.type}`}
                  >
                    <span aria-hidden="true">⭐</span>
                    {b.type}: {b.value > 0 && b.value < 1 ? `${Math.round(b.value * 100)}%` : b.value}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </article>

      <article className="card" aria-label="NFT-инвентарь">
        <SectionTitle className="mb-3">NFT-инвентарь</SectionTitle>
        {grouped === null ? (
          <Spinner label="Читаем инвентарь…" />
        ) : grouped.length === 0 ? (
          <EmptyState
            bare
            emoji="📦"
            title="Кошелёк пуст"
            hint="Купи NFT-предмет в магазине — он смонтируется автоматически."
          />
        ) : (
          <ul className="space-y-1.5">
            {grouped.map((nft) => (
              <li key={nft.name} className="well flex items-center gap-2.5">
                {nft.image ? (
                  <img src={nft.image} alt="" width={36} height={36} className="plate shrink-0" />
                ) : (
                  <span
                    className="plate w-9 h-9 shrink-0 flex items-center justify-center text-base"
                    aria-hidden="true"
                  >
                    📦
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-100 truncate">{nft.name}</p>
                  <p className="text-2xs text-ink-500">
                    {nft.rarity ?? 'common'} · ×{nft.count}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
};
