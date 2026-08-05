import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Trophy,
  Medal,
  Award,
  Crown,
  ArrowLeft,
  Flame,
  RefreshCw,
  Target,
  Zap as SpeedIcon,
} from 'lucide-react';
import { gamesAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const getScore = (row) =>
  Number(row.normalized_score ?? row.points ?? row.score ?? 0);

const getAccuracy = (row) => {
  if (row.accuracy_pct != null) return Number(row.accuracy_pct);

  const value = Number(row.accuracy || 0);
  return value <= 1 ? value * 100 : value;
};

const getDurationMs = (row) => {
  if (row.duration_ms != null) return Number(row.duration_ms);
  if (row.duration_s != null) return Number(row.duration_s) * 1000;
  return 0;
};

const formatDuration = (durationMs) => {
  const safe = Math.max(0, Math.floor(Number(durationMs) || 0));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const milliseconds = safe % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(milliseconds).padStart(3, '0')}`;
};

export default function ContestLeaderboard() {
  const { contestId } = useParams();
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [contest, setContest] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await gamesAPI.leaderboard(contestId, 100);

      setRows(response?.entries || response?.leaderboard || []);
      setLastUpdated(new Date());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    load();

    contestsAPI
      .list()
      .then((response) => {
        const contests = Array.isArray(response)
          ? response
          : response?.contests || [];

        setContest(
          contests.find(
            (item) => String(item.contest_id) === String(contestId)
          ) || null
        );
      })
      .catch(() => setContest(null));

    const timer = window.setInterval(load, 15000);

    return () => window.clearInterval(timer);
  }, [contestId, load]);

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

  const topThree = rows.slice(0, 3);

  return (
    <div
      className="max-w-5xl mx-auto px-4 lg:px-8 py-10"
      data-testid="contest-leaderboard-page"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Select contest
        </Link>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BFF]"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Exact Global Leaderboard hero styling */}
      <div className="bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-3xl p-8 mb-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl" />
        <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-fuchsia-500/20 rounded-full blur-3xl" />

        <div className="relative">
          <div className="text-white/80 text-xs uppercase tracking-widest flex items-center gap-2">
            <Flame className="w-4 h-4" />
            Prize League contest leaderboard
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-extrabold mt-2">
            {contest?.title || 'Contest Rankings'}
          </h1>

          <p className="text-white/80 text-sm mt-2 max-w-xl">
            Highest verified score wins. Rankings refresh every 15 seconds.
          </p>

          <div className="text-white/50 text-xs mt-3">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Loading rankings…'}
          </div>
        </div>
      </div>

      {/* Exact Global Leaderboard podium styling */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6" data-testid="podium">
          {[1, 0, 2].map((index) => {
            const player = topThree[index];

            if (!player) return <div key={index} />;

            const rank = player.rank || index + 1;
            const style = medal(rank);

            const heights = {
              1: 'h-40 mt-6',
              0: 'h-52',
              2: 'h-32 mt-14',
            };

            const gradients = {
              1: 'from-slate-300 to-slate-500',
              0: 'from-amber-400 via-orange-500 to-rose-500',
              2: 'from-amber-700 to-amber-900',
            };

            return (
              <div
                key={player.user_id || `${rank}-${index}`}
                className={`rounded-2xl bg-gradient-to-b ${gradients[index]} ${heights[index]} p-4 text-white flex flex-col items-center justify-end text-center shadow-lg`}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold mb-2 bg-white/20">
                  {style.Icon ? (
                    <style.Icon className="w-6 h-6" />
                  ) : (
                    rank
                  )}
                </div>

                <div className="font-bold truncate w-full">
                  {player.user_name || 'Player'}
                </div>

                <div className="text-2xl font-extrabold font-display">
                  {getScore(player).toFixed(2)}
                </div>

                <div className="text-xs opacity-90">
                  {getAccuracy(player).toFixed(2)}% ·{' '}
                  {formatDuration(getDurationMs(player))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Exact Global Leaderboard list styling */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">
            Loading leaderboard…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No scores yet for this contest.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const style = medal(row.rank);
              const isMe =
                row.is_current_user ||
                String(row.user_id) === String(user?.user_id);

              const isOpen = expanded === row.user_id;

              return (
                <li
                  key={row.user_id || `${row.rank}-${row.public_id}`}
                  data-testid={`contest-row-${row.rank}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(isOpen ? null : row.user_id)
                    }
                    className={`w-full flex items-center gap-3 p-4 text-left transition hover:bg-slate-50 ${
                      isMe
                        ? 'bg-[#FFD54A]/15 border-l-4 border-[#FFD54A]'
                        : row.rank <= 3
                          ? 'bg-gradient-to-r from-amber-50/50 to-transparent'
                          : ''
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${style.cls}`}
                    >
                      {style.Icon ? (
                        <style.Icon className="w-5 h-5" />
                      ) : (
                        row.rank
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate flex items-center gap-1">
                        {isMe ? 'You' : row.user_name || 'Player'}

                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFD54A] text-slate-900 font-bold">
                            YOU
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        {row.public_id ? `#${row.public_id} · ` : ''}
                        {getAccuracy(row).toFixed(2)}% accuracy ·{' '}
                        {formatDuration(getDurationMs(row))}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-display text-2xl font-extrabold text-orange-600">
                        {getScore(row).toFixed(2)}
                      </div>

                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        / 100
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-slate-50/60 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white p-2">
                        <div className="text-[10px] text-slate-500 uppercase flex items-center justify-center gap-1">
                          <Target className="w-3 h-3" />
                          Accuracy
                        </div>

                        <div className="font-bold text-slate-900">
                          {getAccuracy(row).toFixed(2)}%
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-2">
                        <div className="text-[10px] text-slate-500 uppercase flex items-center justify-center gap-1">
                          <SpeedIcon className="w-3 h-3" />
                          Time
                        </div>

                        <div className="font-bold text-slate-900">
                          {formatDuration(getDurationMs(row))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-2">
                        <div className="text-[10px] text-slate-500 uppercase">
                          Attempts
                        </div>

                        <div className="font-bold text-slate-900">
                          {row.attempts || 1}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 text-center">
          Contest-specific rankings only · score → accuracy → time
        </div>
      </div>
    </div>
  );
}
