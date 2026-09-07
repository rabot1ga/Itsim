import { FastifyInstance } from 'fastify';
import { telegramAuthHook } from '../middleware/telegramAuth.js';
import { getNftProvider } from '../services/nftProvider.js';
import { loadState, saveState } from '../services/gameStore.js';
import { getContent } from '../services/contentService.js';
import {
  WalletAddressSchema,
  generatePlayerSeed,
  getGeneticTraits,
  type ActiveCrossBonus,
} from '@itsim/shared';

/**
 * NFT / Solana routes — DESIGN.md section 3 (mock mode).
 * The NftProvider interface is chain-agnostic: swap MockNftProvider
 * for a Helius RPC implementation to go live.
 */

export async function nftRoutes(app: FastifyInstance) {
  app.addHook('preHandler', telegramAuthHook);

  /**
   * POST /api/nft/bind-wallet
   * Bind a Solana wallet. Recomputes the player "genotype" from the wallet seed.
   */
  app.post('/bind-wallet', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { address } = request.body as { address?: string };

    const parsed = WalletAddressSchema.safeParse(address ?? '');
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Некорректный адрес кошелька Solana (base58, 32-44 символа)' });
    }

    const state = loadState(userId) as any;
    if (!state) {
      return reply.status(404).send({ error: 'Game not started' });
    }

    const wallet = parsed.data;
    state.walletAddress = wallet;

    // Base genetics are hard-tied to the wallet (DESIGN.md 3.1)
    const seed = generatePlayerSeed(wallet);
    state.genetics = getGeneticTraits(seed, getContent().genetics);

    // Refresh cross-collection bonuses
    state.crossBonuses = await bonusesFor(wallet);

    saveState(userId, state);
    return { state, wallet, genetics: state.genetics };
  });

  /**
   * GET /api/nft/inventory
   * Metaplex-style metadata of items minted for the bound wallet
   */
  app.get('/inventory', async (request) => {
    const user = (request as any).telegramUser;
    const state = loadState(String(user.id)) as any;
    const wallet = state?.walletAddress ?? `local:${user.id}`;
    const nfts = await getNftProvider().getInventory(wallet);
    return { wallet, nfts };
  });

  /**
   * GET /api/nft/cross-collections
   * Active bonuses from third-party collections held in the wallet
   */
  app.get('/cross-collections', async (request) => {
    const user = (request as any).telegramUser;
    const state = loadState(String(user.id)) as any;
    const wallet = state?.walletAddress ?? `local:${user.id}`;
    const held = await getNftProvider().getHeldCollections(wallet);
    const active = await getNftProvider().getActiveBonuses(wallet);
    return { wallet, held, active };
  });

  /**
   * POST /api/nft/mock-collections
   * DEV/MOCK ONLY: pretend the wallet holds certain collections.
   * In production this comes from an on-chain read (Helius RPC).
   */
  app.post('/mock-collections', async (request, reply) => {
    const user = (request as any).telegramUser;
    const userId = String(user.id);
    const { collections } = request.body as { collections?: string[] };

    if (!Array.isArray(collections)) {
      return reply.status(400).send({ error: 'collections must be an array' });
    }

    const known = new Set((getContent().crossCollections.collections as any[]).map((c) => c.collectionId));
    for (const id of collections) {
      if (!known.has(id)) {
        return reply.status(400).send({ error: `Unknown collection: ${id}` });
      }
    }

    const state = loadState(userId) as any;
    if (!state) return reply.status(404).send({ error: 'Game not started' });

    const wallet = state.walletAddress ?? `local:${userId}`;
    await getNftProvider().setHeldCollections(wallet, collections);
    state.crossBonuses = await bonusesFor(wallet);
    saveState(userId, state);

    return { held: collections, active: state.crossBonuses };
  });
}

async function bonusesFor(wallet: string): Promise<ActiveCrossBonus[]> {
  const bonuses: ActiveCrossBonus[] = [];
  for (const col of await getNftProvider().getActiveBonuses(wallet)) {
    bonuses.push(...col.bonuses);
  }
  return bonuses;
}
