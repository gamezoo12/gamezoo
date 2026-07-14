import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Trophy, Medal, ArrowRight } from 'lucide-react';
import { gamesAPI } from '../../lib/api';

const MEDALS = [
  { Icon: Crown,  ring: 'from-[#FFD54A] to-[#F5B800]', ringCls: 'ring-[#FFD54A]' },
  { Icon: Trophy, ring: 'from-slate-300 to-slate-500', ringCls: 'ring-slate-300' },
  { Icon: Medal,  ring: 'from-amber-700 to-amber-900', ringCls: 'ring-amber-700' },
];

export default function LeaderboardPreview() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    gamesAPI.globalLeaderboard(5).then(r => setRows(r?.leaderboard || [])).catch(() => {});
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="py-8 md:py-12 bg-slate-50" data-testid="leaderboard-preview">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs uppercase font-bold tracking-widest text-[#6C2BFF]">Leaderboard</div>
              <h3 className="mt-1 font-display text-2xl md:text-3xl font-extrabold text-[#0B0D1F]">Top Players</h3>
            </div>
            <Link to="/leaderboard" className="text-sm font-semibold text-[#6C2BFF] hover:text-[#4A15D9] inline-flex items-center gap-1" data-testid="leaderboard-view-all">
              View full leaderboard <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map(r => {
              const m = r.rank <= 3 ? MEDALS[r.rank - 1] : null;
              return (
                <li key={r.user_id} className="flex items-center gap-3 py-3" data-testid={`lb-preview-row-${r.rank}`}>
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${m ? m.ring : 'from-slate-100 to-slate-200'} flex items-center justify-center font-bold text-slate-900 ring-2 ${m ? m.ringCls : 'ring-slate-200'}`}>
                    {m ? <m.Icon className="w-5 h-5 text-white drop-shadow" /> : r.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{r.user_name}</div>
                    <div className="text-xs text-slate-500">{r.contests_played} contest{r.contests_played !== 1 ? 's' : ''} played</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl font-extrabold text-[#6C2BFF]">{r.total_points.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Points</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
