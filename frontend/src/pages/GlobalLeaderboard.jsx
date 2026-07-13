import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesAPI, contestsAPI } from '../lib/api';
import { Trophy, Medal, Award, Crown, ArrowRight, Flame, Zap } from 'lucide-react';

/**
 * Global leaderboard — public page.
 * Shows top players across ALL contests + per-contest leaderboards for game-enabled contests.
 * Auto-refreshes every 15s.
 */
export default function GlobalLeaderboard() {
  const [rows, setRows] = useState([]);
  const [contests, setContests] = useState([]);
  const [tab, setTab] = useState('global'); // 'global' | contest_id

  useEffect(() => {
    const load = () => gamesAPI.globalLeaderboard(50).then(r => setRows(r?.leaderboard || [])).catch(() => {});
    load();
    contestsAPI.list().then(list => setContests(list.filter(c => c.game_type))).catch(() => {});
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const medal = (rank) => {
    if (rank === 1) return { Icon: Crown, cls: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-4 ring-amber-200' };
    if (rank === 2) return { Icon: Trophy, cls: 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' };
    if (rank === 3) return { Icon: Medal, cls: 'bg-gradient-to-br from-amber-700 to-amber-900 text-white' };
    return { Icon: null, cls: 'bg-slate-100 text-slate-500' };
  };

  const topThree = rows.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10" data-testid="global-leaderboard-page">
      <div className="bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-3xl p-8 mb-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl" />
        <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-fuchsia-500/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="text-white/80 text-xs uppercase tracking-widest flex items-center gap-2">
            <Flame className="w-4 h-4" /> Prize League leaderboard
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-extrabold mt-2">Top players, live.</h1>
          <p className="text-white/80 text-sm mt-2 max-w-xl">Every score across every game counts. Highest points win. Auto-refreshes every 15 seconds.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar" data-testid="leaderboard-tabs">
        <button
          onClick={() => setTab('global')}
          data-testid="tab-global"
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border ${tab === 'global' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}
        >
          <Zap className="w-3.5 h-3.5 inline mr-1" /> Global
        </button>
        {contests.map(c => (
          <button
            key={c.contest_id}
            onClick={() => setTab(c.contest_id)}
            data-testid={`tab-contest-${c.contest_id}`}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border ${tab === c.contest_id ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-700 border-slate-200 hover:border-orange-400'}`}
          >
            {c.title.length > 26 ? `${c.title.slice(0, 26)}…` : c.title}
          </button>
        ))}
      </div>

      {tab === 'global' ? (
        <>
          {/* Podium */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6" data-testid="podium">
              {[1, 0, 2].map(idx => {
                const p = topThree[idx];
                if (!p) return <div key={idx} />;
                const m = medal(p.rank);
                const heights = { 1: 'h-40 mt-6', 0: 'h-52', 2: 'h-32 mt-14' };
                const grads = { 1: 'from-slate-300 to-slate-500', 0: 'from-amber-400 via-orange-500 to-rose-500', 2: 'from-amber-700 to-amber-900' };
                return (
                  <div key={p.user_id} className={`rounded-2xl bg-gradient-to-b ${grads[idx]} ${heights[idx]} p-4 text-white flex flex-col items-center justify-end text-center shadow-lg`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold mb-2 bg-white/20`}>
                      {m.Icon ? <m.Icon className="w-6 h-6" /> : p.rank}
                    </div>
                    <div className="font-bold truncate w-full">{p.user_name}</div>
                    <div className="text-2xl font-extrabold font-display">{(p.total_points || 0).toLocaleString()}</div>
                    <div className="text-xs opacity-90">{p.contests_played} contest{p.contests_played !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-10 text-center text-slate-500" data-testid="empty-global">
                No scores yet. Be the first player on the board!
                <div className="mt-4"><Link to="/competitions" className="text-orange-600 font-semibold hover:underline inline-flex items-center gap-1">Browse contests <ArrowRight className="w-4 h-4" /></Link></div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map(p => {
                  const m = medal(p.rank);
                  return (
                    <li key={p.user_id} data-testid={`global-row-${p.rank}`} className={`flex items-center gap-3 p-4 ${p.rank <= 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${m.cls}`}>
                        {m.Icon ? <m.Icon className="w-5 h-5" /> : p.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{p.user_name}</div>
                        <div className="text-xs text-slate-500">{p.contests_played} contest{p.contests_played !== 1 ? 's' : ''} played</div>
                      </div>
                      <div className="font-display text-2xl font-extrabold text-orange-600">{(p.total_points || 0).toLocaleString()}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <ContestBoard contestId={tab} />
      )}
    </div>
  );
}

function ContestBoard({ contestId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const load = () => gamesAPI.leaderboard(contestId, 25).then(r => setRows(r?.leaderboard || [])).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [contestId]);

  const medal = (rank) => {
    if (rank === 1) return { Icon: Trophy, cls: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' };
    if (rank === 2) return { Icon: Medal, cls: 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' };
    if (rank === 3) return { Icon: Award, cls: 'bg-gradient-to-br from-amber-700 to-amber-900 text-white' };
    return { Icon: null, cls: 'bg-slate-100 text-slate-500' };
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="contest-board">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No scores yet for this contest.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(r => {
            const m = medal(r.rank);
            return (
              <li key={r.user_id} className={`flex items-center gap-3 p-4 ${r.rank <= 3 ? 'bg-gradient-to-r from-amber-50/40 to-transparent' : ''}`} data-testid={`contest-row-${r.rank}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${m.cls}`}>
                  {m.Icon ? <m.Icon className="w-5 h-5" /> : r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{r.user_name}</div>
                  <div className="text-xs text-slate-500">{(r.duration_ms / 1000).toFixed(1)}s · {Math.round(r.accuracy * 100)}% accuracy · {r.attempts} attempt{r.attempts !== 1 ? 's' : ''}</div>
                </div>
                <div className="font-display text-2xl font-extrabold text-orange-600">{r.points}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
