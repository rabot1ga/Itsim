import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { RoomRenderer, buildRoomComposition } from '../components/room/RoomRenderer';
import { RoomEditor, entryName } from '../components/room/RoomEditor';
import { RoomSkeleton, EmptyState } from '../components/ui';
import { Wardrobe } from '../components/room/Wardrobe';
import { ShareCard } from '../components/room/ShareCard';
import { haptic } from '../lib/telegram';
import { buildAvatarData, fetchPixelPack, PixelAvatarData } from '../components/room/pixelAvatar';
import { PixelIdentity } from '../components/room/PixelIdentity';

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
  const [pixelPack, setPixelPack] = useState<Awaited<ReturnType<typeof fetchPixelPack>>>(null);
  const [walletInput, setWalletInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/content/genetics').then((r) => r.json()),
      fetch('/api/content/layers').then((r) => r.json()),
      fetch('/api/content/cross-collections').then((r) => r.json()),
      fetchPixelPack(),
    ])
      .then(([g, l, c, pixel]) => {
        setGeneticsConfig(g.genetics);
        setAvatarManifest(l.avatar);
        setRoomManifest(l.room);
        setCrossCollections(c.crossCollections?.collections ?? []);
        setPixelPack(pixel);
      })
      .catch(() => setError('Не удалось загрузить контент'));
  }, []);

  if (!player) return null;

  const pixelAvatarData: PixelAvatarData | null =
    pixelPack && player.genetics ? buildAvatarData(pixelPack, player.genetics, player.avatar) : null;

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
        custom: player.room,
      })
    : null;

  // A repaint overrides the genetic wall tint everywhere (room + share card)
  const displayTraits = traits && player?.room?.wallColor
    ? { ...traits, wallColor: player.room.wallColor }
    : traits;

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
          traits={displayTraits}
          geneticsConfig={geneticsConfig}
          housingLevel={player.housingLevel ?? 0}
          composition={composition}
          pixelAvatar={pixelAvatarData}
          avatarCustom={player.avatar}
          petWear={(player.items ?? []).filter((id: string) =>
            ['pet_bow', 'pet_glasses', 'pet_crown'].includes(id)
          )}
          petFed={!!player.petFedToday}
        />
      ) : (
        <RoomSkeleton />
      )}

      {/* Pet status */}
      {ready && composition?.pet && composition.pet !== 'pet_none' && (
        <div className="game-card !py-2.5 flex items-center gap-2.5">
          <span className="text-xl">🐾</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">
              {entryName(composition.pet)}
            </p>
            <p className="text-[11px] text-slate-400">
              {player.petFedToday ? '😋 сыт и счастлив до завтра' : '😿 голоден — покорми во вкладке «День»'}
            </p>
          </div>
        </div>
      )}

      {/* Room editor */}
      {ready && composition && (
        <div className="game-card">
          <button
            onClick={() => {
              haptic('selection');
              setEditorOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between touch-target active:scale-[0.98] transition-all"
          >
            <span className="text-sm font-semibold text-slate-200">🎨 Настроить комнату</span>
            <span className={`accordion-chevron text-slate-500 text-xs ${editorOpen ? 'open' : ''}`}>▾</span>
          </button>
          <div className={`accordion-body ${editorOpen ? 'open' : ''}`}>
            <div className="accordion-inner">
              <div className="pt-3">
                <RoomEditor
                  roomManifest={roomManifest}
                  geneticsConfig={geneticsConfig}
                  traits={traits}
                  player={player}
                  heldCollections={heldCollections ?? []}
                  composition={composition}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wardrobe */}
      {ready && (
        <div className="game-card">
          <button
            onClick={() => {
              haptic('selection');
              setWardrobeOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between touch-target active:scale-[0.98] transition-all"
          >
            <span className="text-sm font-semibold text-slate-200">🧍 Гардероб</span>
            <span className={`accordion-chevron text-slate-500 text-xs ${wardrobeOpen ? 'open' : ''}`}>▾</span>
          </button>
          <div className={`accordion-body ${wardrobeOpen ? 'open' : ''}`}>
            <div className="accordion-inner">
              <div className="pt-3">
                <Wardrobe avatarManifest={avatarManifest} traits={traits} player={player} />
              </div>
            </div>
          </div>
        </div>
      )}

      {pixelAvatarData && pixelPack && (
        <PixelIdentity pack={pixelPack} data={pixelAvatarData} />
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
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base text-slate-200"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <button
              onClick={handleBind}
              disabled={walletInput.trim().length < 32}
              className="px-4 py-2.5 text-sm bg-primary-600 hover:bg-primary-700 active:scale-95 disabled:opacity-50 text-white rounded-xl touch-target font-medium shrink-0 transition-all"
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
          <EmptyState
            bare
            icon="🖼"
            title="NFT пока нет"
            hint="Загляни в магазин (Herman Miller, MacBook…) — покупка смонтится в кошелёк."
          />
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
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-all touch-target active:scale-[0.98] ${
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
          traits={displayTraits}
          geneticsConfig={geneticsConfig}
          composition={composition}
          player={player}
        />
      )}
    </div>
  );
};
