import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';

export default function AnalyticsPage() {
  const [contests, setContests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    adminAPI.stats().then(setStats).catch(() => {});
    adminAPI.contests().then(setContests).catch(() => {});
    adminAPI.orders().then(setOrders).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-extrabold">Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Contests</div><div className="font-display font-extrabold text-2xl">{stats?.contests || 0}</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Prize pool</div><div className="font-display font-extrabold text-2xl text-[#6C2BFF]">{gbp(stats?.prize_pool || 0)}</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Tickets sold</div><div className="font-display font-extrabold text-2xl">{stats?.tickets_sold || 0}</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Revenue</div><div className="font-display font-extrabold text-2xl">{gbp(stats?.revenue || 0)}</div></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="font-semibold text-slate-900 mb-4">Contest capacity</div>
        <div className="space-y-3">
          {contests.slice(0, 12).map(c => {
            const pct = Math.round(((c.tickets_sold || 0) / c.tickets_total) * 100);
            return (
              <div key={c.contest_id}>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-700 truncate pr-4">{c.title}</span><span className="font-semibold text-[#6C2BFF]">{c.tickets_sold || 0} / {c.tickets_total}</span></div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF]" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
