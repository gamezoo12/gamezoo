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
  start_at: '',
  end_at: '',
  admin_notes: '',

  levels_config: [],
  champion_config: {},
};

function localInputValue(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(
    date.getTime() - offset * 60000
  );

  return local
    .toISOString()
    .slice(0, 16);
}

function isoValue(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
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

      start_at:
        localInputValue(
          selectedContest.start_at
        ),

      end_at:
        localInputValue(
          selectedContest.end_at
        ),

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

            time_limit_seconds:
              Number(
                edit
                  .champion_config
                  ?.time_limit_seconds ||
                75,
              ),
          },

          start_at:
            isoValue(
              edit.start_at
            ),

          end_at:
            isoValue(
              edit.end_at
            ),

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

  const activate = async () => {
    if (!selectedContest) return;

    const startAt =
      isoValue(edit.start_at);

    const endAt =
      isoValue(edit.end_at);

    if (!startAt || !endAt) {
      toast({
        title:
          'Start and end time required',
      });
      return;
    }

    if (
      !window.confirm(
        `Activate Champion Contest ${selectedContest.contest_number}? Any other active Free World contest will be closed.`
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      /*
       * Save core configuration first.
       * Backend refuses active-contest editing,
       * so activation happens only afterwards.
       */
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

            time_limit_seconds:
              Number(
                edit
                  .champion_config
                  ?.time_limit_seconds ||
                75,
              ),
          },

          admin_notes:
            edit.admin_notes,
        }
      );

      await worldAdminAPI.activate({
        contest_number:
          selectedContest
            .contest_number,

        start_at: startAt,
        end_at: endAt,
      });

      toast({
        title:
          `Champion Contest ${selectedContest.contest_number} activated`,
      });

      await load();
    } catch (error) {
      toast({
        title:
          'Activation failed',
        description:
          error?.response?.data?.detail ||
          'Champion Contest was not activated.',
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

      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-extrabold text-slate-900">
              50 Champion Contests
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

                <Field label="Start">
                  <input
                    type="datetime-local"
                    value={edit.start_at}
                    onChange={e =>
                      setEdit(current => ({
                        ...current,
                        start_at:
                          e.target.value,
                      }))
                    }
                    className="admin-input"
                  />
                </Field>

                <Field label="End">
                  <input
                    type="datetime-local"
                    value={edit.end_at}
                    onChange={e =>
                      setEdit(current => ({
                        ...current,
                        end_at:
                          e.target.value,
                      }))
                    }
                    className="admin-input"
                  />
                </Field>
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

                    <Button
                      onClick={activate}
                      disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Activate
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
