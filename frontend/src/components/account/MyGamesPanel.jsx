import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Play, ChevronRight, Trophy, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { ordersAPI } from '../../lib/api';

/**
 * Prize League — My Games panel.
 * Lists every skill-game ticket the user owns with attempts + best score,
 * and offers Play / Continue / View leaderboard depending on state.
 */
export default function MyGamesPanel() {
  const [games, setGames] = useState(null);

  useEffect(() => {
    ordersAPI.myGames()
      .then(r => setGames(r?.games || []))
      .catch(() => setGames([]));
  }, []);

  if (games === null) return <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm" data-testid="my-games-loading">Loading your games…</div>;

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="my-games-empty">
        <Gamepad2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-semibold">No skill games yet</p>
        <p className="text-slate-400 text-sm mt-1">Buy a ticket for a contest that includes a skill game and it will appear here.</p>
        <Link to="/competitions" className="inline-flex items-center gap-1 text-[#6C2BFF] font-semibold mt-4 hover:underline">
          Browse contests <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const timeLeft = (endDate) => {
    if (!endDate) return '';
    const diff = new Date(endDate) - Date.now();
    if (diff <= 0) return 'Closed';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
  };

  const badges = {
    ready:       { label: 'Ready to play', cls: 'bg-emerald-100 text-emerald-800', Icon: Play },
    in_progress: { label: 'Attempts remaining', cls: 'bg-amber-100 text-amber-800', Icon: Clock },
    completed:   { label: 'All attempts used', cls: 'bg-slate-100 text-slate-600', Icon: CheckCircle2 },
    expired:     { label: 'Contest closed', cls: 'bg-rose-100 text-rose-700', Icon: XCircle },
  };

  return (
    <div className="space-y-3" data-testid="my-games-list">
      {games.map(g => {
        const b = badges[g.status] || badges.ready;
        const playable = g.status === 'ready' || g.status === 'in_progress';
        return (
          <div key={g.ticket_id} className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col md:flex-row gap-4 md:items-center" data-testid={`my-games-row-${g.ticket_id}`}>
            <img src={g.contest_image} alt={g.contest_title} loading="lazy" className="w-full md:w-32 h-32 md:h-20 object-cover rounded-xl bg-slate-100" />

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-widest ${b.cls}`}>
                  <b.Icon className="w-3 h-3" /> {b.label}
                </span>
                <span className="text-xs text-slate-500">{timeLeft(g.end_date)}</span>
              </div>
              <div className="font-display font-bold text-slate-900 mt-1 truncate">{g.contest_title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Attempts <b className="text-slate-900">{g.attempts_used}/{g.max_attempts}</b>
                {g.best_points != null && <> · Best score <b className="text-[#6C2BFF]">{g.best_points}</b></>}
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              {playable ? (
                <Link to={`/play/${g.contest_id}/${g.ticket_id}`} data-testid={`play-btn-${g.ticket_id}`}>
                  <button className="pl-btn-gold px-4 py-2 rounded-lg text-sm font-extrabold inline-flex items-center gap-1.5">
                    {g.attempts_used > 0 ? <>Continue <ChevronRight className="w-4 h-4" /></> : <><Play className="w-4 h-4" /> Play Now</>}
                  </button>
                </Link>
              ) : (
                <Link to={`/leaderboard/${g.contest_id}`}>
                  <button className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 hover:border-[#6C2BFF] hover:text-[#6C2BFF] inline-flex items-center gap-1.5">
                    <Trophy className="w-4 h-4" /> Leaderboard
                  </button>
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
