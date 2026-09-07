import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RoomRenderer, buildRoomComposition } from '../components/room/RoomRenderer';
import { ShareCard } from '../components/room/ShareCard';

/**
 * «Дом» — procedural room (DESIGN.md), NFT inventory (mock Solana),
 * cross-collection synergies and the share card.
 */
export const RoomView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const bindWallet = useGameStore((s) => s.bindWallet);
  const setMockCollections = useGameStore((s) => s.setMockCollections);
  const inventory = useGameStore((s) => s.inventory);
  const heldCollections = useGameStore((s) => s.heldCollections);

  const [geneticsConfig, setGeneticsConfig] = useState<any>(null);
  const [avatarManifest, setAvatarManifest] = useState<any>(null);
  const [roomManifest, setRoomManifest] = useState<any>(null);
  const [crossCollections, setCrossCollections] = useState<any[]>([]);
  const [walletInput, setWalletInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/genetics').then((r) => r.json()),
      fetch('/api/content/layers').then((r) => r.json()),
      fetch('/api/content/cross-collections').then((r) => r.json()),
    ])
      .then(([g, l, c]) => {
        setGeneticsConfig(g.genetics);
        setAvatarManifest(l.avatar);
        setRoomManifest(l.room);
        setCrossCollections(c.crossCollections?.collections ?? []);
      })
      .catch(() => setError('Не удалось загрузить контент'));
  }, []);

  if (!player) return null;

  const traits = player.genetics;
  const ready = geneticsConfig && avatarManifest && roomManifest && traits;

  const crossLayers = (crossCollections ?? [])
    .filter((c: any) => (heldCollections ?? []).includes(c.collectionId))
    .map((c: any) => ({
      layerId: c.layerId,
      slotId: c.nftType === 'decor' ? 'decor' : c.nftType === 'pet' ? 'pet' : 'decor',
    }));

  const composition = ready
    ? buildRoomComposition({
        traits,
        housingLevel: player.housingLevel ?? 0,
        items: player.items ?? [],
        crossLayers,
      })
    : null;

  const handleBind = async () => {
    const ok = await bindWallet(walletInput.trim());
    setError(ok ? null : 'Не удалось привязать кошелёк (проверь формат base58)');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">🏠 Дом</h2>
        {traits && (
          <span className="text-[10px] font-mono text-slate-500 truncate max-w-[140px]" title={traits.seed}>
            seed {traits.seed.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Room */}
      {ready && composition ? (
        <RoomRenderer
          roomManifest={roomManifest}
          avatarManifest={avatarManifest}
          traits={traits}
          geneticsConfig={geneticsConfig}
          housingLevel={player.housingLevel ?? 0}
          composition={composition}
        />
      ) : (
        <div className="aspect-square rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500">
          Загрузка комнаты…
        </div>
      )}

      {error && <div className="game-card border-red-500/40 bg-red-500/10"><p className="text-sm text-red-300">⚠️ {error}</p></div>}

      {/* Wallet */}
      <div className="game-card">
        <h3 className="section-title mb-2">👛 Кошелёк Solana</h3>
        {player.walletAddress ? (
          <p className="text-xs font-mono text-emerald-400 break-all">{player.walletAddress}</p>
        ) : (
          <div className="flex gap-2">
            <input
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              placeholder="Base58 адрес…"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            />
            <button
              onClick={handleBind}
              disabled={walletInput.trim().length < 32}
              className="px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg"
            >
              Привязать
            </button>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-2">
          Генетика персонажа детерминированно привязана к кошельку (DESIGN.md 3.1). В проде — через Solana Wallet Adapter.
        </p>
      </div>

      {/* NFT inventory */}
      <div className="game-card">
        <h3 className="section-title mb-2">🔗 NFT-предметы (мок)</h3>
        {(inventory ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">
            Пока пусто. Купи NFT-предмет в магазине (Herman Miller, MacBook…) — он смонтится в кошелёк.
          </p>
        ) : (
          <div className="space-y-1.5">
            {(inventory ?? []).map((nft: any) => (
              <div key={nft.name} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs text-slate-200">{nft.name}</p>
                  <p className="text-[10px] font-mono text-slate-500">
                    {nft.attributes?.map((a: any) => `${a.trait_type}:${a.value}`).join(' · ')}
                  </p>
                </div>
                <span className="text-[10px] text-primary-400 font-mono">{nft.symbol}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cross-collection synergies */}
      <div className="game-card">
        <h3 className="section-title mb-2">🌐 Cross-collection (мок-детект)</h3>
        <div className="space-y-2">
          {crossCollections.map((c: any) => {
            const held = (heldCollections ?? []).includes(c.collectionId);
            const bonuses = (c.bonuses ?? []).map((b: any) => `${b.type}=${b.value}`).join(', ');
            return (
              <button
                key={c.collectionId}
                onClick={() =>
                  setMockCollections(
                    held
                      ? (heldCollections ?? []).filter((x: string) => x !== c.collectionId)
                      : [...(heldCollections ?? []), c.collectionId]
                  )
                }
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                  held ? 'border-emerald-500/50 bg-emerald-800/20' : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                <div>
                  <p className="text-xs text-slate-200">{c.collectionName}</p>
                  <p className="text-[10px] text-slate-500">{c.nftType} → {c.layerId}{bonuses ? ` · ${bonuses}` : ''}</p>
                </div>
                <span className="text-xs">{held ? '✅' : '➕'}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          В проде владение коллекциями читается on-chain (Helius RPC). Здесь — мок для теста бонусов.
        </p>
      </div>

      {/* Share card */}
      {ready && composition && (
        <ShareCard
          roomManifest={roomManifest}
          avatarManifest={avatarManifest}
          traits={traits}
          geneticsConfig={geneticsConfig}
          composition={composition}
          player={player}
        />
      )}
    </div>
  );
};
