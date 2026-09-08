/**
 * Legacy entry point for the game routes.
 *
 * P1.14 split the 2.5k-line `game.ts` into per-domain files under `./game/`.
 * This file remains a re-export so `src/index.ts` keeps working without a
 * change to the import path.
 */
export { gameRoutes } from './game/index.js';
