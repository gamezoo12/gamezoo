import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { TrendingUp, Users, Ticket, PoundSterling } from 'lucide-react';
import { gbp } from '../../lib/format';

function Stat({ label, value, sub, Icon, gradient }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between"><div className="text-sm text-slate-500">{label}</div><div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div></div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [contests, setContests] = useState([]);

  useEffect(() => {
    adminAPI.stats().then(setStats).catch((err) => console.error('[dashboard] stats:', err?.message));
    adminAPI.orders().then(setOrders).catch((err) => console.error('[dashboard] orders:', err?.message));
    adminAPI.contests().then(setContests).catch((err) => console.error('[dashboard] contests:', err?.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={gbp(stats?.revenue || 0)} sub="All-time" Icon={PoundSterling} gradient="from-[#8B5CFF] to-[#6C2BFF]" />
        <Stat label="Tickets sold" value={(stats?.tickets_sold || 0).toLocaleString()} sub="Total entries" Icon={Ticket} gradient="from-orange-500 to-rose-500" />
        <Stat label="Users" value={stats?.users || 0} sub="Registered" Icon={Users} gradient="from-amber-400 to-orange-500" />
        <Stat label="Live contests" value={stats?.contests || 0} sub={`£${(stats?.prize_pool || 0).toLocaleString()} prize pool`} Icon={TrendingUp} gradient="from-purple-500 to-indigo-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Recent orders</h3>
          {orders.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="text-left py-2">Order</th><th className="text-left">User</th><th className="text-left">Total</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 10).map(o => (
                  <tr key={o.order_id} className="border-t border-slate-100"><td className="py-2 text-[#6C2BFF] font-medium">#{o.order_id.slice(0, 8)}</td><td>{o.user_name}</td><td>{gbp(o.total)}</td><td><span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{o.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Top-selling contests</h3>
          <div className="space-y-3">
            {[...contests].sort((a,b) => (b.tickets_sold||0) - (a.tickets_sold||0)).slice(0, 6).map(c => (
              <div key={c.contest_id} className="flex items-center gap-3">
                <img src={c.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.tickets_sold || 0} / {c.tickets_total} tickets</div>
                </div>
                <div className="text-sm font-bold text-[#6C2BFF]">£{c.prize_amount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
