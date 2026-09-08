import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { buildRoomComposition } from '../components/room/RoomRenderer';
import { IsoRoom } from '../components/iso/IsoRoom';
import { IsoRoomEditor } from '../components/iso/IsoRoomEditor';
import { entryName } from '../components/room/RoomEditor';
import { EmptyState, SpriteBadge } from '../components/ui';
import { Wardrobe } from '../components/room/Wardrobe';
import { ShareCard } from '../components/room/ShareCard';
import { haptic } from '../lib/telegram';
import { buildAvatarData, fetchPixelPack, PixelAvatarData } from '../components/room/pixelAvatar';
import { PixelIdentity } from '../components/room/PixelIdentity';
import { PixelIcon } from '../components/pixel/PixelIcon';

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
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <SpriteBadge sprite="bed" size={32} />
          Дом
        </h2>
        {traits && (
          <span className="num text-2xs text-ink-600 truncate max-w-[140px]" title={traits.seed}>
            seed {traits.seed.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Room */}
      <IsoRoom player={player} />

      {/* Pet status */}
      {ready && composition?.pet && composition.pet !== 'pet_none' && (
        <div className="panel !py-2.5 flex items-center gap-2.5">
          <PixelIcon name="bone" size={14} className="text-ink-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-100 truncate">
              {entryName(composition.pet)}
            </p>
            <p className={`text-xs ${player.petFedToday ? 'text-moss-300' : 'text-ochre-300'}`}>
              {player.petFedToday
                ? 'сыт и счастлив до завтра'
                : 'голоден — покорми во вкладке «День»'}
            </p>
          </div>
        </div>
      )}

      {/* Room editor */}
      {ready && (
        <div className="game-card">
          <button
            onClick={() => {
              haptic('selection');
              setEditorOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between touch-target active:scale-[0.98] transition-all"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-100">
              <PixelIcon name="house" size={12} className="text-ink-400" />
              Настроить комнату
            </span>
            <PixelIcon name="chevron" size={10} className={`accordion-chevron text-ink-500 ${editorOpen ? 'open' : ''}`} />
          </button>
          <div className={`accordion-body ${editorOpen ? 'open' : ''}`}>
            <div className="accordion-inner">
              <div className="pt-3">
                <IsoRoomEditor player={player} />
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
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-100">
              <PixelIcon name="person" size={12} className="text-ink-400" />
              Гардероб
            </span>
            <PixelIcon name="chevron" size={10} className={`accordion-chevron text-ink-500 ${wardrobeOpen ? 'open' : ''}`} />
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

      {error && <div className="panel panel-note panel-note-clay"><p className="flex items-start gap-2 text-sm text-clay-300"><PixelIcon name="warn" size={12} className="mt-0.5" />{error}</p></div>}

      {/* Wallet */}
      <div className="game-card">
        <h3 className="section-title mb-2">Кошелёк Solana</h3>
        {player.walletAddress ? (
          <p className="num text-xs text-moss-300 break-all">{player.walletAddress}</p>
        ) : (
          <div className="flex gap-2">
            <input
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              placeholder="Base58 адрес…"
              className="flex-1 min-w-0 bg-ink-800 border-2 border-ink-700 px-3 py-2.5 text-base text-ink-200"
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
              className="px-4 py-2.5 text-sm bg-sky-600 hover:bg-sky-700 active:scale-95 disabled:opacity-50 text-white touch-target font-medium shrink-0 transition-all"
            >
              Привязать
            </button>
          </div>
        )}
        <p className="text-xs text-ink-500 mt-2">
          Генетика персонажа детерминированно привязана к кошельку (DESIGN.md 3.1). В проде — через Solana Wallet Adapter.
        </p>
      </div>

      {/* NFT inventory */}
      <div className="game-card">
        <h3 className="section-title mb-2">NFT-предметы (мок)</h3>
        {(inventory ?? []).length === 0 ? (
          <EmptyState
            bare
            icon="box"
            title="NFT пока нет"
            hint="Загляни в магазин (Herman Miller, MacBook…) — покупка смонтится в кошелёк."
          />
        ) : (
          <div className="space-y-1.5">
            {(inventory ?? []).map((nft: any) => (
              <div key={nft.name} className="flex items-center justify-between bg-ink-800/60 px-3 py-2">
                <div>
                  <p className="text-xs text-ink-200">{nft.name}</p>
                  <p className="text-[10px] font-mono text-ink-500">
                    {nft.attributes?.map((a: any) => `${a.trait_type}:${a.value}`).join(' · ')}
                  </p>
                </div>
                <span className="text-[10px] text-sky-400 font-mono">{nft.symbol}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cross-collection synergies */}
      <div className="game-card">
        <h3 className="section-title mb-2">Cross-collection (мок-детект)</h3>
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
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 border text-left transition-all touch-target active:scale-[0.98] ${
                  held ? 'border-moss-500/50 bg-moss-800/20' : 'border-ink-700 bg-ink-800/50'
                }`}
              >
                <div>
                  <p className="text-xs text-ink-200">{c.collectionName}</p>
                  <p className="text-2xs text-ink-500">{c.nftType} → {c.layerId}{bonuses ? ` · ${bonuses}` : ''}</p>
                </div>
                <PixelIcon name={held ? 'check' : 'plus'} size={10} className={held ? 'text-moss-300' : 'text-ink-400'} />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-500 mt-2">
          В проде владение коллекциями читается on-chain (Helius RPC). Здесь — мок для теста бонусов.
        </p>
      </div>

      {/* Share card */}
      {ready && <ShareCard traits={displayTraits} player={player} />}
    </div>
  );
};
