/*
  Prize League — Game Engine V3

  V3 remains additive to the existing game engine.

  Standard completion contract:

    onComplete({
      solved: boolean,
      accuracy: number,
      duration_ms: number
    })

  PlayGame independently measures the official elapsed time.
  Backend game_routes.py remains responsible for official points
  and ticket attempt enforcement.
*/

import {
  GAME_MAP_V3_BATCH1,
  GAME_META_V3_BATCH1,
} from './games_batch1';

export const GAME_MAP_V3 = {
  ...GAME_MAP_V3_BATCH1,
};

export const GAME_META_V3 = [
  ...GAME_META_V3_BATCH1,
];

export const V3_GAME_IDS = new Set(
  Object.keys(GAME_MAP_V3)
);

export const isV3Game = (gameId) =>
  Boolean(gameId && V3_GAME_IDS.has(gameId));
