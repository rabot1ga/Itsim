import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { NftMetadata, CrossCollectionBonus } from '@itsim/shared';
import { getContent } from './contentService.js';

/**
 * NFT provider — DESIGN.md section 3.
 *
 * Mock implementation: a JSON registry in packages/server/data/nft_registry.json
 * simulates the chain (mint / ownership / collections). The interface is
 * narrow enough to swap for a real Helius RPC + Metaplex implementation.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const REGISTRY_FILE = join(DATA_DIR, 'nft_registry.json');

mkdirSync(DATA_DIR, { recursive: true });

interface Registry {
  wallets: Record<string, { nfts: NftMetadata[]; collections: string[] }>;
}

function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_FILE)) return { wallets: {} };
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { wallets: {} };
  }
}

function saveRegistry(registry: Registry): void {
  const tmp = `${REGISTRY_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2));
  renameSync(tmp, REGISTRY_FILE);
}

export interface NftProvider {
  mint(
    wallet: string,
    item: { id: string; name: string; description: string; rarity?: string; layerId?: string },
    symbol: string
  ): Promise<NftMetadata>;
  getInventory(wallet: string): Promise<NftMetadata[]>;
  verifyOwnership(wallet: string, layerId: string): Promise<boolean>;
  getHeldCollections(wallet: string): Promise<string[]>;
  setHeldCollections(wallet: string, collections: string[]): Promise<void>;
  getActiveBonuses(wallet: string): Promise<CrossCollectionBonus[]>;
}

/** Resolve the file path of a layer for metadata.files.uri */
function layerFileUri(layerId: string | undefined): string {
  if (!layerId) return '';
  const { avatarLayers, roomLayers } = getContent();
  for (const manifest of [roomLayers, avatarLayers]) {
    for (const slot of manifest.slots) {
      const entry = slot.entries.find((e: any) => e.id === layerId);
      if (entry?.file) return `/layers/${entry.file}`;
    }
  }
  return '';
}

export class MockNftProvider implements NftProvider {
  async mint(
    wallet: string,
    item: { id: string; name: string; description: string; rarity?: string; layerId?: string },
    symbol: string
  ): Promise<NftMetadata> {
    const registry = loadRegistry();
    const entry = registry.wallets[wallet] ?? { nfts: [], collections: [] };
    const fileUri = layerFileUri(item.layerId);
    const metadata: NftMetadata = {
      name: item.name,
      symbol,
      description: item.description,
      image: fileUri,
      attributes: [
        { trait_type: 'ItemId', value: item.id },
        ...(item.layerId ? [{ trait_type: 'LayerId', value: item.layerId } as const] : []),
        ...(item.rarity ? [{ trait_type: 'Rarity', value: item.rarity } as const] : []),
        { trait_type: 'MintedAt', value: Date.now() },
      ],
      properties: {
        files: fileUri ? [{ uri: fileUri, type: 'image/svg+xml' }] : [],
      },
    };
    entry.nfts = [...entry.nfts.filter((n) => n.attributes.find((a) => a.trait_type === 'ItemId')?.value !== item.id), metadata];
    registry.wallets[wallet] = entry;
    saveRegistry(registry);
    return metadata;
  }

  async getInventory(wallet: string): Promise<NftMetadata[]> {
    const registry = loadRegistry();
    return registry.wallets[wallet]?.nfts ?? [];
  }

  async verifyOwnership(wallet: string, layerId: string): Promise<boolean> {
    const nfts = await this.getInventory(wallet);
    return nfts.some((n) => n.attributes.some((a) => a.trait_type === 'LayerId' && a.value === layerId));
  }

  async getHeldCollections(wallet: string): Promise<string[]> {
    const registry = loadRegistry();
    return registry.wallets[wallet]?.collections ?? [];
  }

  async setHeldCollections(wallet: string, collections: string[]): Promise<void> {
    const registry = loadRegistry();
    const entry = registry.wallets[wallet] ?? { nfts: [], collections: [] };
    entry.collections = collections;
    registry.wallets[wallet] = entry;
    saveRegistry(registry);
  }

  async getActiveBonuses(wallet: string): Promise<CrossCollectionBonus[]> {
    const held = new Set(await this.getHeldCollections(wallet));
    const { crossCollections } = getContent();
    return (crossCollections.collections as CrossCollectionBonus[]).filter((c) => held.has(c.collectionId));
  }
}

let provider: NftProvider | null = null;

export function getNftProvider(): NftProvider {
  if (!provider) provider = new MockNftProvider();
  return provider;
}
