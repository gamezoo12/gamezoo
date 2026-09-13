import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Crown,
  Globe2,
  Play,
  Pause,
  RefreshCw,
  Save,
  ShieldCheck,
  Trophy,
  Users,
  Gamepad2,
} from 'lucide-react';

import { worldAdminAPI } from '../../lib/api';

import FreeWorldContestConfig, {
  buildChampionDraft,
  buildLevelDrafts,
} from './FreeWorldContestConfig';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const EMPTY_EDIT = {
  name: '',
  game_id: '',
  winner_count: 5,
  admin_notes: '',

  levels_config: [],
  champion_config: {},
};

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function localInputValue(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    date.getFullYear(),
    '-',
    padDatePart(date.getMonth() + 1),
    '-',
    padDatePart(date.getDate()),
    'T',
    padDatePart(date.getHours()),
    ':',
    padDatePart(date.getMinutes()),
  ].join('');
}

function isoValue(value) {
  if (!value) return null;

  /*
   * datetime-local contains NO timezone.
   * Treat exactly what the admin selected as browser-local time.
   *
   * Example UK:
   * 2026-09-07T23:59 during BST
   * becomes 2026-09-07T22:59:00.000Z.
   *
   * When loaded again, localInputValue converts it back
   * and the field still displays 23:59.
   */

  const match =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
  ] = match;

  const localDate =
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      0
    );

  if (Number.isNaN(localDate.getTime())) {
    return null;
  }

  return localDate.toISOString();
}

function statusClasses(status) {
  if (status === 'active') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'closed') {
    return 'bg-slate-200 text-slate-600';
  }

  return 'bg-amber-100 text-amber-700';
}

export default function FreeWorldAdmin() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [seasonId, setSeasonId] =
    useState(null);

  const [activeContest, setActiveContest] =
    useState(null);

  const [serverTime, setServerTime] =
    useState(null);

  const [contests, setContests] =
    useState([]);

  const [prizes, setPrizes] =
    useState([]);

  const [entries, setEntries] =
    useState([]);

  const [selectedNumber, setSelectedNumber] =
    useState(null);

  const [edit, setEdit] =
    useState(EMPTY_EDIT);

  const [prizeDrafts, setPrizeDrafts] =
    useState({});

  const contestEditorRef =
    useRef(null);

  const selectedContest = useMemo(
    () =>
      contests.find(
        item =>
          Number(item.contest_number) ===
          Number(selectedNumber)
      ) || null,
    [contests, selectedNumber]
  );

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [
        contestResponse,
        prizeResponse,
        entryResponse,
      ] = await Promise.all([
        worldAdminAPI.contests(),
        worldAdminAPI.championPrizes(),
        worldAdminAPI.entries({
          limit: 200,
        }),
      ]);

      const contestRows =
        contestResponse?.contests || [];

      const prizeRows =
        prizeResponse?.prizes || [];

      setSeasonId(
        contestResponse?.season_id ||
          prizeResponse?.season_id ||
          null
      );

      setActiveContest(
        contestResponse
          ?.active_contest_number ??
          null
      );

      setServerTime(
        contestResponse?.server_time ||
          null
      );

      setContests(contestRows);
      setPrizes(prizeRows);

      setEntries(
        entryResponse?.entries || []
      );

      setPrizeDrafts(
        Object.fromEntries(
          prizeRows.map(row => [
            row.champion_stage,
            {
              amount:
                row.amount ?? 0,
              currency:
                row.currency || 'GBP',
            },
          ])
        )
      );

      setSelectedNumber(current => {
        if (
          current &&
          contestRows.some(
            row =>
              Number(row.contest_number) ===
              Number(current)
          )
        ) {
          return current;
        }

        return (
          contestResponse
            ?.active_contest_number ||
          contestRows?.[0]
            ?.contest_number ||
          null
        );
      });
    } catch (error) {
      toast({
        title:
          'Could not load Free World admin',
        description:
          error?.response?.data?.detail ||
          'Free World admin data could not be loaded.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedContest) {
      setEdit(EMPTY_EDIT);
      return;
    }

    setEdit({
      name:
        selectedContest.name || '',

      game_id:
        selectedContest.game_id || '',

      winner_count:
        selectedContest
          .winner_count ?? 5,


      admin_notes:
        selectedContest
          .admin_notes || '',

      levels_config:
        buildLevelDrafts(
          selectedContest,
        ),

      champion_config:
        buildChampionDraft(
          selectedContest,
        ),
    });
  }, [selectedContest]);

  const seed = async () => {
    if (
      !window.confirm(
        'Create any missing Free World contest and Champion prize holders? This does not activate a contest or credit wallets.'
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const response =
        await worldAdminAPI.seed();

      toast({
        title:
          'Free World holders checked',
        description:
          response?.message ||
          'Seed completed.',
      });

      await load();
    } catch (error) {
      toast({
        title: 'Seed failed',
        description:
          error?.response?.data?.detail ||
          'Could not seed Free World.',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveContest = async () => {
    if (!selectedContest) return;

    setBusy(true);

    try {
      await worldAdminAPI.updateContest(
        selectedContest.contest_number,
        {
          name:
            edit.name.trim(),

          game_id:
            edit.game_id.trim() ||
            null,

          winner_count: 5,

          levels_config:
            edit.levels_config,

          champion_config:
            edit.champion_config,

          game_config: {
            ...(
              edit
                .champion_config
                ?.game_config ||
              {}
            ),

          },


          admin_notes:
            edit.admin_notes,
        }
      );

      toast({
        title:
          'Champion Contest saved',
      });

      await load();
    } catch (error) {
      toast({
        title:
          'Could not save contest',
        description:
          error?.response?.data?.detail ||
          'Contest configuration was not changed.',
      });
    } finally {
      setBusy(false);
    }
  };



  const deactivate = async () => {
    if (
      !window.confirm(
        'Close the currently active Free World Champion Contest?'
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const response =
        await worldAdminAPI.deactivate();

      toast({
        title:
          'Free World contest closed',
        description:
          response?.message ||
          (
            response
              ?.closed_contest_number
              ? `Champion Contest ${response.closed_contest_number} closed.`
              : ''
          ),
      });

      await load();
    } catch (error) {
      toast({
        title:
          'Could not close contest',
        description:
          error?.response?.data?.detail ||
          'No changes were made.',
      });
    } finally {
      setBusy(false);
    }
  };

  const savePrize = async stage => {
    const draft =
      prizeDrafts[stage];

    if (!draft) return;

    setBusy(true);

    try {
      await worldAdminAPI
        .updateChampionPrize(
          stage,
          Number(draft.amount),
          draft.currency || 'GBP'
        );

      toast({
        title:
          `Champion ${stage} prize saved`,
      });

      await load();
    } catch (error) {
      toast({
        title:
          'Could not save Champion prize',
        description:
          error?.response?.data?.detail ||
          'Prize was not changed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedEntries = useMemo(
    () =>
      selectedNumber
        ? entries.filter(
            entry =>
              Number(
                entry.global_contest_number
              ) ===
              Number(selectedNumber)
          )
        : entries,
    [entries, selectedNumber]
  );

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        Loading Free World admin…
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      data-testid="free-world-admin"
    >
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#6C2BFF] font-extrabold uppercase tracking-widest text-xs">
            <Globe2 className="w-4 h-4" />
            Free World
          </div>

          <h1 className="font-display font-extrabold text-3xl text-slate-900 mt-1">
            Champion World Control
          </h1>

          <p className="text-sm text-slate-500 mt-2 max-w-3xl">
            Manage the isolated Free World Champion contests.
            This dashboard does not manage paid contest tickets,
            paid game scores or paid leaderboards.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={load}
            disabled={busy}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={seed}
            disabled={busy}
          >
            <ShieldCheck className="w-4 h-4 mr-1" />
            Seed holders
          </Button>

          {activeContest && (
            <Button
              variant="outline"
              onClick={deactivate}
              disabled={busy}
              className="border-rose-200 text-rose-700"
            >
              <Pause className="w-4 h-4 mr-1" />
              Close active
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Stat
          icon={Crown}
          label="Season"
          value={seasonId || '—'}
        />

        <Stat
          icon={Trophy}
          label="Active Champion Contest"
          value={
            activeContest
              ? `#${activeContest}`
              : 'None'
          }
        />

        <Stat
          icon={Gamepad2}
          label="Contest holders"
          value={contests.length}
        />

        <Stat
          icon={Users}
          label="Recent entries"
          value={entries.length}
        />
      </div>

      <SeasonLaunchPanel
        contest={
          contests.find(
            row =>
              Number(
                row.contest_number
              ) === 1
          ) || null
        }
        serverTime={serverTime}
        busy={busy}
        onLaunched={load}
      />

      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-extrabold text-slate-900">
              100 Champion Contests
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              One global contest can be active at a time.
            </p>
          </div>

          <div className="max-h-[720px] overflow-y-auto p-2">
            {contests.map(contest => (
              <button
                type="button"
                key={
                  contest.contest_number
                }
                onClick={() => {
                  setSelectedNumber(
                    contest.contest_number
                  );

                  window.setTimeout(
                    () => {
                      contestEditorRef
                        .current
                        ?.scrollIntoView({
                          behavior:
                            'smooth',

                          block:
                            'start',
                        });
                    },
                    50,
                  );
                }}
                className={`w-full text-left p-3 rounded-xl mb-1 border transition ${
                  Number(selectedNumber) ===
                  Number(
                    contest.contest_number
                  )
                    ? 'border-[#6C2BFF] bg-[#6C2BFF]/5'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    Champion Contest{' '}
                    {contest.contest_number}
                  </span>

                  <span
                    className={`text-[10px] uppercase font-extrabold px-2 py-1 rounded-full ${statusClasses(
                      contest.status
                    )}`}
                  >
                    {contest.status}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mt-1 truncate">
                  {contest.game_id ||
                    'Game not assigned'}
                </div>
              </button>
            ))}

            {contests.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No holders yet. Use
                Seed holders.
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          {selectedContest && (
            <section
              ref={contestEditorRef}
              className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 scroll-mt-6"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-widest text-[#6C2BFF]">
                    Global Contest
                  </div>

                  <h2 className="font-display font-extrabold text-2xl mt-1">
                    Champion Contest{' '}
                    {
                      selectedContest
                        .contest_number
                    }
                  </h2>
                </div>

                <span
                  className={`self-start text-xs uppercase font-extrabold px-3 py-1.5 rounded-full ${statusClasses(
                    selectedContest.status
                  )}`}
                >
                  {selectedContest.status}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <Field label="Contest name">
                  <input
                    value={edit.name}
                    disabled={
                      selectedContest.status ===
                      'active'
                    }
                    onChange={e =>
                      setEdit(current => ({
                        ...current,
                        name:
                          e.target.value,
                      }))
                    }
                    className="admin-input"
                  />
                </Field>

                <Field label="Game ID">
                  <input
                    value={edit.game_id}
                    disabled={
                      selectedContest.status ===
                      'active'
                    }
                    onChange={e =>
                      setEdit(current => ({
                        ...current,
                        game_id:
                          e.target.value,
                      }))
                    }
                    placeholder="number_sequence"
                    className="admin-input"
                  />
                </Field>

                <Field label="Winner count">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={
                      edit.winner_count
                    }
                    disabled
                    readOnly
                    className="admin-input"
                  />
                </Field>

                <div />




              </div>

              <Field
                label="Admin notes"
                className="mt-4"
              >
                <textarea
                  rows="4"
                  value={
                    edit.admin_notes
                  }
                  disabled={
                    selectedContest.status ===
                    'active'
                  }
                  onChange={e =>
                    setEdit(current => ({
                      ...current,
                      admin_notes:
                        e.target.value,
                    }))
                  }
                  className="admin-input resize-y"
                />
              </Field>

              <div className="flex flex-wrap justify-end gap-2 mt-5">
                {selectedContest.status !==
                  'active' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={
                        saveContest
                      }
                      disabled={busy}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>


                  </>
                )}
              </div>
            </section>
          )}

          {selectedContest && (
            <FreeWorldContestConfig
              edit={edit}
              setEdit={setEdit}
              busy={busy}
              disabled={
                selectedContest.status ===
                'active'
              }
            />
          )}

          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-display font-extrabold text-xl">
                Champion Stage Holder Reference
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Internal stage snapshot reference. Final winner payout uses the locked Top-5 rank formula × the user's personal Champion stage.
              </p>
            </div>

            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3">
                      Champion
                    </th>
                    <th className="text-left p-3">
                      Amount
                    </th>
                    <th className="text-left p-3">
                      Currency
                    </th>
                    <th className="p-3" />
                  </tr>
                </thead>

                <tbody>
                  {prizes.map(row => {
                    const draft =
                      prizeDrafts[
                        row.champion_stage
                      ] || {};

                    return (
                      <tr
                        key={
                          row.champion_stage
                        }
                        className="border-t border-slate-100"
                      >
                        <td className="p-3 font-bold">
                          Champion{' '}
                          {
                            row.champion_stage
                          }
                        </td>

                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            value={
                              draft.amount ??
                              ''
                            }
                            onChange={e =>
                              setPrizeDrafts(
                                current => ({
                                  ...current,
                                  [row.champion_stage]:
                                    {
                                      ...current[
                                        row
                                          .champion_stage
                                      ],
                                      amount:
                                        e.target
                                          .value,
                                    },
                                })
                              )
                            }
                            className="admin-input max-w-[150px]"
                          />
                        </td>

                        <td className="p-3">
                          <input
                            value={
                              draft.currency ||
                              'GBP'
                            }
                            maxLength="3"
                            onChange={e =>
                              setPrizeDrafts(
                                current => ({
                                  ...current,
                                  [row.champion_stage]:
                                    {
                                      ...current[
                                        row
                                          .champion_stage
                                      ],
                                      currency:
                                        e.target.value
                                          .toUpperCase(),
                                    },
                                })
                              )
                            }
                            className="admin-input max-w-[100px]"
                          />
                        </td>

                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              savePrize(
                                row.champion_stage
                              )
                            }
                          >
                            Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-display font-extrabold text-xl">
                Contest Entries
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Admin-only Champion stage and prize snapshots for Champion Contest{' '}
                {selectedNumber || '—'}.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-left">
                      Player
                    </th>
                    <th className="p-3 text-left">
                      Champion
                    </th>
                    <th className="p-3 text-left">
                      Prize snapshot
                    </th>
                    <th className="p-3 text-left">
                      Entered
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedEntries.map(
                    (entry, index) => (
                      <tr
                        key={
                          entry.entry_id ||
                          `${entry.user_id}-${index}`
                        }
                        className="border-t border-slate-100"
                      >
                        <td className="p-3">
                          <div className="font-semibold">
                            {entry.user_name ||
                              'Player'}
                          </div>

                          <div className="text-xs text-slate-400">
                            {entry.user_id}
                          </div>
                        </td>

                        <td className="p-3 font-bold">
                          {entry
                            .champion_stage_snapshot ??
                            entry
                              .champion_stage ??
                            '—'}
                        </td>

                        <td className="p-3">
                          {entry
                            .prize_amount_snapshot ??
                            '—'}{' '}
                          {entry
                            .prize_currency_snapshot ||
                            ''}
                        </td>

                        <td className="p-3 text-slate-500">
                          {entry.entered_at
                            ? new Date(
                                entry.entered_at
                              ).toLocaleString(
                                'en-GB'
                              )
                            : '—'}
                        </td>
                      </tr>
                    )
                  )}

                  {selectedEntries.length ===
                    0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="p-10 text-center text-slate-500"
                      >
                        No entries for this
                        Champion Contest.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .admin-input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 0.65rem 0.8rem;
          background: white;
          color: #0f172a;
          outline: none;
        }

        .admin-input:focus {
          border-color: #6C2BFF;
          box-shadow: 0 0 0 3px rgba(108,43,255,.10);
        }

        .admin-input:disabled {
          background: #f8fafc;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}) {
  return (
    <label
      className={`block ${className}`}
    >
      <div className="text-xs font-bold text-slate-600 mb-1.5">
        {label}
      </div>

      {children}
    </label>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider font-bold">
        <Icon className="w-4 h-4 text-[#6C2BFF]" />
        {label}
      </div>

      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">
        {value}
      </div>
    </div>
  );
}

/* ==========================================================
 * Free World Season Launch
 *
 * Reuses the existing authoritative activation endpoint
 * (POST /api/admin/world/activate). It only adds:
 *   - Europe/London launch date/time selection
 *   - a confirmation modal
 *   - status display (NOT LAUNCHED / SCHEDULED / LIVE / ENDED)
 *   - double-submit protection
 * The backend remains the single source of truth for the
 * schedule; every level unlock derives from the stored
 * start_at using the existing fixed 24-hour offsets.
 * ======================================================== */

const LONDON_TZ = 'Europe/London';

function londonOffsetMs(utcMs) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const map = {};
  dtf
    .formatToParts(new Date(utcMs))
    .forEach(part => {
      map[part.type] = part.value;
    });

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - utcMs;
}

function londonWallToUtcIso(dateStr, timeStr) {
  if (!dateStr) return null;

  const [y, m, d] = dateStr
    .split('-')
    .map(Number);

  const [hh, mm] = (timeStr || '00:00')
    .split(':')
    .map(Number);

  if (!y || !m || !d) return null;

  const naive = Date.UTC(
    y,
    m - 1,
    d,
    hh || 0,
    mm || 0,
    0
  );

  const offset = londonOffsetMs(naive);
  let utc = naive - offset;

  // Refine once for the rare DST-boundary case where the
  // offset at the guessed instant differs from the naive one.
  const offset2 = londonOffsetMs(utc);
  if (offset2 !== offset) {
    utc = naive - offset2;
  }

  return new Date(utc).toISOString();
}

function londonPartsFromIso(value) {
  if (!value) {
    return { date: '', time: '00:00' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: '', time: '00:00' };
  }

  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const map = {};
  dtf.formatToParts(date).forEach(part => {
    map[part.type] = part.value;
  });

  const hour = map.hour === '24' ? '00' : map.hour;

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
  };
}

function formatLondon(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)} (Europe/London)`;
}

// DD:HH:MM:SS clock format used by the Season countdowns.
function formatDaysClock(ms) {
  const total = Math.max(
    0,
    Math.floor(ms / 1000)
  );

  const days = Math.floor(total / 86400);
  const hours = Math.floor(
    (total % 86400) / 3600
  );
  const minutes = Math.floor(
    (total % 3600) / 60
  );
  const seconds = total % 60;

  const dd = String(days).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${dd}:${hh}:${mm}:${ss}`;
}

// Fixed Season 1 architecture (see backend/world/season1.py).
// 100 Championships x 10 numbered levels = 1000 levels, plus one
// separate Champion/Prize stage per Championship (100 total).
const SEASON_CHAMPIONSHIP_COUNT = 100;
const SEASON_LEVELS_PER_CHAMPIONSHIP = 10;
const SEASON_TOTAL_LEVELS =
  SEASON_CHAMPIONSHIP_COUNT *
  SEASON_LEVELS_PER_CHAMPIONSHIP;
const SEASON_CHAMPION_STAGES =
  SEASON_CHAMPIONSHIP_COUNT;

const LAUNCH_BADGE = {
  'NOT LAUNCHED': 'bg-slate-200 text-slate-600',
  SCHEDULED: 'bg-amber-100 text-amber-700',
  LIVE: 'bg-emerald-100 text-emerald-700',
  ENDED: 'bg-slate-300 text-slate-700',
};


// ==========================================================
// FREE WORLD SEASON 1 CALENDAR
//
// 100 Championships
// 10 normal levels per Championship
//
// Day 0  = Level 1
// Day 1  = Level 2
// Day 2  = Level 3
// Day 3  = Level 4
// Day 4  = Level 5
// Day 5  = Level 6
// Day 6  = Level 7
// Day 7  = Level 8
// Day 8  = Level 9
// Day 9  = Level 10
// Day 10 = Champion opens at 00:00 Europe/London
// Day 11 = Champion closes at 22:00 Europe/London
// Day 12 = next Championship starts at 00:00 Europe/London
//
// Calendar dates are converted through Europe/London so the
// schedule remains midnight-based through BST/GMT changes.
// ==========================================================

const CHAMPIONSHIP_CYCLE_DAYS = 12;
const CHAMPION_OPEN_DAY = 10;
const CHAMPION_CLOSE_DAY = 11;
const CHAMPION_CLOSE_TIME = '22:00';

function addCalendarDays(dateStr, days) {
  if (!dateStr) return '';

  const [year, month, day] = dateStr
    .split('-')
    .map(Number);

  if (!year || !month || !day) return '';

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() + Number(days || 0)
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function buildSeasonChampionshipSchedule(startIso) {
  if (!startIso) return [];

  const seasonStart =
    londonPartsFromIso(startIso);

  if (!seasonStart?.date) return [];

  return Array.from(
    { length: SEASON_CHAMPIONSHIP_COUNT },
    (_, index) => {
      const championshipNumber = index + 1;

      const cycleStartOffset =
        index * CHAMPIONSHIP_CYCLE_DAYS;

      const championshipStartDate =
        addCalendarDays(
          seasonStart.date,
          cycleStartOffset
        );

      const levels = Array.from(
        {
          length:
            SEASON_LEVELS_PER_CHAMPIONSHIP,
        },
        (_, levelIndex) => {
          const level = levelIndex + 1;

          const levelDate =
            addCalendarDays(
              championshipStartDate,
              levelIndex
            );

          return {
            level,
            globalLevel:
              index *
                SEASON_LEVELS_PER_CHAMPIONSHIP +
              level,

            opensAt:
              londonWallToUtcIso(
                levelDate,
                '00:00'
              ),
          };
        }
      );

      const championOpenDate =
        addCalendarDays(
          championshipStartDate,
          CHAMPION_OPEN_DAY
        );

      const championCloseDate =
        addCalendarDays(
          championshipStartDate,
          CHAMPION_CLOSE_DAY
        );

      const nextStartDate =
        addCalendarDays(
          championshipStartDate,
          CHAMPIONSHIP_CYCLE_DAYS
        );

      return {
        championshipNumber,
        levels,

        startsAt:
          levels[0]?.opensAt || null,

        championOpensAt:
          londonWallToUtcIso(
            championOpenDate,
            '00:00'
          ),

        championClosesAt:
          londonWallToUtcIso(
            championCloseDate,
            CHAMPION_CLOSE_TIME
          ),

        nextChampionshipAt:
          championshipNumber <
          SEASON_CHAMPIONSHIP_COUNT
            ? londonWallToUtcIso(
                nextStartDate,
                '00:00'
              )
            : null,
      };
    }
  );
}

function seasonScheduleStatus(
  row,
  serverNow
) {
  if (!row?.startsAt) return 'WAITING';

  const now = Number(serverNow || 0);

  const start =
    new Date(row.startsAt).getTime();

  const championOpen =
    new Date(
      row.championOpensAt
    ).getTime();

  const championClose =
    new Date(
      row.championClosesAt
    ).getTime();

  if (now < start) {
    return 'SCHEDULED';
  }

  if (
    now >= championOpen &&
    now < championClose
  ) {
    return 'CHAMPION LIVE';
  }

  if (now >= championClose) {
    return 'COMPLETE';
  }

  return 'LEVELS LIVE';
}

function SeasonChampionshipSchedule({
  startIso,
  serverNow,
}) {
  const [scheduleSearch, setScheduleSearch] =
    useState('');

  const schedule = useMemo(
    () =>
      buildSeasonChampionshipSchedule(
        startIso
      ),
    [startIso]
  );

  const filteredSchedule =
    useMemo(() => {
      const query =
        scheduleSearch.trim();

      if (!query) return schedule;

      const number =
        Number(
          query.replace(/\D/g, '')
        );

      if (!number) return schedule;

      return schedule.filter(
        row =>
          row.championshipNumber ===
          number
      );
    }, [schedule, scheduleSearch]);

  if (!startIso) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="font-bold text-slate-900">
          100 Championship schedule
        </div>

        <div className="text-sm text-slate-500 mt-1">
          Choose the Season start date to
          preview all 100 Championships.
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-6 rounded-2xl border border-slate-200 overflow-hidden"
      data-testid="season-championship-schedule"
    >
      <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="font-display font-extrabold text-xl text-slate-900">
              Season Championship Schedule
            </div>

            <div className="text-sm text-slate-500 mt-1">
              100 Championships | 1,000 normal
              levels | 100 Champion stages
            </div>
          </div>

          <input
            type="text"
            value={scheduleSearch}
            onChange={event =>
              setScheduleSearch(
                event.target.value
              )
            }
            placeholder="Find Championship #"
            className="admin-input lg:max-w-[230px]"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] uppercase font-bold text-slate-500">
              Championships
            </div>

            <div className="font-display font-extrabold text-xl">
              100
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] uppercase font-bold text-slate-500">
              Levels
            </div>

            <div className="font-display font-extrabold text-xl">
              1,000
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] uppercase font-bold text-slate-500">
              Cycle
            </div>

            <div className="font-display font-extrabold text-xl">
              12 days
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] uppercase font-bold text-slate-500">
              Champion window
            </div>

            <div className="font-display font-extrabold text-xl">
              46 hours
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-white sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="text-left p-3">
                Championship
              </th>

              <th className="text-left p-3">
                Level 1
              </th>

              <th className="text-left p-3">
                Level 10
              </th>

              <th className="text-left p-3">
                Champion opens
              </th>

              <th className="text-left p-3">
                Champion closes
              </th>

              <th className="text-left p-3">
                Next
              </th>

              <th className="text-left p-3">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredSchedule.map(row => {
              const status =
                seasonScheduleStatus(
                  row,
                  serverNow
                );

              return (
                <tr
                  key={
                    row.championshipNumber
                  }
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="p-3 font-extrabold">
                    Championship{' '}
                    {row.championshipNumber}
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {formatLondon(
                      row.levels[0]
                        ?.opensAt
                    )}
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {formatLondon(
                      row.levels[9]
                        ?.opensAt
                    )}
                  </td>

                  <td className="p-3 whitespace-nowrap font-semibold text-violet-700">
                    {formatLondon(
                      row.championOpensAt
                    )}
                  </td>

                  <td className="p-3 whitespace-nowrap font-semibold text-rose-700">
                    {formatLondon(
                      row.championClosesAt
                    )}
                  </td>

                  <td className="p-3 whitespace-nowrap">
                    {row.nextChampionshipAt
                      ? formatLondon(
                          row.nextChampionshipAt
                        )
                      : 'Season complete'}
                  </td>

                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] uppercase font-extrabold ${
                        status ===
                        'CHAMPION LIVE'
                          ? 'bg-violet-100 text-violet-700'
                          : status ===
                            'LEVELS LIVE'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status ===
                            'COMPLETE'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
        All displayed times use Europe/London.
        Champion stages close at 22:00 on Day 11.
        The next Championship starts at 00:00
        on Day 12.
      </div>
    </div>
  );
}

function SeasonLaunchPanel({
  contest,
  serverTime,
  busy,
  onLaunched,
}) {
  const { toast } = useToast();

  const [startDate, setStartDate] =
    useState('');

  const [startTime, setStartTime] =
    useState('00:00');

  const [showConfirm, setShowConfirm] =
    useState(false);

  const [launchBusy, setLaunchBusy] =
    useState(false);

  const [serverOffset, setServerOffset] =
    useState(0);

  const [nowMs, setNowMs] =
    useState(() => Date.now());

  useEffect(() => {
    if (!serverTime) {
      return;
    }

    const parsed =
      new Date(serverTime).getTime();

    if (!Number.isNaN(parsed)) {
      setServerOffset(
        parsed - Date.now()
      );
    }
  }, [serverTime]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setNowMs(Date.now());
        },
        1000
      );

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const serverNow =
    nowMs + serverOffset;


  // ----------------------------------------------------------
  // Persisted Season start.
  //
  // Championship 1 is only the authoritative holder used to
  // store the Season start. Championships 2-100 are activated
  // automatically by the scheduler.
  // ----------------------------------------------------------

  useEffect(() => {
    if (!contest?.start_at) {
      return;
    }

    const parts =
      londonPartsFromIso(
        contest.start_at
      );

    setStartDate(
      parts?.date || ''
    );

    setStartTime(
      parts?.time || '00:00'
    );
  }, [
    contest?.start_at,
  ]);


  // ----------------------------------------------------------
  // Proposed Admin start.
  // ----------------------------------------------------------

  const startIso =
    londonWallToUtcIso(
      startDate,
      startTime
    );

  const validStart =
    Boolean(
      startIso &&
      !Number.isNaN(
        new Date(
          startIso
        ).getTime()
      )
    );


  // ----------------------------------------------------------
  // Persisted full-Season schedule for status calculation.
  // ----------------------------------------------------------

  const persistedSchedule =
    useMemo(
      () =>
        contest?.start_at
          ? buildSeasonChampionshipSchedule(
              contest.start_at
            )
          : [],
      [
        contest?.start_at,
      ]
    );

  const persistedSeasonEnd =
    persistedSchedule.length
      ? persistedSchedule[
          persistedSchedule.length - 1
        ]?.championClosesAt
      : null;


  // ----------------------------------------------------------
  // Status uses only persisted server schedule.
  // ----------------------------------------------------------

  const status =
    useMemo(() => {
      if (!contest?.start_at) {
        return 'NOT LAUNCHED';
      }

      const persistedStartMs =
        new Date(
          contest.start_at
        ).getTime();

      const persistedEndMs =
        persistedSeasonEnd
          ? new Date(
              persistedSeasonEnd
            ).getTime()
          : null;

      if (
        serverNow <
        persistedStartMs
      ) {
        return 'SCHEDULED';
      }

      if (
        persistedEndMs !== null &&
        serverNow >= persistedEndMs
      ) {
        return 'ENDED';
      }

      return 'LIVE';
    }, [
      contest?.start_at,
      persistedSeasonEnd,
      serverNow,
    ]);


  // Admin may reschedule only before the Season becomes live.
  const isLocked =
    status === 'LIVE' ||
    status === 'ENDED';

  const badge =
    LAUNCH_BADGE[status] ||
    LAUNCH_BADGE[
      'NOT LAUNCHED'
    ];


  // ----------------------------------------------------------
  // Preview uses currently selected Admin start.
  // ----------------------------------------------------------

  const previewStartIso =
    validStart
      ? startIso
      : contest?.start_at ||
        null;


  const openConfirm = () => {
    if (!validStart) {
      toast({
        title:
          'Choose the Season start',

        description:
          'Select a valid Season 1 start date and time in Europe/London.',
      });

      return;
    }

    if (isLocked) {
      return;
    }

    setShowConfirm(true);
  };


  const confirmLaunch =
    async () => {
      if (
        launchBusy ||
        busy ||
        !validStart ||
        isLocked
      ) {
        return;
      }

      setLaunchBusy(true);

      try {
        const response =
          await worldAdminAPI.activate({
            contest_number: 1,
            start_at: startIso,
          });

        toast({
          title:
            response?.launched
              ? 'Free World Season 1 scheduled'
              : 'Season schedule unchanged',

          description:
            `Season starts ${formatLondon(
              startIso
            )}`,
        });

        setShowConfirm(false);

        await onLaunched?.();

      } catch (error) {
        toast({
          title:
            'Season launch failed',

          description:
            error?.response?.data?.detail ||
            'The Season was not launched.',
        });

      } finally {
        setLaunchBusy(false);
      }
    };


  return (
    <section
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
      data-testid="season-launch-panel"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#6C2BFF] font-extrabold uppercase tracking-widest text-xs">
            <Crown className="w-4 h-4" />

            Free World
          </div>

          <h2 className="font-display font-extrabold text-2xl text-slate-900 mt-1">
            Season 1
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            One start date controls all
            100 Championships automatically.
          </p>
        </div>

        <span
          data-testid="season-status-badge"
          className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider ${badge}`}
        >
          {status}
        </span>
      </div>


      <div className="grid sm:grid-cols-4 gap-3 mt-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Championships
          </div>

          <div className="font-display font-extrabold text-xl text-slate-900 mt-1">
            100
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Normal levels
          </div>

          <div className="font-display font-extrabold text-xl text-slate-900 mt-1">
            1,000
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Champion stages
          </div>

          <div className="font-display font-extrabold text-xl text-slate-900 mt-1">
            100
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Cycle
          </div>

          <div className="font-display font-extrabold text-xl text-slate-900 mt-1">
            12 days
          </div>
        </div>
      </div>


      <div className="mt-5">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Season starts - Europe/London
        </label>

        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input
            type="date"
            data-testid="season-start-date"
            value={startDate}
            disabled={
              busy ||
              launchBusy ||
              isLocked
            }
            onChange={event =>
              setStartDate(
                event.target.value
              )
            }
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
          />

          <input
            type="time"
            data-testid="season-start-time"
            value={startTime}
            disabled={
              busy ||
              launchBusy ||
              isLocked
            }
            onChange={event =>
              setStartTime(
                event.target.value
              )
            }
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-slate-500 mt-2">
          {validStart
            ? formatLondon(startIso)
            : 'Choose the Season 1 launch date and time.'}
        </p>
      </div>


      {previewStartIso && (
        <SeasonChampionshipSchedule
          startIso={
            previewStartIso
          }
          serverNow={
            serverNow
          }
        />
      )}


      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          data-testid="season-launch-btn"
          onClick={
            openConfirm
          }
          disabled={
            busy ||
            launchBusy ||
            !validStart ||
            isLocked
          }
          className="bg-[#6C2BFF] hover:bg-[#5a20e0] text-white"
        >
          <Play className="w-4 h-4 mr-1" />

          {status === 'NOT LAUNCHED'
            ? 'Launch Season 1'
            : status === 'SCHEDULED'
            ? 'Reschedule Season 1'
            : status === 'LIVE'
            ? 'Season 1 Live'
            : 'Season 1 Ended'}
        </Button>

        {isLocked && (
          <span className="text-xs text-slate-500">
            Season schedule is locked
            after the Season starts.
          </span>
        )}
      </div>


      {showConfirm && (
        <div
          className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/40 p-4"
          data-testid="season-confirm-modal"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-display font-extrabold text-xl text-slate-900">
              Confirm Season 1 launch
            </h3>

            <p className="text-sm text-slate-600 mt-3">
              This one start time generates
              the complete schedule for all
              100 Championships.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Season starts
              </div>

              <div className="font-bold text-slate-900 mt-1">
                {formatLondon(
                  startIso
                )}
              </div>

              <div className="text-xs text-slate-500 mt-1">
                Europe/London
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={
                  launchBusy
                }
                onClick={() =>
                  setShowConfirm(false)
                }
              >
                Cancel
              </Button>

              <Button
                data-testid="season-confirm-launch-btn"
                disabled={
                  launchBusy
                }
                onClick={
                  confirmLaunch
                }
                className="bg-[#6C2BFF] hover:bg-[#5a20e0] text-white"
              >
                {launchBusy
                  ? 'Launching...'
                  : 'Confirm launch'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
