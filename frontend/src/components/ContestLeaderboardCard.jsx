import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesAPI } from '../lib/api';
import { Crown, Flame, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * ContestLeaderboardCard — embeddable per-contest live board.
 * 2026-08 redesign to match the new dark/gold leaderboard aesthetic.
 * Auto-refreshes every 15s. Shows top N players by normalized score.
 */
export default function ContestLeaderboardCard({ contestId, contestTitle, limit = 5, showFullLink = true }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!contestId) return undefined;
    // Fetch a wider slice so we can locate the current user even if they're
    // outside the visible top N. `limit` still controls what we RENDER.
    const load = () => gamesAPI.leaderboard(contestId, Math.max(limit, 100))
      .then(r => { setRows(r?.entries || r?.leaderboard || []); setLoaded(true); })
      .catch(() => setLoaded(true));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [contestId, limit]);

  const me = user && rows.find(r => r.user_id === user.user_id);
  const visible = rows.slice(0, limit);

  return (
    <div
      className="rounded-3xl overflow-hidden border border-white/5 shadow-2xl"
      style={{ background: 'linear-gradient(180deg, #1A1533 0%, #0B0D1F 100%)' }}
      data-testid={`contest-leaderboard-card-${contestId}`}
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] text-slate-900 shadow">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <div className="text-white font-display font-black text-sm md:text-base">Live Leaderboard</div>
            <div className="text-[10px] uppercase tracking-widest text-[#FFD54A]/80 flex items-center gap-1">
              <Flame className="w-3 h-3" /> updates every 15s
            </div>
          </div>
        </div>
        {showFullLink && (
          <Link
            to={`/leaderboard/${contestId}`}
            data-testid={`view-full-leaderboard-${contestId}`}
            className="text-[11px] font-bold text-[#FFD54A] hover:text-white inline-flex items-center gap-1"
          >
            View full <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {!loaded ? (
        <div className="p-6 text-center text-white/50 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-white/50 text-sm" data-testid={`empty-leaderboard-${contestId}`}>
          No scores yet — be first to play <b className="text-white">{contestTitle || 'this contest'}</b>.
        </div>
      ) : (
        <>
          {me && (
            <div
              data-testid={`my-rank-strip-${contestId}`}
              className="px-4 py-3 flex items-center gap-3 border-b border-[#FFD54A]/40"
              style={{ background: 'linear-gradient(135deg, #FFD54A 0%, #FFB020 60%, #FF8A3C 100%)' }}
            >
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-[#FFD54A] grid place-items-center font-black text-xs shrink-0">
                #{me.rank}
              </div>
              <div className="flex-1 min-w-0 text-slate-900">
                <div className="text-[10px] uppercase tracking-[0.3em] font-black opacity-70">Your rank</div>
                <div className="font-black text-sm">
                  You
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-[#FFD54A] align-middle font-extrabold tracking-wider">YOU</span>
                  <span className="ml-2 text-[10px] font-bold opacity-70">of {rows.length}</span>
                </div>
              </div>
              <div className="text-right shrink-0 text-slate-900">
                <div className="font-display text-lg font-black leading-none">{(Number(me.normalized_score) || 0).toFixed(2)}</div>
                <div className="text-[9px] uppercase tracking-widest opacity-70">/ 100</div>
              </div>
            </div>
          )}
          <ul className="divide-y divide-white/5">
            {visible.map(r => {
            const durS = r.duration_s ?? (r.duration_ms ? +(r.duration_ms / 1000).toFixed(2) : 0);
            const accPct = r.accuracy_pct ?? Math.round((r.accuracy || 0) * 100);
            const isTop = r.rank <= 3;
            const rankBadge = ({
              1: { bg: 'bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C]', text: 'text-slate-900' },
              2: { bg: 'bg-gradient-to-br from-slate-200 to-slate-400', text: 'text-slate-900' },
              3: { bg: 'bg-gradient-to-br from-[#F0A56D] to-[#7A4522]', text: 'text-white' },
            })[r.rank] || { bg: 'bg-white/10', text: 'text-white' };
            return (
              <li
                key={r.user_id}
                className={`flex items-center gap-3 px-5 py-3 ${isTop ? 'bg-white/[0.02]' : ''}`}
                data-testid={`contest-lb-row-${contestId}-${r.rank}`}
              >
                <div className={`w-9 h-9 rounded-lg grid place-items-center font-black text-xs shrink-0 ${rankBadge.bg} ${rankBadge.text}`}>
                  #{r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate">{r.user_name || 'Player'}</div>
                  <div className="text-[10px] text-white/50">🎯 {accPct}% · ⏱ {typeof durS === 'number' ? durS.toFixed(2) : durS}s</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-xl font-black text-[#FFD54A]">{(r.normalized_score ?? 0).toFixed(2)}</div>
                  <div className="text-[9px] text-white/40 uppercase tracking-widest">/ 100</div>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}
