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
      className="min-h-[calc(100vh-4rem)] bg-[#0B0D1F]"
      data-testid="leaderboard-page"
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link
            to="/competitions"
            className="text-sm text-white/60 hover:text-white inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to contests
          </Link>

          <button
            type="button"
            onClick={loadLeaderboard}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#FFD54A] hover:text-white"
            data-testid="leaderboard-refresh"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div
          className="relative overflow-hidden rounded-3xl mb-6 border border-white/5 p-6"
          style={{
            background:
              'radial-gradient(120% 100% at 0% 0%, #6C2BFF33 0%, transparent 50%), radial-gradient(120% 100% at 100% 100%, #FFD54A22 0%, transparent 55%), linear-gradient(180deg, #161433 0%, #0B0D1F 100%)',
          }}
        >
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#FFD54A]/10 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 rounded-full bg-[#6C2BFF]/25 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="text-[#FFD54A]/90 text-[11px] uppercase tracking-[0.35em] font-bold">
                Contest Leaderboard
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-black text-white mt-2 leading-[1]">
                {contest?.title || 'Contest'}
              </h1>
              <p className="text-white/60 text-sm mt-2">
                {closed
                  ? 'Leaderboard locked. The contest is no longer accepting official scores.'
                  : 'Live verified rankings · updates every 15s'}
              </p>
            </div>
            <div className="text-xs text-white/50">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Loading rankings…'}
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label="Participants" value={stats.participants || 0} Icon={Users} tone="purple" />
            <StatCard label="Attempts" value={stats.completed_attempts || 0} Icon={Activity} tone="emerald" />
            <StatCard label="Highest score" value={Number(stats.highest_score || 0).toFixed(2)} Icon={Target} tone="gold" />
            <StatCard label="Fastest time" value={formatDuration(stats.fastest_time_ms)} Icon={Clock3} tone="cyan" mono />
          </div>
        )}

        {user && (
          <div
            className="relative rounded-3xl border border-[#FFD54A]/40 bg-gradient-to-br from-[#FFD54A]/15 via-[#161433]/70 to-[#0B0D1F] p-5 md:p-6 mb-6"
            data-testid="my-leaderboard-position"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.25em] font-extrabold text-[#FFD54A]">
                  Your Position
                </div>
                <div className="font-display text-3xl md:text-4xl font-black text-white mt-1">
                  {myPosition ? `Rank #${myPosition.rank}` : 'Not ranked yet'}
                </div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] text-slate-900 flex items-center justify-center shadow-[0_10px_30px_-10px_#FFD54A88]">
                <Trophy className="w-7 h-7" />
              </div>
            </div>

            {myPosition ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                <MiniStat label="Score" value={`${Number(myPosition.points || 0).toFixed(2)}`} suffix="/ 100" tone="gold" />
                <MiniStat label="Accuracy" value={`${(Number(myPosition.accuracy || 0) * 100).toFixed(2)}%`} />
                <MiniStat label="Time" value={formatDuration(myPosition.duration_ms)} mono />
                <MiniStat label="Attempts" value={myPosition.attempts || 0} />
              </div>
            ) : (
              <p className="text-sm text-white/60 mt-4">
                Complete an official game attempt to receive your position in this contest.
              </p>
            )}
          </div>
        )}

        <div className="bg-[#161433]/70 border border-white/5 rounded-3xl overflow-hidden backdrop-blur">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="font-display font-extrabold text-white">Top Players</div>
            <div className="text-[11px] text-white/50 mt-0.5">
              Score → accuracy → millisecond time → earliest valid submission
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-white/50">Loading leaderboard…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-white/50">
              No verified scores yet. Be the first to complete an official attempt.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((row) => {
                const isCurrent = row.is_current_user || row.user_id === user?.user_id;
                const rankBadge = ({
                  1: 'bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] text-slate-900',
                  2: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900',
                  3: 'bg-gradient-to-br from-[#F0A56D] to-[#7A4522] text-white',
                })[row.rank] || 'bg-white/10 text-white';
                return (
                  <li
                    key={row.user_id}
                    className={`flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 transition ${
                      isCurrent
                        ? 'bg-gradient-to-r from-[#FFD54A]/15 via-[#FFD54A]/5 to-transparent border-l-4 border-[#FFD54A]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                    data-testid={`leaderboard-row-${row.rank}`}
                  >
                    <div className={`w-11 h-11 rounded-xl grid place-items-center font-black text-sm shrink-0 ${rankBadge}`}>
                      #{row.rank}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span className="truncate">{isCurrent ? 'You' : row.user_name}</span>
                        {isCurrent && (
                          <span className="text-[9px] uppercase tracking-wider bg-slate-900 text-[#FFD54A] rounded-full px-2 py-0.5 font-extrabold">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-white/50 mt-0.5">
                        {row.public_id ? `#${row.public_id} · ` : ''}
                        {Number(row.accuracy_pct || 0).toFixed(2)}% accuracy · {row.attempts} attempt{row.attempts !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 md:flex md:items-center md:gap-8">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Time</div>
                        <div className="font-mono font-bold text-white">{formatDuration(row.duration_ms)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-2xl font-black text-[#FFD54A]">
                          {Number(row.points || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">/ 100</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, Icon, tone, mono }) {
  const iconTone = {
    purple: 'text-[#8B5CFF]',
    emerald: 'text-emerald-400',
    gold: 'text-[#FFD54A]',
    cyan: 'text-cyan-300',
  }[tone] || 'text-white';
  return (
    <div className="rounded-2xl bg-[#161433]/70 border border-white/5 p-4 backdrop-blur">
      <Icon className={`w-5 h-5 ${iconTone}`} />
      <div className="text-[10px] uppercase tracking-widest text-white/50 mt-3">{label}</div>
      <div className={`${mono ? 'font-mono' : 'font-display'} text-xl md:text-2xl font-extrabold text-white mt-0.5`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, suffix, mono, tone }) {
  const isGold = tone === 'gold';
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
      <div className={`${mono ? 'font-mono text-lg' : 'font-display text-xl'} font-extrabold ${isGold ? 'text-[#FFD54A]' : 'text-white'} mt-0.5`}>
        {value}
        {suffix && <span className="text-xs text-white/40 font-medium ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
