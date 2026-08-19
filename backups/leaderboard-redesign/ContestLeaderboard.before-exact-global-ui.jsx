import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Trophy,
  Medal,
  Award,
  Crown,
  ArrowLeft,
  RefreshCw,
  Target,
  Clock3,
  Flame,
} from 'lucide-react';
import { gamesAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const formatDuration = (durationMs) => {
  if (durationMs == null) return '—';

  const safe = Math.max(0, Math.floor(Number(durationMs) || 0));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const milliseconds = safe % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(milliseconds).padStart(3, '0')}`;
};

const getScore = (row) =>
  Number(row.normalized_score ?? row.points ?? row.score ?? 0);

const getAccuracy = (row) => {
  if (row.accuracy_pct != null) {
    return Number(row.accuracy_pct);
  }

  const raw = Number(row.accuracy || 0);
  return raw <= 1 ? raw * 100 : raw;
};

const getDurationMs = (row) => {
  if (row.duration_ms != null) {
    return Number(row.duration_ms);
  }

  if (row.duration_s != null) {
    return Number(row.duration_s) * 1000;
  }

  return null;
};

export default function ContestLeaderboard() {
  const { contestId } = useParams();
  const { user } = useAuth();

  const [contest, setContest] = useState(null);
  const [rows, setRows] = useState([]);
  const [myPosition, setMyPosition] = useState(null);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await gamesAPI.leaderboard(contestId, 100);

      setRows(response?.entries || response?.leaderboard || []);
      setMyPosition(response?.my_position || null);
      setClosed(Boolean(response?.closed));
      setLastUpdated(new Date());
    } catch {
      setRows([]);
      setMyPosition(null);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    loadLeaderboard();

    contestsAPI
      .list()
      .then((list) => {
        const contests = Array.isArray(list)
          ? list
          : list?.contests || [];

        setContest(
          contests.find(
            (item) =>
              String(item.contest_id) === String(contestId)
          ) || null
        );
      })
      .catch(() => setContest(null));

    const timer = window.setInterval(loadLeaderboard, 15000);

    return () => window.clearInterval(timer);
  }, [contestId, loadLeaderboard]);

  const medal = (rank) => {
    if (rank === 1) {
      return {
        Icon: Crown,
        cls:
          'bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-4 ring-amber-200',
      };
    }

    if (rank === 2) {
      return {
        Icon: Trophy,
        cls:
          'bg-gradient-to-br from-slate-300 to-slate-500 text-white',
      };
    }

    if (rank === 3) {
      return {
        Icon: Medal,
        cls:
          'bg-gradient-to-br from-amber-700 to-amber-900 text-white',
      };
    }

    return {
      Icon: null,
      cls: 'bg-slate-100 text-slate-500',
    };
  };

  const topThree = useMemo(() => rows.slice(0, 3), [rows]);

  const currentUserRow =
    rows.find(
      (row) =>
        row.is_current_user ||
        String(row.user_id) === String(user?.user_id)
    ) || myPosition;

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-8 py-5 sm:py-10"
      data-testid="contest-leaderboard-page"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Leaderboards
        </Link>

        <button
          type="button"
          onClick={loadLeaderboard}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BFF]"
          data-testid="leaderboard-refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 p-5 sm:p-8 text-white mb-5 sm:mb-6">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -left-8 -bottom-8 w-40 h-40 rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest text-white/80">
            <Flame className="w-4 h-4" />
            Contest leaderboard
          </div>

          <h1 className="mt-2 font-display text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
            {contest?.title || 'Contest Rankings'}
          </h1>

          <p className="mt-2 text-xs sm:text-sm text-white/80">
            {closed
              ? 'Final verified contest rankings.'
              : 'Live verified rankings. Updates every 15 seconds.'}
          </p>

          <div className="mt-3 text-[10px] text-white/55">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Loading rankings…'}
          </div>
        </div>
      </div>

      {currentUserRow && (
        <div
          className="mb-5 flex items-center gap-3 rounded-2xl border-2 border-[#FFD54A] bg-[#FFD54A]/15 p-3 sm:p-4"
          data-testid="my-leaderboard-position"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFD54A] font-black text-slate-900">
            #{currentUserRow.rank || '—'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#6C2BFF]">
              Your position
            </div>

            <div className="truncate text-sm font-bold text-slate-900">
              {currentUserRow.user_name || user?.name || 'You'}
            </div>

            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-slate-600">
              <span>
                <Target className="inline h-3 w-3" />{' '}
                {getAccuracy(currentUserRow).toFixed(2)}%
              </span>

              <span>
                <Clock3 className="inline h-3 w-3" />{' '}
                {formatDuration(getDurationMs(currentUserRow))}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-display text-xl sm:text-2xl font-extrabold text-orange-600">
              {getScore(currentUserRow).toFixed(2)}
            </div>

            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              out of 100
            </div>
          </div>
        </div>
      )}

      {!loading && topThree.length > 0 && (
        <div
          className="grid grid-cols-3 items-end gap-2 sm:gap-3 mb-5 sm:mb-6"
          data-testid="contest-podium"
        >
          {[1, 0, 2].map((index) => {
            const player = topThree[index];

            if (!player) {
              return <div key={index} />;
            }

            const rank = player.rank || index + 1;
            const rankStyle = medal(rank);

            const heights = {
              0: 'min-h-[150px] sm:min-h-[210px]',
              1: 'min-h-[125px] sm:min-h-[170px]',
              2: 'min-h-[110px] sm:min-h-[145px]',
            };

            const gradients = {
              0: 'from-amber-400 via-orange-500 to-rose-500',
              1: 'from-slate-300 to-slate-500',
              2: 'from-amber-700 to-amber-900',
            };

            return (
              <div
                key={player.user_id || `${rank}-${index}`}
                className={`flex flex-col items-center justify-end rounded-xl sm:rounded-2xl bg-gradient-to-b ${gradients[index]} ${heights[index]} p-2 sm:p-4 text-center text-white shadow-lg`}
              >
                <div className="mb-1.5 flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/20">
                  {rankStyle.Icon ? (
                    <rankStyle.Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    rank
                  )}
                </div>

                <div className="w-full truncate text-[11px] sm:text-sm font-bold">
                  {player.user_name || 'Player'}
                </div>

                <div className="font-display text-lg sm:text-2xl font-extrabold">
                  {getScore(player).toFixed(2)}
                </div>

                <div className="mt-0.5 text-[8px] sm:text-[10px] opacity-90">
                  {getAccuracy(player).toFixed(2)}% ·{' '}
                  {formatDuration(getDurationMs(player))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="border-b border-slate-100 px-3 py-3 sm:px-5 sm:py-4">
          <div className="font-display font-extrabold text-slate-900">
            Contest Rankings
          </div>

          <div className="mt-0.5 text-[10px] sm:text-xs text-slate-500">
            Highest score first · tie-break by accuracy and completion time
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">
            Loading leaderboard…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No verified scores yet.
          </div>
        ) : (
          <ul
            className="divide-y divide-slate-100"
            data-testid="contest-leaderboard-list"
          >
            {rows.map((row) => {
              const rankStyle = medal(row.rank);
              const isCurrent =
                row.is_current_user ||
                String(row.user_id) === String(user?.user_id);

              return (
                <li
                  key={row.user_id || `${row.rank}-${row.public_id}`}
                  className={`flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 sm:px-5 sm:py-3 ${
                    isCurrent
                      ? 'border-l-4 border-[#FFD54A] bg-[#FFD54A]/15'
                      : row.rank <= 3
                        ? 'bg-gradient-to-r from-amber-50/50 to-transparent'
                        : ''
                  }`}
                  data-testid={`leaderboard-row-${row.rank}`}
                >
                  <div
                    className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankStyle.cls}`}
                  >
                    {rankStyle.Icon ? (
                      <rankStyle.Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      row.rank
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs sm:text-sm font-semibold text-slate-900">
                        {isCurrent ? 'You' : row.user_name || 'Player'}
                      </span>

                      {isCurrent && (
                        <span className="rounded bg-[#FFD54A] px-1.5 py-0.5 text-[8px] font-bold text-slate-900">
                          YOU
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9px] sm:text-[11px] text-slate-500">
                      {row.public_id && <span>#{row.public_id}</span>}

                      <span>
                        {getAccuracy(row).toFixed(2)}% accuracy
                      </span>

                      <span>
                        {formatDuration(getDurationMs(row))}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-display text-lg sm:text-2xl font-extrabold text-orange-600">
                      {getScore(row).toFixed(2)}
                    </div>

                    <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-slate-400">
                      / 100
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-slate-100 p-2.5 text-center text-[9px] text-slate-400">
          Scores are contest-specific. No global leaderboard is used.
        </div>
      </div>
    </div>
  );
}
