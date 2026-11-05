import { useEffect, useState } from 'react';
import { Eye, MousePointerClick, Play, Trophy, Users, XCircle } from 'lucide-react';
import { freeGamesAdminAPI } from '../../lib/api';

const Stat = ({ icon: Icon, label, value, testId }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={testId}>
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4" />{label}</div>
    <div className="mt-1 text-2xl font-black text-slate-900">{Number(value || 0).toLocaleString('en-GB')}</div>
  </div>
);

function Bars({ series }) {
  const max = Math.max(1, ...series.map((s) => s.starts));
  return (
    <div className="flex h-32 items-end gap-1" data-testid="free-games-daily-chart">
      {series.map((s) => (
        <div key={s.date} className="group relative flex-1" title={`${s.date}: ${s.starts} starts, ${s.passes} passes`}>
          <div className="w-full rounded-t bg-indigo-500/80" style={{ height: `${(s.starts / max) * 120}px` }} />
          <div className="absolute bottom-0 w-full rounded-t bg-emerald-500" style={{ height: `${(s.passes / max) * 120}px` }} />
        </div>
      ))}
    </div>
  );
}

export function FreeGamesStats({ names }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); freeGamesAdminAPI.stats(days).then(setData).catch(() => setData({ totals: {}, games: [], series: [], ads: [] })); }, [days]);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
  const t = data.totals;
  return (
    <div className="space-y-5" data-testid="free-games-stats">
      <div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 text-xs font-black ${days === d ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`} data-testid={`free-games-days-${d}`}>Last {d} days</button>)}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Play} label="Level starts" value={t.starts} testId="fg-stat-starts" />
        <Stat icon={Trophy} label="Levels passed" value={t.passes} testId="fg-stat-passes" />
        <Stat icon={XCircle} label="Levels failed" value={t.fails} testId="fg-stat-fails" />
        <Stat icon={Users} label="Signed-in players" value={t.players} testId="fg-stat-players" />
        <Stat icon={Eye} label="Ad views" value={t.ad_impressions} testId="fg-stat-ad-views" />
        <Stat icon={MousePointerClick} label="Ad clicks" value={t.ad_clicks} testId="fg-stat-ad-clicks" />
      </div>
      {data.series.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-2 text-sm font-black text-slate-800">Daily plays <span className="ml-2 text-xs font-bold text-indigo-500">starts</span> <span className="text-xs font-bold text-emerald-600">passes</span></div><Bars series={data.series} /></div>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm" data-testid="free-games-table">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{['Game', 'Starts', 'Passed', 'Failed', 'Pass rate', 'Players', 'Best level', 'Avg level'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {data.games.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No free game plays yet.</td></tr>}
            {data.games.map((g) => (
              <tr key={g.game_id} className="border-t border-slate-100" data-testid={`free-games-row-${g.game_id}`}>
                <td className="px-3 py-2 font-bold text-slate-900">{names[g.game_id] || g.game_id}</td>
                <td className="px-3 py-2">{g.starts}</td><td className="px-3 py-2">{g.passes}</td><td className="px-3 py-2">{g.fails}</td>
                <td className="px-3 py-2">{g.pass_rate == null ? '—' : `${g.pass_rate}%`}</td>
                <td className="px-3 py-2">{g.players || 0}</td><td className="px-3 py-2">{g.best_level || 0}</td><td className="px-3 py-2">{g.avg_level || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
