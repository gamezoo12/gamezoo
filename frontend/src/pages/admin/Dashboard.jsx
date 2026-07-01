import { REVENUE_SERIES, ADMIN_ORDERS, ADMIN_USERS, COMPETITIONS } from '../../mock/mockData';
import { TrendingUp, Users, Ticket, PoundSterling } from 'lucide-react';
import { gbp } from '../../lib/format';

function Stat({ label, value, sub, Icon, gradient }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{label}</div>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const max = Math.max(1, ...REVENUE_SERIES.map(x => x.revenue));
  const totalPrizePool = COMPETITIONS.reduce((s, c) => s + c.prizeAmount, 0);
  const totalTicketsAvailable = COMPETITIONS.reduce((s, c) => s + c.ticketsTotal, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue (30d)" value={gbp(0)} sub="Fresh launch" Icon={PoundSterling} gradient="from-teal-500 to-emerald-500" />
        <Stat label="Tickets sold" value="0" sub={`of ${totalTicketsAvailable.toLocaleString()} available`} Icon={Ticket} gradient="from-orange-500 to-rose-500" />
        <Stat label="Registered users" value={ADMIN_USERS.length} sub="live now" Icon={Users} gradient="from-amber-400 to-orange-500" />
        <Stat label="Live contests" value={COMPETITIONS.length} sub={`£${totalPrizePool.toLocaleString()} prize pool`} Icon={TrendingUp} gradient="from-purple-500 to-indigo-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-slate-900">Revenue · last 7 months</h3>
            <div className="text-xs text-slate-500">Awaiting first sales</div>
          </div>
          <div className="flex items-end gap-3 h-56">
            {REVENUE_SERIES.map((d, i) => (
              <div key={i} className="flex-1 h-full flex flex-col items-center gap-2 justify-end">
                <div className="w-full rounded-t-lg bg-slate-100" style={{ height: `${(d.revenue / max) * 100}%`, minHeight: '4px' }} />
                <div className="text-[10px] text-slate-500">{d.m}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Featured contests</h3>
          <div className="space-y-3">
            {COMPETITIONS.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <img src={c.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.ticketsTotal} tickets available</div>
                </div>
                <div className="text-sm font-bold text-teal-600">£{c.prizeAmount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="font-display font-bold text-slate-900 mb-4">Recent orders</h3>
        {ADMIN_ORDERS.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">No orders yet – open contests, no sales recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-500"><tr><th className="text-left py-2">ID</th><th className="text-left">User</th><th className="text-left">Contest</th><th className="text-left">Tickets</th><th className="text-left">Total</th><th className="text-left">Status</th></tr></thead>
            <tbody>
              {ADMIN_ORDERS.map(o => (
                <tr key={o.id} className="border-t border-slate-100"><td className="py-2 text-slate-500">#{o.id}</td><td>{o.user}</td><td className="text-slate-500">{o.competition}</td><td>{o.tickets}</td><td>{gbp(o.total)}</td><td>{o.status}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
