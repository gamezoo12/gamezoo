import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesAPI } from '../lib/api';
import { Trophy, Medal, Award, ArrowRight, Sparkles } from 'lucide-react';

/**
 * Embeddable per-contest leaderboard card.
 * Auto-refreshes every 15s. Shows top N players by best score.
 */
export default function ContestLeaderboardCard({ contestId, contestTitle, limit = 5, showFullLink = true }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!contestId) return undefined;
    const load = () => gamesAPI.leaderboard(contestId, limit)
      .then(r => { setRows(r?.leaderboard || []); setLoaded(true); })
      .catch(() => setLoaded(true));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [contestId, limit]);

  const medal = (rank) => {
    if (rank === 1) return { Icon: Trophy, cls: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' };
    if (rank === 2) return { Icon: Medal, cls: 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' };
    if (rank === 3) return { Icon: Award, cls: 'bg-gradient-to-br from-amber-700 to-amber-900 text-white' };
    return { Icon: null, cls: 'bg-slate-100 text-slate-500' };
  };

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-rose-50 to-fuchsia-50 overflow-hidden" data-testid={`contest-leaderboard-card-${contestId}`}>
      <div className="px-5 py-4 border-b border-orange-200/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 flex items-center justify-center text-white shadow">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-display font-bold text-slate-900">Live leaderboard</div>
            <div className="text-[10px] uppercase tracking-widest text-orange-700/80">Highest score wins · updates every 15s</div>
          </div>
        </div>
        {showFullLink && (
          <Link
            to={`/leaderboard/${contestId}`}
            data-testid={`view-full-leaderboard-${contestId}`}
            className="text-xs font-semibold text-orange-700 hover:text-orange-900 inline-flex items-center gap-1"
          >
            View full <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {!loaded ? (
        <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm" data-testid={`empty-leaderboard-${contestId}`}>
          No scores yet — be the first to play <b className="text-slate-900">{contestTitle || 'this contest'}</b> and top the board.
        </div>
      ) : (
        <ul className="divide-y divide-orange-200/50">
          {rows.map(r => {
            const m = medal(r.rank);
            return (
              <li key={r.user_id} className="flex items-center gap-3 px-5 py-3" data-testid={`contest-lb-row-${contestId}-${r.rank}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 ${m.cls}`}>
                  {m.Icon ? <m.Icon className="w-4 h-4" /> : r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate text-sm">{r.user_name}</div>
                  <div className="text-[11px] text-slate-500">{(r.duration_ms / 1000).toFixed(1)}s · {Math.round(r.accuracy * 100)}% accuracy</div>
                </div>
                <div className="font-display text-xl font-extrabold text-orange-600">{r.points}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
