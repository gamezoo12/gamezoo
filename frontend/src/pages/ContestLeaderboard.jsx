import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { gamesAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Trophy,
  Medal,
  Award,
  ArrowLeft,
  Clock3,
  Target,
  Users,
  Activity,
  RefreshCw,
} from 'lucide-react';

const formatDuration = (durationMs) => {
  if (durationMs == null) return '—';

  const safe = Math.max(0, Math.floor(Number(durationMs) || 0));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const milliseconds = safe % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

export default function ContestLeaderboard() {
  const { contestId } = useParams();
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [myPosition, setMyPosition] = useState(null);
  const [stats, setStats] = useState(null);
  const [contest, setContest] = useState(null);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await gamesAPI.leaderboard(contestId, 50);

      setRows(response?.entries || []);
      setMyPosition(response?.my_position || null);
      setStats(response?.stats || null);
      setClosed(Boolean(response?.closed));
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    loadLeaderboard();

    contestsAPI
      .list()
      .then((list) => {
        setContest(
          list.find((item) => item.contest_id === contestId) || null
        );
      })
      .catch(() => {});

    const timer = window.setInterval(loadLeaderboard, 15000);

    return () => window.clearInterval(timer);
  }, [contestId, loadLeaderboard]);

  const medal = (rank) => {
    if (rank === 1) {
      return {
        Icon: Trophy,
        cls: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
      };
    }

    if (rank === 2) {
      return {
        Icon: Medal,
        cls: 'bg-gradient-to-br from-slate-300 to-slate-500 text-white',
      };
    }

    if (rank === 3) {
      return {
        Icon: Award,
        cls: 'bg-gradient-to-br from-amber-700 to-amber-900 text-white',
      };
    }

    return {
      Icon: null,
      cls: 'bg-slate-100 text-slate-500',
    };
  };

  return (
    <div
      className="max-w-5xl mx-auto px-4 lg:px-8 py-8"
      data-testid="leaderboard-page"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          to="/competitions"
          className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to contests
        </Link>

        <button
          type="button"
          onClick={loadLeaderboard}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BFF] hover:text-[#4A15D9]"
          data-testid="leaderboard-refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-3xl p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-white/80 text-xs uppercase tracking-widest">
              Individual Contest Leaderboard
            </div>

            <h1 className="font-display text-3xl font-extrabold">
              {contest?.title || 'Contest'}
            </h1>

            <p className="text-white/80 text-sm mt-1">
              {closed
                ? 'Leaderboard locked. The contest is no longer accepting official scores.'
                : 'Live verified rankings. Updates every 15 seconds.'}
            </p>
          </div>

          <div className="text-xs text-white/60">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Loading rankings…'}
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <Users className="w-5 h-5 text-[#6C2BFF]" />
            <div className="text-xs uppercase tracking-wider text-slate-400 mt-3">
              Participants
            </div>
            <div className="font-display text-2xl font-extrabold text-slate-900">
              {stats.participants || 0}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <Activity className="w-5 h-5 text-emerald-500" />
            <div className="text-xs uppercase tracking-wider text-slate-400 mt-3">
              Attempts
            </div>
            <div className="font-display text-2xl font-extrabold text-slate-900">
              {stats.completed_attempts || 0}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <Target className="w-5 h-5 text-orange-500" />
            <div className="text-xs uppercase tracking-wider text-slate-400 mt-3">
              Highest Score
            </div>
            <div className="font-display text-2xl font-extrabold text-slate-900">
              {Number(stats.highest_score || 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <Clock3 className="w-5 h-5 text-sky-500" />
            <div className="text-xs uppercase tracking-wider text-slate-400 mt-3">
              Fastest Time
            </div>
            <div className="font-mono text-lg font-extrabold text-slate-900 mt-1">
              {formatDuration(stats.fastest_time_ms)}
            </div>
          </div>
        </div>
      )}

      {user && (
        <div
          className="rounded-3xl border-2 border-[#6C2BFF] bg-gradient-to-br from-[#6C2BFF]/10 via-white to-amber-50 p-5 md:p-6 mb-6"
          data-testid="my-leaderboard-position"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] font-extrabold text-[#6C2BFF]">
                Your Position
              </div>

              <div className="font-display text-3xl font-black text-slate-900 mt-1">
                {myPosition ? `Rank #${myPosition.rank}` : 'Not ranked yet'}
              </div>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-[#6C2BFF] text-white flex items-center justify-center">
              <Trophy className="w-7 h-7" />
            </div>
          </div>

          {myPosition ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <div className="rounded-xl bg-white/80 border border-white p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Score
                </div>
                <div className="font-display text-xl font-extrabold text-orange-600">
                  {Number(myPosition.points || 0).toFixed(2)}
                  <span className="text-xs text-slate-400"> / 100</span>
                </div>
              </div>

              <div className="rounded-xl bg-white/80 border border-white p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Accuracy
                </div>
                <div className="font-display text-xl font-extrabold text-slate-900">
                  {(Number(myPosition.accuracy || 0) * 100).toFixed(2)}%
                </div>
              </div>

              <div className="rounded-xl bg-white/80 border border-white p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Time
                </div>
                <div className="font-mono text-base font-extrabold text-slate-900 mt-1">
                  {formatDuration(myPosition.duration_ms)}
                </div>
              </div>

              <div className="rounded-xl bg-white/80 border border-white p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Attempts Used
                </div>
                <div className="font-display text-xl font-extrabold text-slate-900">
                  {myPosition.attempts || 0}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 mt-4">
              Complete an official game attempt to receive your position in
              this contest.
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="font-display font-extrabold text-slate-900">
            Top Players
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Score → accuracy → millisecond time → earliest valid submission
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">
            Loading leaderboard…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No verified scores yet. Be the first to complete an official
            attempt.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const rankMedal = medal(row.rank);
              const isCurrent =
                row.is_current_user || row.user_id === user?.user_id;

              return (
                <li
                  key={row.user_id}
                  className={`flex flex-col md:flex-row md:items-center gap-3 p-4 ${
                    isCurrent
                      ? 'bg-[#6C2BFF]/8 border-l-4 border-[#6C2BFF]'
                      : row.rank <= 3
                        ? 'bg-gradient-to-r from-amber-50/40 to-transparent'
                        : ''
                  }`}
                  data-testid={`leaderboard-row-${row.rank}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${rankMedal.cls}`}
                  >
                    {rankMedal.Icon ? (
                      <rankMedal.Icon className="w-5 h-5" />
                    ) : (
                      row.rank
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span>{row.user_name}</span>

                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider bg-[#6C2BFF] text-white rounded-full px-2 py-0.5">
                          You
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500">
                      {row.public_id ? `#${row.public_id} · ` : ''}
                      {Number(row.accuracy_pct || 0).toFixed(2)}% accuracy ·{' '}
                      {row.attempts} attempt{row.attempts !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:flex md:items-center md:gap-8">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Time
                      </div>
                      <div className="font-mono font-bold text-slate-900">
                        {formatDuration(row.duration_ms)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-display text-2xl font-extrabold text-orange-600">
                        {Number(row.points || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        out of 100
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
