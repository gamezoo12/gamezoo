/*
  Prize League — Game Engine V3

  New games are registered here independently from the existing V1/V2
  engine.

  Required completion contract:

    onComplete({
      solved: boolean,
      accuracy: number,     // 0..1
      duration_ms: number
    })

  IMPORTANT:
  - Official timing is independently measured by PlayGame.jsx.
  - Official score is calculated by backend/routers/game_routes.py.
  - Ticket attempt enforcement remains backend-controlled.
*/

export const GAME_MAP_V3 = {};

export const GAME_META_V3 = [];
