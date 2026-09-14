import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  SEASON_1_CHAMPIONSHIPS,
} from '../data/season1';

import {
  worldAPI,
  walletAPI,
} from '../../lib/api';

import { toast } from 'sonner';

import { useAuth } from '../../context/AuthContext';

import FreeWorldLeaderboard from './FreeWorldLeaderboard';

import '../styles/world2d.css';

const CHAMPIONSHIP_HEIGHT = 3500;

/*
 * 10 normal levels + 1 Special Slot.
 *
 * Level 1 is lowest.
 * Level 10 is near the top.
 * Special Slot gets a deliberately larger
 * gap after Level 10.
 */
const CHAMPION_LEVEL_PREFIXES = [
  'Emerald',
  'River',
  'Golden',
  'Highland',
  'Royal',
  'Crystal',
  'Mystic',
  'Thunder',
  'Celestial',
  'Legend',
];

const CHAMPION_LEVEL_TITLES = [
  'Arena',
  'Crown',
  'Trial',
  'Summit',
  'Temple',
  'Colosseum',
  'Citadel',
  'Sanctum',
  'Throne',
  'Finale',
];


function formatWorldCountdown(
  targetMs,
  nowMs,
) {
  const diff =
    Math.max(
      0,
      Number(targetMs) -
        Number(nowMs),
    );

  const totalSeconds =
    Math.floor(
      diff / 1000,
    );

  const days =
    Math.floor(
      totalSeconds / 86400,
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) /
        3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60,
    );

  const seconds =
    totalSeconds % 60;

  const hh =
    String(hours).padStart(
      2,
      '0',
    );

  const mm =
    String(minutes).padStart(
      2,
      '0',
    );

  const ss =
    String(seconds).padStart(
      2,
      '0',
    );

  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}:${ss}`;
}


function worldUnlockTimeForLevel(
  backendState,
  localLevel,
) {

  if (!backendState) {
    return null;
  }


  const candidates = [
    backendState?.unlockAt,
    backendState?.unlock_at,
    backendState?.unlockTime,
    backendState?.unlock_time,

    backendState?.levels?.[
      localLevel
    ]?.unlockAt,

    backendState?.levels?.[
      localLevel
    ]?.unlock_at,

    backendState?.levels?.[
      String(localLevel)
    ]?.unlockAt,

    backendState?.levels?.[
      String(localLevel)
    ]?.unlock_at,
  ];


  const value =
    candidates.find(
      (candidate) =>
        candidate !== undefined &&
        candidate !== null &&
        candidate !== '',
    );


  if (!value) {
    return null;
  }


  const parsed =
    typeof value === 'number'
      ? value
      : Date.parse(value);


  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }


  // Support seconds timestamps as well
  // as JavaScript millisecond timestamps.
  if (
    typeof value === 'number' &&
    parsed < 100000000000
  ) {
    return parsed * 1000;
  }


  return parsed;
}
function championLevelName(championshipNumber) {
  const index =
    Math.max(
      0,
      Number(championshipNumber) - 1,
    );

  const prefix =
    CHAMPION_LEVEL_PREFIXES[
      index % 10
    ];

  const title =
    CHAMPION_LEVEL_TITLES[
      Math.floor(index / 10) % 10
    ];

  return `${prefix} ${title}`;
}

/*
 * UI DISPLAY progression:
 * Champion 1 = £100
 * Champion 2 = £150
 * Champion 3 = £200
 * ...
 * Champion 100 = £5,050
 *
 * This does NOT modify wallet/settlement logic.
 */
function championDisplayPrize(championshipNumber) {
  return (
    50 *
    (
      Number(championshipNumber) +
      1
    )
  );
}

function formatChampionPrize(championshipNumber) {
  return new Intl.NumberFormat(
    'en-GB',
    {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    },
  ).format(
    championDisplayPrize(
      championshipNumber,
    ),
  );
}
const TOTAL_PRIZE_POOL =
  Array.from(
    { length: 100 },
    (_, index) =>
      championDisplayPrize(
        index + 1,
      ),
  ).reduce(
    (total, prize) =>
      total + Number(prize || 0),
    0,
  );

const FORMATTED_TOTAL_PRIZE_POOL =
  new Intl.NumberFormat(
    'en-GB',
    {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    },
  ).format(
    TOTAL_PRIZE_POOL,
  );
const PL1000_SLOT_POSITIONS = [
  { x: 57, bottom: 4  },  // Level 1  (road ~43 → beside, right)
  { x: 22, bottom: 12 },  // Level 2  (road ~36 → beside, left)
  { x: 45, bottom: 20 },  // Level 3  (road ~31 → beside, right)
  { x: 23, bottom: 28 },  // Level 4  (road ~37 → beside, left)
  { x: 59, bottom: 36 },  // Level 5  (road ~45 → beside, right)
  { x: 43, bottom: 44 },  // Level 6  (road ~57 → beside, left)
  { x: 78, bottom: 52 },  // Level 7  (road ~64 → beside, right)
  { x: 52, bottom: 60 },  // Level 8  (road ~66 → beside, left)
  { x: 74, bottom: 68 },  // Level 9  (road ~60 → beside, right)
  { x: 36, bottom: 76 },  // Level 10 (road ~50 → beside, left)

  // Dedicated Champion Arena position.
  // This is NOT a numbered level.
  { x: 50, bottom: 90 },  // Champion Arena
];

/*
 * Centre of the black winding road at each level's height. The
 * progression avatar walks strictly along these points (the circles
 * above are attached to the SIDE of the road, leaving the centre
 * clear for the avatar to walk on the path).
 */
const PL1000_ROAD_X = [
  43, // Level 1
  36, // Level 2
  31, // Level 3
  37, // Level 4
  45, // Level 5
  57, // Level 6
  64, // Level 7
  66, // Level 8
  60, // Level 9
  50, // Level 10
  50, // Champion
];

function formatUnlockCountdown(seconds) {
  const safeSeconds = Math.max(
    0,
    Number(seconds) || 0,
  );

  const days =
    Math.floor(safeSeconds / 86400);

  const hours =
    Math.floor((safeSeconds % 86400) / 3600);

  const minutes =
    Math.floor((safeSeconds % 3600) / 60);

  const secs =
    Math.floor(safeSeconds % 60);

  const clock = [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(secs).padStart(2, '0'),
  ].join(':');

  return days > 0
    ? `${days}d ${clock}`
    : clock;
}

function globalLevelFor(
  championshipNumber,
  localLevel,
) {
  return (
    ((championshipNumber - 1) * 10) +
    localLevel
  );
}

function localLevelForGlobal(globalLevel) {
  return (
    ((globalLevel - 1) % 10) + 1
  );
}

const LEVEL_POSITIONS = [
  { x: 50, y: 94 },
  { x: 50, y: 85 },
  { x: 50, y: 76 },
  { x: 50, y: 67 },
  { x: 50, y: 58 },
  { x: 50, y: 49 },
  { x: 50, y: 40 },
  { x: 50, y: 31 },
  { x: 50, y: 22 },
  { x: 50, y: 13 },
  { x: 50, y: 4 },
];

const CHAMPIONSHIP_PRIZES = {
  1: 100,
  2: 150,
  3: 200,
  4: 250,
  5: 300,
};
const BIOMES = [
  'emerald',
  'riverlands',
  'autumn',
  'highlands',
  'enchanted',
  'coastal',
  'golden',
  'pine',
  'royal',
  'crystal',
];

function ChampionshipPrizePopup({
  championshipNumber,
}) {
  const amount =
    CHAMPIONSHIP_PRIZES[
      championshipNumber
    ];

  const revealed =
    Number.isFinite(amount);

  return (
    <div
      className={[
        'pl2d-castle-prize-popup',
        revealed
          ? 'is-revealed'
          : 'is-locked',
      ].join(' ')}
    >
      <div className="pl2d-prize-rays" />

      <small>
        CHAMPIONSHIP {championshipNumber}
      </small>

      <strong>
        {revealed
          ? `£${amount}`
          : '🔒 PRIZE LOCKED'}
      </strong>

      <span>
        {revealed
          ? 'CHAMPIONSHIP PRIZE'
          : 'Reach this Championship to reveal'}
      </span>
    </div>
  );
}
function Castle({
  championshipNumber,
  locked,
}) {
  return (
    <div
      className={[
        'pl2d-castle',
        locked ? 'is-locked' : '',
      ].join(' ')}
    >
      <div className="pl2d-castle-glow" />

      <div className="pl2d-castle-tower pl2d-castle-tower-left">
        <div className="pl2d-roof" />
        <div className="pl2d-window" />
      </div>

      <div className="pl2d-castle-main">
        <div className="pl2d-roof pl2d-roof-main" />

        <div className="pl2d-castle-crest">
          PL
        </div>

        <div className="pl2d-castle-door" />
      </div>

      <div className="pl2d-castle-tower pl2d-castle-tower-right">
        <div className="pl2d-roof" />
        <div className="pl2d-window" />
      </div>

      <div className="pl2d-castle-number">
        Castle {championshipNumber}
      </div>

    </div>
  );
}

function ForestLayer({
  side,
  amount = 15,
}) {
  return (
    <div
      className={`pl2d-forest pl2d-forest-${side}`}
      aria-hidden="true"
    >
      {Array.from({ length: amount }).map((_, index) => (
        <i
          key={index}
          style={{
            '--tree': index,
          }}
        />
      ))}
    </div>
  );
}

function Mountains() {
  return (
    <div className="pl2d-mountains" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function Clouds() {
  return (
    <div className="pl2d-clouds" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function River() {
  return (
    <div className="pl2d-river-wrap" aria-hidden="true">
      <svg
        viewBox="0 0 100 1000"
        preserveAspectRatio="none"
        className="pl2d-river-svg"
      >
        <path
          className="pl2d-river-shadow"
          d="
            M 4 1020
            C 20 900, 3 810, 14 710
            C 25 610, 7 520, 18 430
            C 29 330, 8 230, 20 130
            C 25 85, 23 35, 30 -20
          "
        />

        <path
          className="pl2d-river-water"
          d="
            M 4 1020
            C 20 900, 3 810, 14 710
            C 25 610, 7 520, 18 430
            C 29 330, 8 230, 20 130
            C 25 85, 23 35, 30 -20
          "
        />
      </svg>
    </div>
  );
}

function Road() {
  const roadPath = `
    M 50 1000
    C 49 970, 50 945, 50 920
    C 47 890, 42 860, 39 830
    C 34 800, 30 770, 31 740
    C 32 710, 36 680, 40 650
    C 46 620, 53 590, 58 560
    C 63 530, 67 500, 67 470
    C 67 440, 63 410, 58 380
    C 53 350, 47 320, 42 290
    C 37 260, 33 230, 33 200
    C 34 165, 40 135, 47 110
    C 49 75, 48 35, 47 -20
  `;

  return (
    <svg
      className="pl2d-road-svg"
      viewBox="0 0 100 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="pl2d-road-deep-shadow"
        d={roadPath}
      />

      <path
        className="pl2d-road-shadow"
        d={roadPath}
      />

      <path
        className="pl2d-road-edge"
        d={roadPath}
      />

      <path
        className="pl2d-road-main"
        d={roadPath}
      />

      <path
        className="pl2d-road-highlight"
        d={roadPath}
      />
    </svg>
  );
}
function ChampionshipSection({
  championship,
  sectionIndex,
  worldState,
  currentGlobalLevel,
  currentChampionship,
  journeyStarted,
  worldNowMs,
  onRequestUnlock,
  canUseTokens,
}) {
  const championshipNumber =
    championship.championshipNumber ??
    championship.number ??
    sectionIndex + 1;

  const startLevel =
    ((championshipNumber - 1) * 10) + 1;

  const endLevel =
    championshipNumber * 10;

  const biome =
    BIOMES[
      (championshipNumber - 1) %
      BIOMES.length
    ];

  const isCurrentChampionship =
    championshipNumber ===
    currentChampionship;

  const backendLevels =
    worldState?.levels ?? [];

  const backendLevelMap =
    useMemo(() => {
      const map = new Map();

      backendLevels.forEach(
        (item, index) => {
          const localLevel =
            Number(
              item?.level ??
              item?.level_number ??
              index + 1,
            );

          map.set(
            localLevel,
            item,
          );
        },
      );

      return map;
    }, [backendLevels]);

  const selectLevel = (
    globalLevel,
    localLevel,
    levelState,
  ) => {
    if (!isCurrentChampionship) {
      return;
    }

    // Playable level → open the game (existing behaviour).
    if (
      levelState?.available &&
      !levelState?.completed
    ) {
      window.dispatchEvent(
        new CustomEvent(
          'pl-world-level-select',
          {
            detail: {
              level: localLevel,
              globalLevel,
              championshipNumber,
              name:
                `Level ${globalLevel}`,
            },
          },
        ),
      );

      return;
    }

    // Early unlock is offered ONLY when the level is locked purely
    // by its scheduled countdown timer. Backend remains the single
    // source of truth for eligibility. We never bypass progression,
    // contest-open or previous-level rules on the client.
    const eligibleForEarlyUnlock =
      canUseTokens &&
      !levelState?.available &&
      !levelState?.completed &&
      levelState?.lock_reason === 'time' &&
      levelState?.sequence_available === true &&
      levelState?.token_unlock_enabled !== false &&
      Number(localLevel) >= 2;

    if (eligibleForEarlyUnlock) {
      onRequestUnlock?.({
        level: Number(localLevel),
        globalLevel,
        championshipNumber,
        cost: Number(
          levelState?.token_unlock_cost ?? 1,
        ),
        secondsUntilUnlock: Number(
          levelState?.seconds_until_unlock ?? 0,
        ),
        unlockAt: levelState?.unlock_at || null,
      });
    }
  };

  /*
   * 11 VISUAL POSITIONS:
   *
   * 0-9  = ten real numbered levels
   * 10   = reserved special slot
   */
  const pathItems =
    useMemo(
      () => [
        ...Array.from(
          { length: 10 },
          (_, index) => ({
            type: 'level',
            localLevel:
              index + 1,
            globalLevel:
              startLevel + index,
          }),
        ),

        {
          type: 'special',
          championshipNumber,
        },
      ],
      [
        startLevel,
        championshipNumber,
      ],
    );

  /*
   * PROGRESSION AVATAR POSITION (visual only — backend stays
   * authoritative for progress). Rendered once, on the road,
   * for the current championship after the journey has begun.
   *
   *  - Immediate next level playable  -> avatar sits AT that node.
   *  - Immediate next level time-locked -> avatar waits on the road
   *    ~60% of the way from the last completed level toward it.
   */
  const progressAvatar =
    useMemo(() => {
      if (
        !isCurrentChampionship ||
        !journeyStarted
      ) {
        return null;
      }

      const localLevel =
        localLevelForGlobal(
          currentGlobalLevel,
        );

      const slotIndex = localLevel - 1;

      const slot =
        PL1000_SLOT_POSITIONS[slotIndex];

      if (!slot) {
        return null;
      }

      const state =
        backendLevelMap.get(localLevel);

      const locked =
        Boolean(state) &&
        !state.available &&
        !state.completed;

      const waiting =
        locked &&
        state.lock_reason === 'time';

      // The avatar walks strictly on the road centre-line.
      const roadX = (i) =>
        (PL1000_ROAD_X[i] != null
          ? PL1000_ROAD_X[i]
          : PL1000_SLOT_POSITIONS[i].x);

      // Level 1 locked (any reason): wait BEFORE Level 1 — down the
      // road toward the entrance. Extrapolate backwards along the
      // road centre so the avatar stays on the path, just below it.
      if (locked && slotIndex === 0) {
        const next =
          PL1000_SLOT_POSITIONS[slotIndex + 1];

        if (next) {
          const back = 0.35;

          return {
            left:
              roadX(0) - back * (roadX(1) - roadX(0)),
            bottom:
              slot.bottom -
              back * (next.bottom - slot.bottom),
            waiting: true,
          };
        }
      }

      if (waiting && slotIndex >= 1) {
        const prev =
          PL1000_SLOT_POSITIONS[
            slotIndex - 1
          ];

        // Deterministic point ON the black road between the
        // completed level and the locked one — on the road centre.
        const fraction = 0.42;

        return {
          left:
            roadX(slotIndex - 1) +
            fraction *
              (roadX(slotIndex) - roadX(slotIndex - 1)),
          bottom:
            prev.bottom +
            fraction *
              (slot.bottom - prev.bottom),
          waiting: true,
        };
      }

      return {
        left: roadX(slotIndex),
        bottom: slot.bottom,
        waiting: false,
      };
    }, [
      isCurrentChampionship,
      journeyStarted,
      currentGlobalLevel,
      backendLevelMap,
    ]);

  return (
    <section
      className={[
        'pl1000-section',
        `pl2d-biome-${biome}`,
      ].join(' ')}
      data-championship={
        championshipNumber
      }
      style={{
        minHeight:
          `${CHAMPIONSHIP_HEIGHT}px`,
      }}
    >
      <Mountains />
      <Clouds />
      <River />

      <ForestLayer
        side="left"
        amount={12}
      />

      <ForestLayer
        side="right"
        amount={12}
      />

      <svg
        className="pl1000-road-svg"
        viewBox="0 0 100 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="pl1000-road-shadow"
          d="
            M 50 1020

            C 50 975,
              43 950,
              39 920

            C 34 890,
              30 850,
              31 800

            C 32 750,
              37 715,
              40 670

            C 47 625,
              55 590,
              58 550

            C 64 510,
              68 470,
              68 430

            C 67 390,
              63 350,
              59 310

            C 54 270,
              48 225,
              43 185

            C 38 145,
              34 120,
              34 100

            C 34 78,
              40 62,
              46 52

            C 48 40,
              49 26,
              50 -20
          "
        />

        <path
          className="pl1000-road-surface"
          d="
            M 50 1020

            C 50 975,
              43 950,
              39 920

            C 34 890,
              30 850,
              31 800

            C 32 750,
              37 715,
              40 670

            C 47 625,
              55 590,
              58 550

            C 64 510,
              68 470,
              68 430

            C 67 390,
              63 350,
              59 310

            C 54 270,
              48 225,
              43 185

            C 38 145,
              34 120,
              34 100

            C 34 78,
              40 62,
              46 52

            C 48 40,
              49 26,
              50 -20
          "
        />

        <path
          className="pl1000-road-centre"
          d="
            M 50 1020

            C 50 975,
              43 950,
              39 920

            C 34 890,
              30 850,
              31 800

            C 32 750,
              37 715,
              40 670

            C 47 625,
              55 590,
              58 550

            C 64 510,
              68 470,
              68 430

            C 67 390,
              63 350,
              59 310

            C 54 270,
              48 225,
              43 185

            C 38 145,
              34 120,
              34 100

            C 34 78,
              40 62,
              46 52

            C 48 40,
              49 26,
              50 -20
          "
        />
      </svg>

      <div className="pl1000-path">

        {pathItems.map(
          (item, index) => {
            /*
             * 11 equally spaced positions.
             *
             * Slot 1 is lowest.
             * Special slot is highest.
             */
            const slotPosition =
              PL1000_SLOT_POSITIONS[
                index
              ];

            const bottom =
              slotPosition.bottom;

            const left =
              slotPosition.x;            if (
              item.type ===
              'special'
            ) {
              const championName =
                championLevelName(
                  championshipNumber,
                );

              const championPrize =
                formatChampionPrize(
                  championshipNumber,
                );

              return (
                <button
                  key={
                    `special-${championshipNumber}`
                  }
                  type="button"
                  className={[
                    'pl1000-special-slot',
                    'pl1000-champion-level',
                  ].join(' ')}
                  style={{
                    left:
                      `${left}%`,
                    bottom:
                      `${bottom}%`,
                  }}
                  data-special-slot={
                    championshipNumber
                  }
                  data-championship={
                    championshipNumber
                  }
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent(
                        'pl-world-champion-select',
                        {
                          detail: {
                            championshipNumber,
                            championStage:
                              championshipNumber,
                            name:
                              championName,
                            prize:
                              championDisplayPrize(
                                championshipNumber,
                              ),
                          },
                        },
                      ),
                    );
                  }}
                  aria-label={
                    `Championship ${championshipNumber} ${championName}`
                  }
                >
                  <span className="pl1000-champion-rays" />

                  <span className="pl1000-special-node">
                    <span className="pl1000-champion-crown">
                      ♛
                    </span>

                    <b>
                      {championshipNumber}
                    </b>
                  </span>

                  <strong className="pl1000-champion-name">
                    {championName}
                  </strong>

                  <span className="pl1000-champion-prize">
                    {championPrize}
                  </span>

                  <small>
                    CHAMPION LEVEL
                  </small>
                </button>
              );
            }


            const {
              globalLevel,
              localLevel,
            } = item;

            const backendState =
              isCurrentChampionship
                ? backendLevelMap.get(
                    localLevel,
                  )
                : null;

            const completed =
              Boolean(
                backendState
                  ?.completed,
              );

            const available =
              Boolean(
                backendState
                  ?.available,
              );

            const isCurrent =
              isCurrentChampionship &&
              globalLevel ===
                currentGlobalLevel;

            const locked =
              !completed &&
              !available;

            const levelUnlockMs =
              worldUnlockTimeForLevel(
                backendState,
                localLevel,
              );

            const hasFutureUnlock =
              locked &&
              Number.isFinite(
                levelUnlockMs,
              ) &&
              levelUnlockMs >
                worldNowMs;

            // Only the user's IMMEDIATE next progression level
            // (isCurrent) ever shows a countdown. Future locked
            // levels stay locked but display no timer.
            const levelCountdown =
              hasFutureUnlock && isCurrent
                ? formatWorldCountdown(
                    levelUnlockMs,
                    worldNowMs,
                  )
                : null;

            const canEarlyUnlock =
              canUseTokens &&
              isCurrent &&
              locked &&
              backendState?.lock_reason === 'time' &&
              backendState?.sequence_available === true &&
              backendState?.token_unlock_enabled !== false &&
              Number(localLevel) >= 2;

            return (
              <button
                key={
                  `level-${globalLevel}`
                }
                id={
                  `pl2d-level-${globalLevel}`
                }
                type="button"
                data-testid={
                  `free-world-level-${globalLevel}`
                }
                className={[
                  'pl1000-level',
                  completed
                    ? 'is-completed'
                    : '',
                  isCurrent
                    ? 'is-current'
                    : '',
                  available
                    ? 'is-playable'
                    : '',
                  locked
                    ? 'is-locked'
                    : '',
                  canEarlyUnlock
                    ? 'is-unlockable'
                    : '',
                ].join(' ')}
                style={{
                  left:
                    `${left}%`,
                  bottom:
                    `${bottom}%`,
                }}
                onClick={() =>
                  selectLevel(
                    globalLevel,
                    localLevel,
                    backendState,
                  )
                }
                aria-label={
                  `Level ${globalLevel}`
                }
              >
                <span className="pl1000-node">
                  <span className="pl1000-node-num">
                    {completed
                      ? '✓'
                      : globalLevel}
                  </span>

                  {levelCountdown && (
                    <span
                      className="pl1000-node-timer"
                      data-testid={
                        `free-world-level-timer-${globalLevel}`
                      }
                    >
                      {levelCountdown}
                    </span>
                  )}
                </span>

                <small>
                  Level {globalLevel}
                </small>

                {locked && (
                  <span className="pl1000-lock">
                    🔒
                  </span>
                )}

                {canEarlyUnlock && (
                  <span
                    className="pl2d-level-unlock-hint"
                    data-testid={
                      `free-world-early-unlock-hint-${globalLevel}`
                    }
                  >
                    <b>TAP TO</b>
                    <strong>
                      EARLY UNLOCK
                    </strong>
                  </span>
                )}

                {isCurrent &&
                  available &&
                  !completed && (
                    <span className="pl1000-play">
                      PLAY
                    </span>
                  )}
              </button>
            );
          },
        )}

        {progressAvatar && (
          <div
            className={[
              'pl1000-progress-avatar',
              progressAvatar.waiting
                ? 'is-waiting'
                : 'is-at-level',
            ].join(' ')}
            style={{
              left: `${progressAvatar.left}%`,
              bottom: `${progressAvatar.bottom}%`,
            }}
            data-testid="free-world-avatar"
            data-avatar-state={
              progressAvatar.waiting
                ? 'waiting'
                : 'at-level'
            }
            aria-label="Your avatar"
          >
            <span className="pl1000-avatar-head" />

            <span className="pl1000-avatar-body">
              PL
            </span>

            <b>YOU</b>

            {progressAvatar.waiting && (
              <span className="pl1000-avatar-waiting">
                WAITING
              </span>
            )}
          </div>
        )}

      </div>

      <div className="pl1000-range">
        <small>
          CHAMPIONSHIP {championshipNumber}
        </small>

        <span>
          LEVELS {startLevel}–{endLevel}
        </span>
      </div>
    </section>
  );
}
function SeasonStart({
  showAvatar,
  journeyWalking,
  onStartJourney,
}) {
  return (
    <div
      id="pl2d-season-start"
      className="pl2d-season-start"
    >
      <div
        className="pl2d-entrance-mountains"
        aria-hidden="true"
      >
        <i />
        <i />
        <i />
        <i />
      </div>

      <div
        className="pl2d-entrance-rays"
        aria-hidden="true"
      />

      <div className="pl2d-entrance-heading">
        <div className="pl2d-entrance-crest">
          <span>PL</span>
        </div>

        <small>
          WELCOME TO
        </small>

        <strong>
          PRIZE LEAGUE
        </strong>

        <span>
          SEASON 1
        </span>

        <p>
          1,000 Levels • 100 Championships • One Journey
        </p>
      </div>

      <div className="pl2d-grand-gate">
        <div className="pl2d-gate-ground-road" />

        <div className="pl2d-gate-wall left-wall" />
        <div className="pl2d-gate-wall right-wall" />

        <div className="pl2d-gate-tower left-tower">
          <div className="pl2d-tower-crown" />
          <div className="pl2d-tower-window" />
          <div className="pl2d-tower-banner">
            <span>PL</span>
          </div>

          <div className="pl2d-torch left-torch">
            <i />
          </div>
        </div>

        <div className="pl2d-gate-tower right-tower">
          <div className="pl2d-tower-crown" />
          <div className="pl2d-tower-window" />
          <div className="pl2d-tower-banner">
            <span>PL</span>
          </div>

          <div className="pl2d-torch right-torch">
            <i />
          </div>
        </div>

        <div className="pl2d-gate-arch">
          <div className="pl2d-gate-arch-title">
            PRIZE LEAGUE
          </div>

          <div className="pl2d-gate-arch-subtitle">
            YOUR JOURNEY BEGINS HERE
          </div>
        </div>

        <div className="pl2d-open-gate left-gate">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className="pl2d-open-gate right-gate">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className="pl2d-gate-light" />

        {showAvatar && (
          <div
            className={[
              'pl2d-gate-avatar',
              journeyWalking
                ? 'is-walking'
                : '',
            ].join(' ')}
            aria-label="Your avatar"
          >
            <span className="pl2d-gate-avatar-shadow" />

            <span className="pl2d-gate-avatar-head" />

            <span className="pl2d-gate-avatar-body">
              PL
            </span>

            <span className="pl2d-gate-avatar-arm left" />
            <span className="pl2d-gate-avatar-arm right" />

            <span className="pl2d-gate-avatar-leg left" />
            <span className="pl2d-gate-avatar-leg right" />

            <small>YOU</small>
          </div>
        )}

        <div className="pl2d-gate-path">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <button
        type="button"
        className={[
          'pl2d-start-button',
          'pl2d-start-button-premium',
          journeyWalking
            ? 'is-walking'
            : '',
        ].join(' ')}
        disabled={journeyWalking}
        onClick={() => {
          if (journeyWalking) {
            return;
          }

          onStartJourney?.();
        }}
      >
        <span className="pl2d-button-star">
          ★
        </span>

        START YOUR JOURNEY

        <span className="pl2d-button-arrow">
          ↑
        </span>
      </button>

      <div className="pl2d-start-level-indicator">
        <span>START</span>

        <strong>
          LEVEL 1
        </strong>

        <small>
          Begin Championship 1
        </small>
      </div>

    </div>
  );
}
function SeasonFinish() {
  return (
    <div className="pl2d-season-finish">
      <div className="pl2d-finish-crown">
        ♛
      </div>

      <div className="pl2d-finish-title">
        SEASON 1
      </div>

      <div className="pl2d-finish-subtitle">
        LEVEL 1000 • GRAND CHAMPION
      </div>

    </div>
  );
}

export default function WorldCanvas({
  previewState = null,
}) {

  const { user } = useAuth();

  const [walletBalance, setWalletBalance] =
    useState(null);

  const [unlockModal, setUnlockModal] =
    useState(null);

  const [unlockBusy, setUnlockBusy] =
    useState(false);

  const [worldNowMs, setWorldNowMs] =
    useState(() => Date.now());

  useEffect(() => {
    const timerId =
      window.setInterval(
        () => {
          setWorldNowMs(Date.now());
        },
        1000,
      );

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const [navBusy, setNavBusy] =
    useState(false);

  const [
    showFreeLeaderboard,
    setShowFreeLeaderboard,
  ] = useState(false);

  const viewportRef =
    useRef(null);

  const initialScrollDoneRef =
    useRef(false);

  const [
    initialPositionReady,
    setInitialPositionReady,
  ] = useState(false);

  const journeyTimerRef =
    useRef(null);

  const [zoom, setZoom] =
    useState(1);

  const [worldState, setWorldState] =
    useState(previewState);

  const [stateLoading, setStateLoading] =
    useState(!previewState);

  const [stateError, setStateError] =
    useState('');

  const [countdowns, setCountdowns] =
    useState(() => {
      const initial = {};

      (
        previewState?.levels ?? []
      ).forEach(
        (levelState, index) => {
          const localLevel =
            Number(
              levelState?.level ??
              levelState?.level_number ??
              index + 1,
            );

          initial[localLevel] =
            Math.max(
              0,
              Number(
                levelState
                  ?.seconds_until_unlock ??
                0,
              ),
            );
        },
      );

      return initial;
    });

  const [journeyStarted, setJourneyStarted] =
    useState(false);

  const [journeyWalking, setJourneyWalking] =
    useState(false);

  const orderedChampionships =
    useMemo(
      () =>
        [...SEASON_1_CHAMPIONSHIPS]
          .sort((a, b) => {
            const aNumber =
              a.championshipNumber ??
              a.number ??
              0;

            const bNumber =
              b.championshipNumber ??
              b.number ??
              0;

            return bNumber - aNumber;
          }),
      [],
    );

  const currentChampionship =
    Math.max(
      1,
      Math.min(
        100,
        Number(
          worldState?.progress
            ?.champion_stage ??
          1,
        ),
      ),
    );

  const currentLocalLevel =
    Math.max(
      1,
      Math.min(
        10,
        Number(
          worldState?.progress
            ?.current_level ??
          1,
        ),
      ),
    );

  const currentGlobalLevel =
    globalLevelFor(
      currentChampionship,
      currentLocalLevel,
    );

  const completedLevels =
    worldState?.progress
      ?.completed_levels ??
    [];

  /*
   * Only a completely new World user
   * begins outside the entrance gate.
   *
   * Returning users load directly at
   * their current actual level.
   */
  const isAtJourneyStart =
    Boolean(worldState) &&
    currentChampionship === 1 &&
    currentLocalLevel === 1 &&
    completedLevels.length === 0 &&
    !journeyStarted;

  /*
   * Returning users (anyone past the brand-new Level-1 start) must
   * immediately have a visible avatar. The gate "start journey"
   * animation only runs for first-time users, so without this the
   * avatar would vanish on every page refresh once Level 1 is done.
   */
  useEffect(() => {
    if (
      worldState &&
      !isAtJourneyStart &&
      !journeyStarted
    ) {
      setJourneyStarted(true);
    }
  }, [
    worldState,
    isAtJourneyStart,
    journeyStarted,
  ]);

  const setStateAndCountdowns =
    (response) => {
      setWorldState(response);

      const next = {};

      (
        response?.levels ?? []
      ).forEach(
        (levelState, index) => {
          const localLevel =
            Number(
              levelState?.level ??
              levelState?.level_number ??
              index + 1,
            );

          next[localLevel] =
            Math.max(
              0,
              Number(
                levelState
                  ?.seconds_until_unlock ??
                0,
              ),
            );
        },
      );

      setCountdowns(next);
    };

  const refreshBalance = React.useCallback(() => {
    if (!user) {
      return;
    }

    walletAPI
      .me()
      .then((wallet) => {
        setWalletBalance(
          Number(
            wallet?.tokens ??
              Math.round(
                Number(wallet?.balance ?? 0),
              ),
          ),
        );
      })
      .catch(() => {
        /* Guests / transient errors: keep last known value. */
      });
  }, [user]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Reload authoritative world state + balance whenever a level
  // attempt or a token action reports progress may have changed.
  useEffect(() => {
    const onProgressRefresh = () => {
      if (!previewState) {
        worldAPI
          .state()
          .then(setStateAndCountdowns)
          .catch(() => {});
      }

      refreshBalance();
    };

    window.addEventListener(
      'pl-world-progress-refresh',
      onProgressRefresh,
    );

    return () => {
      window.removeEventListener(
        'pl-world-progress-refresh',
        onProgressRefresh,
      );
    };
  }, [previewState, refreshBalance]);

  const confirmEarlyUnlock = async () => {
    if (!unlockModal || unlockBusy) {
      return;
    }

    const level = Number(unlockModal.level);

    setUnlockBusy(true);

    try {
      const response =
        await worldAPI.reserveTokenUnlock(level);

      const cost = Number(
        response?.token_cost ??
          unlockModal.cost ??
          0,
      );

      const remaining = Number(
        response?.tokens_remaining ?? 0,
      );

      setWalletBalance(remaining);

      // Pull fresh authoritative state so the timer lock clears.
      if (!previewState) {
        try {
          const fresh = await worldAPI.state();
          setStateAndCountdowns(fresh);
        } catch (error) {
          /* Best effort; server stays authoritative. */
        }
      }

      toast.success('Level unlocked', {
        description:
          `${cost} Tokens used \u2022 ${remaining} remaining`,
      });

      setUnlockModal(null);

      // Refresh the visible header token balance. The world state
      // was already re-fetched above, so the timer lock clears and
      // the avatar moves to the now-playable level. We deliberately
      // do NOT auto-open the game (that caused a redirect flash);
      // the level simply becomes playable for the user to tap.
      window.dispatchEvent(
        new CustomEvent(
          'pl-world-progress-refresh',
        ),
      );
    } catch (error) {
      const detail =
        error?.response?.data?.detail;

      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message ||
            detail?.msg ||
            'Unable to unlock this level.';

      if (
        error?.response?.status === 400 &&
        /insufficient/i.test(message)
      ) {
        // Keep the modal open; it already shows Top Up.
        refreshBalance();
      } else {
        toast.error('Could not unlock level', {
          description: message,
        });
      }
    } finally {
      setUnlockBusy(false);
    }
  };

  /*
   * Production:
   * real server-authoritative state.
   *
   * localhost /world-preview:
   * isolated previewState supplied by
   * WorldPreview.jsx.
   */
  useEffect(() => {
    let cancelled = false;

    if (previewState) {
      setStateAndCountdowns(
        previewState,
      );

      setStateLoading(false);
      setStateError('');

      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      try {
        setStateLoading(true);
        setStateError('');

        const response =
          await worldAPI.state();

        if (cancelled) {
          return;
        }

        setStateAndCountdowns(
          response,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        const raw =
          error?.response
            ?.data?.detail;

        setStateError(
          typeof raw === 'string'
            ? raw
            : raw?.message ||
              raw?.msg ||
              'Unable to load your World progress.',
        );
      } finally {
        if (!cancelled) {
          setStateLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [previewState]);

  /*
   * Live countdown display.
   *
   * Production refreshes the server
   * exactly when a timer reaches zero.
   */
  useEffect(() => {
    if (!worldState) {
      return undefined;
    }

    const interval =
      window.setInterval(() => {
        let reachedZero = false;

        setCountdowns(
          (previous) => {
            const next = {
              ...previous,
            };

            Object.keys(next)
              .forEach((key) => {
                const before =
                  Number(
                    next[key] ?? 0,
                  );

                if (before <= 0) {
                  return;
                }

                const after =
                  Math.max(
                    0,
                    before - 1,
                  );

                next[key] = after;

                if (
                  before > 0 &&
                  after === 0
                ) {
                  reachedZero = true;
                }
              });

            return next;
          },
        );

        if (
          reachedZero &&
          !previewState
        ) {
          worldAPI
            .state()
            .then(
              setStateAndCountdowns,
            )
            .catch(() => {
              /*
               * Server stays authoritative.
               * Do not fake-unlock locally.
               */
            });
        }
      }, 1000);

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    worldState,
    previewState,
  ]);

  /*
   * INITIAL POSITION
   *
   * New user:
   * immediately show Season entrance.
   *
   * Returning user:
   * directly show their current node.
   *
   * Never begin at Level 1000.
   */
  useEffect(() => {
    if (
      !worldState ||
      initialScrollDoneRef.current
    ) {
      return;
    }

    const viewport =
      viewportRef.current;

    if (!viewport) {
      return;
    }

    const positionWorld = () => {
      if (isAtJourneyStart) {
        viewport.scrollTop =
          Math.max(
            0,
            viewport.scrollHeight -
            viewport.clientHeight,
          );

        initialScrollDoneRef.current =
        true;

      setInitialPositionReady(
        true,
      );

        return;
      }

      const node =
        document.getElementById(
          `pl2d-level-${currentGlobalLevel}`,
        );

      if (!node) {
        return;
      }

      node.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      });

      initialScrollDoneRef.current =
        true;

      setInitialPositionReady(
        true,
      );
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(
        positionWorld,
      );
    });
  }, [
    worldState,
    currentGlobalLevel,
    isAtJourneyStart,
  ]);

  /*
   * START YOUR JOURNEY
   *
   * Avatar begins OUTSIDE gate.
   * Click button.
   * Avatar walks through gate.
   * World slowly travels to Level 1.
   * Avatar then appears at Level 1.
   *
   * Game does NOT auto-open.
   * User can press PLAY at Level 1.
   */

  /*
   * HOME RETURNS TO CURRENT PROGRESS
   *
   * Not started:
   * return to Season 1 entrance.
   *
   * Started:
   * return to the user's current saved level.
   *
   * No API request.
   * No progress reset.
   * No page navigation.
   */
  useEffect(() => {

    const positionNodeInViewport =
      (
        viewport,
        node,
      ) => {

        if (
          !viewport ||
          !node
        ) {
          return;
        }

        const viewportRect =
          viewport.getBoundingClientRect();

        const nodeRect =
          node.getBoundingClientRect();

        const relativeTop =
          nodeRect.top -
          viewportRect.top;

        const targetTop =
          viewport.scrollTop +
          relativeTop -
          (
            viewport.clientHeight / 2
          ) +
          (
            nodeRect.height / 2
          );

        viewport.scrollTo({
          top:
            Math.max(
              0,
              targetTop,
            ),

          behavior:
            'smooth',
        });
      };


    const onWorldHome = () => {

      const viewport =
        viewportRef.current;

      if (!viewport) {
        return;
      }


      requestAnimationFrame(() => {

        /*
         * Brand-new user:
         * HOME goes back to Season 1 entrance.
         */
        if (isAtJourneyStart) {

          const seasonStart =
            document.getElementById(
              'pl2d-season-start',
            );

          if (seasonStart) {

            positionNodeInViewport(
              viewport,
              seasonStart,
            );

            return;
          }


          /*
           * Fallback only if entrance node
           * cannot be found.
           */
          viewport.scrollTo({
            top:
              Math.max(
                0,
                viewport.scrollHeight -
                viewport.clientHeight,
              ),

            behavior:
              'smooth',
          });

          return;
        }


        /*
         * Existing user:
         * HOME returns to their actual
         * current progression level.
         */
        const currentNode =
          document.getElementById(
            `pl2d-level-${currentGlobalLevel}`,
          );

        if (!currentNode) {
          return;
        }

        positionNodeInViewport(
          viewport,
          currentNode,
        );

      });

    };


    window.addEventListener(
      'pl-world-home',
      onWorldHome,
    );


    return () => {

      window.removeEventListener(
        'pl-world-home',
        onWorldHome,
      );

    };

  }, [
    currentGlobalLevel,
    isAtJourneyStart,
  ]);

  const startJourney = () => {
    if (
      journeyWalking ||
      !isAtJourneyStart
    ) {
      return;
    }

    const viewport =
      viewportRef.current;

    const levelOne =
      document.getElementById(
        'pl2d-level-1',
      );

    if (
      !viewport ||
      !levelOne
    ) {
      return;
    }

    setJourneyWalking(true);

    /*
     * Allow the avatar's walking
     * animation to begin first.
     */
    window.setTimeout(() => {
      levelOne.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 900);

    journeyTimerRef.current =
      window.setTimeout(() => {
        setJourneyWalking(false);
        setJourneyStarted(true);

        requestAnimationFrame(() => {
          levelOne.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        });
      }, 5600);
  };

  useEffect(() => {
    return () => {
      if (
        journeyTimerRef.current
      ) {
        window.clearTimeout(
          journeyTimerRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    const zoomIn = () =>
      setZoom((value) =>
        Math.min(
          1.2,
          value + 0.1,
        ),
      );

    const zoomOut = () =>
      setZoom((value) =>
        Math.max(
          0.72,
          value - 0.1,
        ),
      );

    const overview = () => {
      setZoom(0.78);

      const node =
        document.getElementById(
          `pl2d-level-${currentGlobalLevel}`,
        );

      if (node) {
        node.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    };

    window.addEventListener(
      'pl-world-zoom-in',
      zoomIn,
    );

    window.addEventListener(
      'pl-world-zoom-out',
      zoomOut,
    );

    window.addEventListener(
      'pl-world-overview',
      overview,
    );

    return () => {
      window.removeEventListener(
        'pl-world-zoom-in',
        zoomIn,
      );

      window.removeEventListener(
        'pl-world-zoom-out',
        zoomOut,
      );

      window.removeEventListener(
        'pl-world-overview',
        overview,
      );
    };
  }, [currentGlobalLevel]);

  const navigateTo = (path) => {
    if (
      navBusy ||
      !path ||
      location.pathname === path
    ) {
      return;
    }

    setNavBusy(true);

    navigate(path);

    window.setTimeout(
      () => {
        setNavBusy(false);
      },
      300,
    );
  };

  const goToFreeContests = () => {
    if (showFreeLeaderboard) {
      setShowFreeLeaderboard(false);
      return;
    }
    const isLocalPreview =
      window.location.hostname ===
        'localhost' ||
      window.location.hostname ===
        '127.0.0.1';

    navigateTo(
      isLocalPreview
        ? '/world-preview'
        : '/world',
    );
  };

  const goToPaidContests = () => {
    navigateTo('/');
  };

  const goToLeaderboard = () => {
    setShowFreeLeaderboard(true);
  };

  const freeHomeActive =
    location.pathname === '/world' ||
    location.pathname ===
      '/world-preview';

  const paidActive =
    location.pathname === '/';

  const leaderboardActive =
    showFreeLeaderboard;
  return (
    <div
      ref={viewportRef}
      className={[
        'pl2d-viewport',
        initialPositionReady
          ? 'is-position-ready'
          : 'is-positioning',
      ].join(' ')}
    >
      <div className="pl2d-world-header pl2d-world-header-final">

        <div className="pl2d-final-brand">
          <strong>
            <span>PRIZE</span>
            <span>LEAGUE</span>
          </strong>

          <small>
            <span>1,000 LEVELS</span>
            <span>100 CHAMPIONSHIPS</span>
          </small>
        </div>

        <div className="pl2d-total-prize">
          <small>TOTAL PRIZE POOL</small>
          <strong>{FORMATTED_TOTAL_PRIZE_POOL}</strong>
        </div>

      </div>

      {stateLoading && (
        <div className="pl2d-progress-status">
          Loading your position…
        </div>
      )}

      {stateError && (
        <div className="pl2d-progress-status is-error">
          {stateError}
        </div>
      )}

      {worldState &&
        !isAtJourneyStart && (
          <div className="pl2d-current-progress-card">
            <small>
              YOUR POSITION
            </small>

            <strong>
              CHAMPIONSHIP {currentChampionship}
            </strong>

            <span>
              LEVEL {currentGlobalLevel}
            </span>
          </div>
        )}

      {journeyWalking && (
        <div
          className="pl2d-travelling-avatar"
          aria-label="Walking to Level 1"
        >
          <span className="pl2d-travel-shadow" />

          <span className="pl2d-travel-head" />

          <span className="pl2d-travel-body">
            PL
          </span>

          <span className="pl2d-travel-arm left" />
          <span className="pl2d-travel-arm right" />

          <span className="pl2d-travel-leg left" />
          <span className="pl2d-travel-leg right" />

          <small>
            YOU
          </small>
        </div>
      )}

      <div
        className="pl2d-world"
        style={{
          '--world-zoom': zoom,
        }}
      >
        <SeasonFinish />

        {orderedChampionships.map(
          (
            championship,
            index,
          ) => (
            <ChampionshipSection
              key={
                championship.id ??
                championship
                  .championshipNumber ??
                index
              }
              championship={
                championship
              }
              sectionIndex={
                orderedChampionships
                  .length -
                index -
                1
              }
              worldState={
                worldState
              }
              countdowns={
                countdowns
              }
              currentGlobalLevel={
                currentGlobalLevel
              }
              currentChampionship={
                currentChampionship
              }
              journeyStarted={
                journeyStarted
              }
              worldNowMs={worldNowMs}
              canUseTokens={Boolean(user)}
              onRequestUnlock={
                setUnlockModal
              }
            />
          ),
        )}

        <SeasonStart
          showAvatar={
            isAtJourneyStart &&
            !journeyWalking
          }
          journeyWalking={
            journeyWalking
          }
          onStartJourney={
            startJourney
          }
        />
      </div>
      
      <FreeWorldLeaderboard
        open={showFreeLeaderboard}
        onClose={() => {
          setShowFreeLeaderboard(false);
        }}
      />
<nav
        className={[
          'pl2d-bottom-nav',
          navBusy
            ? 'is-busy'
            : '',
        ].join(' ')}
        aria-label="Prize League primary navigation"
      >
        <button
          type="button"
          className={[
            'pl2d-bottom-token',
            freeHomeActive
              ? 'is-active'
              : '',
          ].join(' ')}
          onClick={
            goToFreeContests
          }
          disabled={navBusy}
          aria-current={
            freeHomeActive
              ? 'page'
              : undefined
          }
        >
          <span
            className="pl2d-token-icon"
            aria-hidden="true"
          >
            ⌂
          </span>

          <strong>
            HOME
          </strong>

          <small>
            FREE CONTESTS
          </small>
        </button>

        <button
          type="button"
          className={[
            'pl2d-bottom-token',
            paidActive
              ? 'is-active'
              : '',
          ].join(' ')}
          onClick={
            goToPaidContests
          }
          disabled={navBusy}
          aria-current={
            paidActive
              ? 'page'
              : undefined
          }
        >
          <span
            className="pl2d-token-icon"
            aria-hidden="true"
          >
            ♛
          </span>

          <strong>
            PAID CONTESTS
          </strong>

          <small>
            WIN PRIZES
          </small>
        </button>

        <button
          type="button"
          className={[
            'pl2d-bottom-token',
            leaderboardActive
              ? 'is-active'
              : '',
          ].join(' ')}
          onClick={
            goToLeaderboard
          }
          disabled={navBusy}
          aria-current={
            leaderboardActive
              ? 'page'
              : undefined
          }
        >
          <span
            className="pl2d-token-icon"
            aria-hidden="true"
          >
            ♜
          </span>

          <strong>
            LEADERBOARD
          </strong>

          <small>
            TOP PLAYERS
          </small>
        </button>
      </nav>

      {unlockModal && (
        <div
          className="pl2d-token-modal-backdrop"
          data-testid="early-unlock-modal"
          onClick={() => {
            if (!unlockBusy) {
              setUnlockModal(null);
            }
          }}
        >
          <section
            className="pl2d-token-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="pl2d-token-modal-kicker">
              EARLY UNLOCK WITH TOKENS
            </div>

            <h2>
              Level {unlockModal.globalLevel}
            </h2>

            <p className="pl2d-token-modal-lead">
              Skip the wait and open this level now.
              Your progress rules stay the same — this
              only removes the countdown timer.
            </p>

            <div className="pl2d-token-modal-rows">
              <div>
                <span>Unlocks naturally in</span>
                <strong data-testid="early-unlock-natural-time">
                  {formatUnlockCountdown(
                    Number(
                      unlockModal.secondsUntilUnlock ||
                        0,
                    ),
                  )}
                </strong>
              </div>

              <div>
                <span>Token cost</span>
                <strong data-testid="early-unlock-cost">
                  {unlockModal.cost} 🪙
                </strong>
              </div>

              <div>
                <span>Current balance</span>
                <strong data-testid="early-unlock-current-balance">
                  {walletBalance === null
                    ? '…'
                    : `${walletBalance} 🪙`}
                </strong>
              </div>

              <div>
                <span>Balance after unlock</span>
                <strong data-testid="early-unlock-remaining-balance">
                  {walletBalance === null
                    ? '…'
                    : `${Math.max(
                        0,
                        walletBalance -
                          unlockModal.cost,
                      )} 🪙`}
                </strong>
              </div>
            </div>

            {walletBalance !== null &&
            walletBalance < unlockModal.cost ? (
              <>
                <div
                  className="pl2d-token-modal-insufficient"
                  data-testid="early-unlock-insufficient"
                >
                  Not enough tokens
                </div>

                <div className="pl2d-token-modal-actions">
                  <button
                    type="button"
                    className="pl2d-token-modal-cancel"
                    data-testid="early-unlock-cancel"
                    onClick={() =>
                      setUnlockModal(null)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="pl2d-token-modal-confirm"
                    data-testid="early-unlock-topup"
                    onClick={() =>
                      navigate(
                        '/my-account/wallet',
                      )
                    }
                  >
                    Top Up Wallet
                  </button>
                </div>
              </>
            ) : (
              <div className="pl2d-token-modal-actions">
                <button
                  type="button"
                  className="pl2d-token-modal-cancel"
                  data-testid="early-unlock-cancel"
                  disabled={unlockBusy}
                  onClick={() =>
                    setUnlockModal(null)
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="pl2d-token-modal-confirm"
                  data-testid="early-unlock-confirm"
                  disabled={unlockBusy}
                  onClick={confirmEarlyUnlock}
                >
                  {unlockBusy
                    ? 'Unlocking…'
                    : 'Unlock Now'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

    </div>
  );
}

















