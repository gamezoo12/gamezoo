import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { gamesAPI, contestsAPI } from '../lib/api';
import { Trophy, Medal, Award, ArrowLeft } from 'lucide-react';

export default function ContestLeaderboard() {
  const { contestId } = useParams();
  const [rows, setRows] = useState([]);
  const [contest, setContest] = useState(null);

  useEffect(() => {
    const load = () => gamesAPI.leaderboard(contestId).then(r => setRows(r?.leaderboard || [])).catch(() => {});
    load();
    contestsAPI.list().then(list => setContest(list.find(x => x.contest_id === contestId) || null)).catch(() => {});
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
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8" data-testid="leaderboard-page">
      <Link to="/competitions" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" /> Back to contests</Link>

      <div className="bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-3xl p-6 mb-6">
        <div className="text-white/80 text-xs uppercase tracking-widest">Leaderboard</div>
        <h1 className="font-display text-3xl font-extrabold">{contest?.title || 'Contest'}</h1>
        <p className="text-white/80 text-sm mt-1">Live rankings — updates every 15 seconds. Highest score wins the prize.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No scores yet. Buy a ticket and be the first to play!</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(r => {
              const m = medal(r.rank);
              return (
                <li key={r.user_id} className={`flex items-center gap-3 p-4 ${r.rank <= 3 ? 'bg-gradient-to-r from-amber-50/40 to-transparent' : ''}`} data-testid={`leaderboard-row-${r.rank}`}>
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
    </div>
  );
}
