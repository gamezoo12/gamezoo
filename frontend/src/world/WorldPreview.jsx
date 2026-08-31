import React from 'react';

import WorldCanvas
  from './components/WorldCanvas';

/*
 * LOCALHOST-ONLY VISUAL PREVIEW.
 *
 * This state is NEVER used by the production /world route.
 * Real users continue to receive server-authoritative
 * progression through worldAPI.state().
 */
const LOCAL_PREVIEW_STATE = {
  season_id: 'season-1',

  progress: {
    current_level: 1,
    highest_unlocked_level: 1,
    completed_levels: [],
    champion_stage: 1,
    champion_ready: false,
  },

  current_level: {
    level: 1,
    available: true,
    completed: false,
    locked: false,
    lock_reason: null,
    seconds_until_unlock: 0,
  },

  levels: [
    {
      level: 1,
      available: true,
      completed: false,
      locked: false,
      lock_reason: null,
      seconds_until_unlock: 0,
    },
    {
      level: 2,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'time',
      seconds_until_unlock: 86399,
    },
    {
      level: 3,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 172799,
    },
    {
      level: 4,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 259199,
    },
    {
      level: 5,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 345599,
    },
    {
      level: 6,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 431999,
    },
    {
      level: 7,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 518399,
    },
    {
      level: 8,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 604799,
    },
    {
      level: 9,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 691199,
    },
    {
      level: 10,
      available: false,
      completed: false,
      locked: true,
      lock_reason: 'progression',
      seconds_until_unlock: 777599,
    },
  ],

  champion: {
    unlocked: false,
  },
};

export default function WorldPreview() {
  const isLocal =
    window.location.hostname ===
      'localhost' ||
    window.location.hostname ===
      '127.0.0.1';

  if (!isLocal) {
    return (
      <div>
        Preview unavailable.
      </div>
    );
  }

  return (
    <WorldCanvas
      previewState={
        LOCAL_PREVIEW_STATE
      }
    />
  );
}
