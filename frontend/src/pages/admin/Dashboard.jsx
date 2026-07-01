import { REVENUE_SERIES, ADMIN_ORDERS, ADMIN_USERS, COMPETITIONS } from '../../mock/mockData';
import { TrendingUp, Users, Ticket, PoundSterling } from 'lucide-react';
import { gbp } from '../../lib/format';

function Stat({ label, value, delta, Icon, gradient }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{label}</div>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-emerald-600 mt-1 font-medium">↑ {delta} vs last week</div>
    </div>
  );
}

export default function Dashboard() {
  const max = Math.max(...REVENUE_SERIES.map(x => x.revenue));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue (30d)" value={gbp(104000)} delta="12.4%" Icon={PoundSterling} gradient="from-teal-500 to-emerald-500" />
        <Stat label="Tickets Sold" value="210,432" delta="8.1%" Icon={Ticket} gradient="from-orange-500 to-rose-500" />
        <Stat label="Active Users" value={ADMIN_USERS.length.toLocaleString()} delta="5.6%" Icon={Users} gradient="from-amber-400 to-orange-500" />
        <Stat label="Live Competitions" value={COMPETITIONS.length} delta="3 new" Icon={TrendingUp} gradient="from-purple-500 to-indigo-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-slate-900">Revenue · last 7 months</h3>
            <div className="text-xs text-slate-500">Monthly totals in £</div>
          </div>
          <div className="flex items-end gap-3 h-56">
            {REVENUE_SERIES.map((d, i) => (
              <div key={i} className="flex-1 h-full flex flex-col items-center gap-2 justify-end">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-teal-500 to-emerald-400 transition-all hover:from-orange-500 hover:to-orange-400" style={{ height: `${(d.revenue / max) * 100}%`, minHeight: '4px' }} />
                <div className="text-[10px] text-slate-500">{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Top Competitions</h3>
          <div className="space-y-3">
            {COMPETITIONS.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <img src={c.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.ticketsSold.toLocaleString()} tickets</div>
                </div>
                <div className="text-sm font-bold text-teal-600">{gbp(c.price * c.ticketsSold)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="font-display font-bold text-slate-900 mb-4">Recent Orders</h3>
        <table className="w-full text-sm">
          <thead className="text-slate-500"><tr><th className="text-left py-2">ID</th><th className="text-left">User</th><th className="text-left">Competition</th><th className="text-left">Tickets</th><th className="text-left">Total</th><th className="text-left">Status</th></tr></thead>
          <tbody>
            {ADMIN_ORDERS.map(o => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-500">#{o.id}</td>
                <td>{o.user}</td>
                <td className="text-slate-500">{o.competition}</td>
                <td>{o.tickets}</td>
                <td>{gbp(o.total)}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : o.status === 'refunded' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
