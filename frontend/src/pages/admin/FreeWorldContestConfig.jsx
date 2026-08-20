import {
  Copy,
  Gamepad2,
  ShieldCheck,
  Timer,
  Unlock,
} from 'lucide-react';

import { Button } from '../../components/ui/button';


const DEFAULT_TARGETS = [
  20,
  25,
  30,
  35,
  40,
  45,
  50,
  60,
  75,
  90,
];

const DEFAULT_TIMES = [
  25,
  27,
  30,
  32,
  35,
  38,
  42,
  48,
  55,
  65,
];

const DEFAULT_NAMES = [
  'Village Gate',
  'Market Square',
  'Royal Farm',
  'Riverside Trail',
  "King's Bridge",
  'Whispering Woods',
  'Ancient Ruins',
  'Watchtower Pass',
  'Castle Crossing',
  'Royal Gate',
];


export function buildLevelDrafts(
  contest,
) {
  const existing =
    Array.isArray(
      contest?.levels_config,
    )
      ? contest.levels_config
      : [];

  return Array.from(
    {
      length: 10,
    },
    (_, index) => {
      const level =
        index + 1;

      const found =
        existing.find(
          row =>
            Number(row.level) ===
            level,
        ) || {};

      return {
        level,

        arena:
          Number(
            found.arena || 1,
          ),

        location_name:
          found.location_name ||
          DEFAULT_NAMES[index],

        game_id:
          found.game_id ||
          contest?.game_id ||
          '',

        game_config: {
          target_number:
            Number(
              found
                ?.game_config
                ?.target_number ??
              DEFAULT_TARGETS[
                index
              ],
            ),
        },

        time_limit_seconds:
          Number(
            found
              .time_limit_seconds ??
            DEFAULT_TIMES[
              index
            ],
          ),

        move_limit:
          found.move_limit ?? '',

        initial_free_attempts:
          Number(
            found
              .initial_free_attempts ??
            (
              level <= 5
                ? 3
                : 1
            ),
          ),

        demo_enabled:
          found.demo_enabled ??
          true,

        demo_skippable:
          found.demo_skippable ??
          true,

        token_retry_enabled:
          found
            .token_retry_enabled ??
          true,

        token_retry_cost:
          Number(
            found
              .token_retry_cost ??
            1,
          ),

        token_unlock_enabled:
          found
            .token_unlock_enabled ??
          true,

        token_unlock_cost:
          Number(
            found
              .token_unlock_cost ??
            1,
          ),

        unlock_after_days:
          Number(
            found
              .unlock_after_days ??
            (
              (level - 1) * 2
            ),
          ),
      };
    },
  );
}


export function buildChampionDraft(
  contest,
) {
  const existing =
    contest?.champion_config ||
    {};

  return {
    name:
      existing.name ||
      'Champion Challenge',

    game_id:
      existing.game_id ||
      contest?.game_id ||
      '',

    game_config: {
      target_number:
        Number(
          existing
            ?.game_config
            ?.target_number ??
          contest
            ?.game_config
            ?.target_number ??
          100,
        ),
    },

    time_limit_seconds:
      Number(
        existing
          .time_limit_seconds ??
        contest
          ?.game_config
          ?.time_limit_seconds ??
        75,
      ),

    move_limit:
      existing.move_limit ??
      '',

    demo_enabled:
      existing.demo_enabled ??
      true,

    demo_skippable:
      existing.demo_skippable ??
      true,

    initial_attempts:
      Number(
        existing
          .initial_attempts ??
        3,
      ),
  };
}


function Toggle({
  checked,
  onChange,
  disabled,
  label,
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={event =>
          onChange(
            event.target.checked,
          )
        }
      />

      {label}
    </label>
  );
}


export default function FreeWorldContestConfig({
  edit,
  setEdit,
  disabled,
}) {
  const levels =
    edit.levels_config || [];

  const champion =
    edit.champion_config || {};

  const updateLevel = (
    level,
    patch,
  ) => {
    setEdit(current => ({
      ...current,

      levels_config:
        current.levels_config.map(
          row =>
            Number(row.level) ===
            Number(level)
              ? {
                  ...row,
                  ...patch,
                }
              : row,
        ),
    }));
  };

  const updateLevelGameConfig = (
    level,
    patch,
  ) => {
    setEdit(current => ({
      ...current,

      levels_config:
        current.levels_config.map(
          row =>
            Number(row.level) ===
            Number(level)
              ? {
                  ...row,

                  game_config: {
                    ...(row
                      .game_config ||
                      {}),

                    ...patch,
                  },
                }
              : row,
        ),
    }));
  };

  const updateChampion = patch => {
    setEdit(current => ({
      ...current,

      champion_config: {
        ...current
          .champion_config,

        ...patch,
      },
    }));
  };

  const updateChampionGameConfig =
    patch => {
      setEdit(current => ({
        ...current,

        champion_config: {
          ...current
            .champion_config,

          game_config: {
            ...(
              current
                .champion_config
                ?.game_config ||
              {}
            ),

            ...patch,
          },
        },
      }));
    };

  const applyChampionGameToLevels =
    () => {
      const gameId =
        champion.game_id || '';

      setEdit(current => ({
        ...current,

        game_id:
          gameId,

        levels_config:
          current.levels_config.map(
            row => ({
              ...row,
              game_id:
                gameId,
            }),
          ),
      }));
    };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

      <div className="p-5 border-b border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">

          <div>
            <div className="flex items-center gap-2 text-[#6C2BFF] text-xs font-extrabold uppercase tracking-widest">
              <Gamepad2 className="w-4 h-4" />
              Progression configuration
            </div>

            <h2 className="font-display font-extrabold text-xl mt-1">
              10 Levels + Champion Challenge
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Champion Challenge is separate.
              It is not Level 11.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={
              disabled ||
              !champion.game_id
            }
            onClick={
              applyChampionGameToLevels
            }
          >
            <Copy className="w-4 h-4 mr-1" />
            Apply Champion Game to Levels
          </Button>

        </div>
      </div>


      <div className="p-5 space-y-4">

        {levels.map(row => (
          <div
            key={row.level}
            className="rounded-2xl border border-slate-200 p-4"
          >
            <div className="flex items-center justify-between gap-3 mb-4">

              <div>
                <div className="font-extrabold text-slate-900">
                  Level {row.level}
                </div>

                <div className="text-xs text-slate-500">
                  {row.location_name}
                </div>
              </div>

              <div className="text-xs font-bold text-slate-400">
                Unlock +{row.unlock_after_days} days
              </div>

            </div>


            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">

              <label>
                <div className="fw-config-label">
                  Location / title
                </div>

                <input
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row.location_name
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        location_name:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Game ID
                </div>

                <input
                  className="admin-input"
                  disabled={disabled}
                  value={row.game_id}
                  placeholder="number_sequence"
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        game_id:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Target / game value
                </div>

                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .game_config
                      ?.target_number ??
                    ''
                  }
                  onChange={event =>
                    updateLevelGameConfig(
                      row.level,
                      {
                        target_number:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Time limit (seconds)
                </div>

                <input
                  type="number"
                  min="5"
                  max="900"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .time_limit_seconds
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        time_limit_seconds:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Move limit
                </div>

                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row.move_limit
                  }
                  placeholder="Optional"
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        move_limit:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Free attempts
                </div>

                <input
                  type="number"
                  min="0"
                  max="100"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .initial_free_attempts
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        initial_free_attempts:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Retry token cost
                </div>

                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .token_retry_cost
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        token_retry_cost:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Unlock token cost
                </div>

                <input
                  type="number"
                  min="1"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .token_unlock_cost
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        token_unlock_cost:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>


              <label>
                <div className="fw-config-label">
                  Unlock after days
                </div>

                <input
                  type="number"
                  min="0"
                  max="365"
                  className="admin-input"
                  disabled={disabled}
                  value={
                    row
                      .unlock_after_days
                  }
                  onChange={event =>
                    updateLevel(
                      row.level,
                      {
                        unlock_after_days:
                          Number(
                            event
                              .target
                              .value,
                          ),
                      },
                    )
                  }
                />
              </label>

            </div>


            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">

              <Toggle
                label="Demo"
                disabled={disabled}
                checked={
                  row.demo_enabled
                }
                onChange={value =>
                  updateLevel(
                    row.level,
                    {
                      demo_enabled:
                        value,
                    },
                  )
                }
              />

              <Toggle
                label="Skip demo"
                disabled={disabled}
                checked={
                  row.demo_skippable
                }
                onChange={value =>
                  updateLevel(
                    row.level,
                    {
                      demo_skippable:
                        value,
                    },
                  )
                }
              />

              <Toggle
                label="Token retry"
                disabled={disabled}
                checked={
                  row
                    .token_retry_enabled
                }
                onChange={value =>
                  updateLevel(
                    row.level,
                    {
                      token_retry_enabled:
                        value,
                    },
                  )
                }
              />

              <Toggle
                label="Token unlock"
                disabled={disabled}
                checked={
                  row
                    .token_unlock_enabled
                }
                onChange={value =>
                  updateLevel(
                    row.level,
                    {
                      token_unlock_enabled:
                        value,
                    },
                  )
                }
              />

            </div>

          </div>
        ))}


        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-5">

          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />

            <div>
              <div className="font-display font-extrabold text-lg text-slate-900">
                Champion Challenge
              </div>

              <div className="text-xs text-slate-500">
                Separate prize challenge — not Level 11
              </div>
            </div>
          </div>


          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">

            <label>
              <div className="fw-config-label">
                Challenge name
              </div>

              <input
                className="admin-input"
                disabled={disabled}
                value={
                  champion.name || ''
                }
                onChange={event =>
                  updateChampion({
                    name:
                      event
                        .target
                        .value,
                  })
                }
              />
            </label>


            <label>
              <div className="fw-config-label">
                Champion Game ID
              </div>

              <input
                className="admin-input"
                disabled={disabled}
                placeholder="number_sequence"
                value={
                  champion.game_id ||
                  ''
                }
                onChange={event => {
                  const value =
                    event
                      .target
                      .value;

                  updateChampion({
                    game_id:
                      value,
                  });

                  setEdit(current => ({
                    ...current,
                    game_id:
                      value,
                  }));
                }}
              />
            </label>


            <label>
              <div className="fw-config-label">
                Target / game value
              </div>

              <input
                type="number"
                min="1"
                className="admin-input"
                disabled={disabled}
                value={
                  champion
                    ?.game_config
                    ?.target_number ??
                  ''
                }
                onChange={event =>
                  updateChampionGameConfig({
                    target_number:
                      Number(
                        event
                          .target
                          .value,
                      ),
                  })
                }
              />
            </label>


            <label>
              <div className="fw-config-label">
                Time limit
              </div>

              <input
                type="number"
                min="5"
                max="1800"
                className="admin-input"
                disabled={disabled}
                value={
                  champion
                    .time_limit_seconds ??
                  75
                }
                onChange={event =>
                  updateChampion({
                    time_limit_seconds:
                      Number(
                        event
                          .target
                          .value,
                      ),
                  })
                }
              />
            </label>


            <label>
              <div className="fw-config-label">
                Move limit
              </div>

              <input
                type="number"
                min="1"
                className="admin-input"
                disabled={disabled}
                placeholder="Optional"
                value={
                  champion.move_limit ??
                  ''
                }
                onChange={event =>
                  updateChampion({
                    move_limit:
                      event
                        .target
                        .value,
                  })
                }
              />
            </label>


            <label>
              <div className="fw-config-label">
                Official attempts
              </div>

              <input
                type="number"
                min="1"
                max="100"
                className="admin-input"
                disabled={disabled}
                value={
                  champion
                    .initial_attempts ??
                  3
                }
                onChange={event =>
                  updateChampion({
                    initial_attempts:
                      Number(
                        event
                          .target
                          .value,
                      ),
                  })
                }
              />
            </label>

          </div>


          <div className="flex flex-wrap gap-5 mt-4">

            <Toggle
              label="Demo"
              disabled={disabled}
              checked={
                champion
                  .demo_enabled
              }
              onChange={value =>
                updateChampion({
                  demo_enabled:
                    value,
                })
              }
            />

            <Toggle
              label="Skip demo"
              disabled={disabled}
              checked={
                champion
                  .demo_skippable
              }
              onChange={value =>
                updateChampion({
                  demo_skippable:
                    value,
                })
              }
            />

          </div>


          <div className="grid md:grid-cols-3 gap-3 mt-5">

            <div className="rounded-xl bg-white border border-amber-200 p-3">
              <Timer className="w-4 h-4 text-amber-600" />

              <div className="text-xs font-bold text-slate-500 mt-2">
                Global game
              </div>

              <div className="font-extrabold mt-1">
                {champion.game_id ||
                  'Not assigned'}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-amber-200 p-3">
              <Unlock className="w-4 h-4 text-amber-600" />

              <div className="text-xs font-bold text-slate-500 mt-2">
                Winners
              </div>

              <div className="font-extrabold mt-1">
                Top 5
              </div>
            </div>

            <div className="rounded-xl bg-white border border-amber-200 p-3">
              <ShieldCheck className="w-4 h-4 text-amber-600" />

              <div className="text-xs font-bold text-slate-500 mt-2">
                Qualification
              </div>

              <div className="font-extrabold mt-1">
                Enforcement OFF
              </div>
            </div>

          </div>

        </div>

      </div>


      <style>{`
        .fw-config-label {
          margin-bottom: .35rem;
          font-size: .72rem;
          line-height: 1rem;
          font-weight: 800;
          color: #64748b;
        }
      `}</style>

    </section>
  );
}
